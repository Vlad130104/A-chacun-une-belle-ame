import { createHash } from 'node:crypto';
import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import type { ClockProvider } from '../../../providers/ports';
import {
  canSubmit,
  computePurgeDate,
  validateDocument,
  type DocumentTypeValue,
} from '../domain/document-policy';
import {
  canResubmit,
  locksBirthDate,
  transition,
  type VerificationEvent,
  type VerificationStatusValue,
} from '../domain/verification-state-machine';
import type {
  KycDocumentStorage,
  VerificationRepository,
  VerificationRequestRecord,
  VerificationUserGateway,
} from './ports';

export interface VerificationConfig {
  maxDocumentSizeBytes: number;
  documentRetentionDays: number;
  resubmitCooldownHours: number;
}

/** Ouvre une demande, ou renvoie celle en cours (story D2-01). */
export class StartVerificationUseCase {
  constructor(
    private readonly repository: VerificationRepository,
    private readonly clock: ClockProvider,
    private readonly config: VerificationConfig,
  ) {}

  async execute(userId: string): Promise<VerificationRequestRecord> {
    const existing = await this.repository.findLatestByUser(userId);

    if (existing !== null) {
      if (existing.status === 'VERIFIED') {
        throw BusinessError.conflict(ErrorCode.KYC_ALREADY_VERIFIED);
      }
      // Une demande encore ouverte est réutilisée : on n'empile pas les dossiers.
      if (existing.status === 'PENDING' || existing.status === 'IN_REVIEW') return existing;

      if (
        !canResubmit(
          existing.status,
          existing.decidedAt,
          this.clock.now(),
          this.config.resubmitCooldownHours,
        )
      ) {
        throw BusinessError.conflict(ErrorCode.KYC_REVIEW_PENDING);
      }
    }

    return this.repository.createRequest(userId);
  }
}

/** Dépôt d'une pièce ou d'un selfie (story D2-01). */
export class UploadDocumentUseCase {
  constructor(
    private readonly repository: VerificationRepository,
    private readonly storage: KycDocumentStorage,
    private readonly config: VerificationConfig,
  ) {}

  async execute(input: {
    userId: string;
    requestId: string;
    type: DocumentTypeValue;
    declaredContentType: string;
    bytes: Buffer;
  }): Promise<{ documentId: string; type: DocumentTypeValue }> {
    const request = await this.repository.findRequestById(input.requestId);

    // 404 plutôt que 403 : la demande d'autrui ne voit pas son existence confirmée.
    if (request === null || request.userId !== input.userId) {
      throw BusinessError.notFound(ErrorCode.NOT_FOUND);
    }
    if (request.status === 'VERIFIED') {
      throw BusinessError.conflict(ErrorCode.KYC_ALREADY_VERIFIED);
    }
    if (request.status === 'IN_REVIEW') {
      throw BusinessError.conflict(ErrorCode.KYC_REVIEW_PENDING);
    }

    const verdict = validateDocument({
      type: input.type,
      declaredContentType: input.declaredContentType,
      bytes: input.bytes,
      maxSizeBytes: this.config.maxDocumentSizeBytes,
    });

    if (!verdict.accepted) {
      throw BusinessError.badRequest(
        verdict.reason === 'TOO_LARGE'
          ? ErrorCode.KYC_DOCUMENT_TOO_LARGE
          : ErrorCode.KYC_DOCUMENT_INVALID_TYPE,
        { motif: verdict.reason },
      );
    }

    const checksum = createHash('sha256').update(input.bytes).digest('hex');
    const dejaVu = await this.repository.findDocumentByChecksum(checksum);
    if (dejaVu !== null && dejaVu.requestId !== input.requestId) {
      // Le même fichier a déjà servi ailleurs : signal fort d'usurpation.
      throw BusinessError.conflict(ErrorCode.KYC_DUPLICATE_DOCUMENT);
    }

    // Clé opaque dans le bucket KYC : jamais dérivée du nom du fichier envoyé.
    const storageKey = `kyc/${input.requestId}/${input.type.toLowerCase()}-${checksum.slice(0, 16)}`;
    await this.storage.put(storageKey, input.bytes, input.declaredContentType);

    const document = await this.repository.addDocument({
      requestId: input.requestId,
      type: input.type,
      storageKey,
      contentType: input.declaredContentType,
      sizeBytes: input.bytes.length,
      checksum,
    });

    // La réponse ne contient JAMAIS la clé de stockage ni d'URL (docs/05-api.md §3).
    return { documentId: document.id, type: document.type };
  }
}

/** Soumission de la demande pour revue (story D2-01). */
export class SubmitVerificationUseCase {
  constructor(
    private readonly repository: VerificationRepository,
    private readonly users: VerificationUserGateway,
  ) {}

  async execute(userId: string, requestId: string): Promise<{ status: VerificationStatusValue }> {
    const request = await this.repository.findRequestById(requestId);
    if (request === null || request.userId !== userId) {
      throw BusinessError.notFound(ErrorCode.NOT_FOUND);
    }

    const documents = await this.repository.listDocuments(requestId);
    if (!canSubmit(documents.map((document) => document.type))) {
      throw BusinessError.unprocessable(ErrorCode.KYC_INVALID_TRANSITION, {
        requis: 'une pièce officielle et un selfie',
      });
    }

    const evenement: VerificationEvent = request.status === 'NOT_STARTED' ? 'SUBMIT' : 'RESUBMIT';
    const result = transition(request.status, evenement);
    if (!result.allowed) throw BusinessError.conflict(ErrorCode.KYC_INVALID_TRANSITION);

    await this.repository.updateStatus(requestId, result.next, null, null);
    await this.users.applyVerificationStatus(userId, result.next);

    return { status: result.next };
  }
}

export interface DecisionCommand {
  requestId: string;
  agentUserId: string;
  outcome: 'APPROVE' | 'REJECT' | 'REQUEST_ADDITIONAL';
  reasonCode: string;
  reasonNote?: string;
}

/**
 * Décision d'un agent de vérification (stories D2-03 et D2-04).
 *
 * Deux garanties : la transition est vérifiée par la machine à états, et une
 * approbation VERROUILLE définitivement la date de naissance.
 */
export class DecideVerificationUseCase {
  constructor(
    private readonly repository: VerificationRepository,
    private readonly users: VerificationUserGateway,
    private readonly clock: ClockProvider,
    private readonly config: VerificationConfig,
  ) {}

  async execute(command: DecisionCommand): Promise<{ status: VerificationStatusValue }> {
    const request = await this.repository.findRequestById(command.requestId);
    if (request === null) throw BusinessError.notFound(ErrorCode.NOT_FOUND);

    // Prise en charge implicite : une demande en file passe en revue avant décision,
    // ce qui rend impossible un PENDING → VERIFIED direct.
    let courant = request.status;
    if (courant === 'PENDING') {
      const priseEnCharge = transition(courant, 'START_REVIEW');
      if (!priseEnCharge.allowed) throw BusinessError.conflict(ErrorCode.KYC_INVALID_TRANSITION);
      courant = priseEnCharge.next;
    }

    const evenement: VerificationEvent =
      command.outcome === 'APPROVE'
        ? 'APPROVE'
        : command.outcome === 'REJECT'
          ? 'REJECT'
          : 'REQUEST_ADDITIONAL';

    const result = transition(courant, evenement);
    if (!result.allowed) throw BusinessError.conflict(ErrorCode.KYC_INVALID_TRANSITION);

    const now = this.clock.now();
    const purgeAt =
      evenement === 'REQUEST_ADDITIONAL'
        ? null
        : computePurgeDate(now, this.config.documentRetentionDays);

    await this.repository.updateStatus(command.requestId, result.next, now, purgeAt);
    await this.repository.recordDecision({
      requestId: command.requestId,
      outcome:
        evenement === 'APPROVE'
          ? 'APPROVED'
          : evenement === 'REJECT'
            ? 'REJECTED'
            : 'ADDITIONAL_REQUIRED',
      reasonCode: command.reasonCode,
      reasonNote: command.reasonNote ?? null,
      decidedByUserId: command.agentUserId,
      decidedBySystem: false,
    });

    await this.users.applyVerificationStatus(request.userId, result.next);
    if (locksBirthDate(evenement)) {
      await this.users.lockBirthDate(request.userId);
    }

    return { status: result.next };
  }
}

/**
 * Purge des documents au terme de la conservation (story D2-06).
 *
 * L'objet est réellement supprimé du stockage ; la ligne survit sans sa clé, pour
 * conserver la trace qu'un document a existé et a été purgé.
 */
export class PurgeDocumentsUseCase {
  constructor(
    private readonly repository: VerificationRepository,
    private readonly storage: KycDocumentStorage,
    private readonly clock: ClockProvider,
  ) {}

  async execute(batchSize = 100): Promise<{ purged: number }> {
    const now = this.clock.now();
    const documents = await this.repository.listDocumentsToPurge(now, batchSize);

    let purged = 0;
    for (const document of documents) {
      await this.storage.delete(document.storageKey);
      await this.repository.markDocumentPurged(document.id, now);
      purged += 1;
    }

    return { purged };
  }
}
