import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { DocumentTypeValue } from '../domain/document-policy';
import type { VerificationStatusValue } from '../domain/verification-state-machine';
import type {
  VerificationDocumentRecord,
  VerificationRepository,
  VerificationRequestRecord,
  VerificationUserGateway,
} from '../application/ports';

/**
 * Accès au schéma `kyc`, physiquement séparé du schéma `app` (ADR-004).
 *
 * Ce repository est le SEUL du produit à toucher les tables de vérification. Le rôle
 * PostgreSQL applicatif n'a d'ailleurs aucun droit dessus : la garantie est posée au
 * niveau de la base, pas seulement dans le code.
 */
@Injectable()
export class PrismaVerificationRepository implements VerificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createRequest(userId: string): Promise<VerificationRequestRecord> {
    const request = await this.prisma.verificationRequest.create({
      data: { userId, status: 'NOT_STARTED' },
    });
    return this.toRequest(request);
  }

  async findRequestById(id: string): Promise<VerificationRequestRecord | null> {
    const request = await this.prisma.verificationRequest.findUnique({ where: { id } });
    return request === null ? null : this.toRequest(request);
  }

  async findLatestByUser(userId: string): Promise<VerificationRequestRecord | null> {
    const request = await this.prisma.verificationRequest.findFirst({
      where: { userId },
      orderBy: { submittedAt: 'desc' },
    });
    return request === null ? null : this.toRequest(request);
  }

  async updateStatus(
    requestId: string,
    status: VerificationStatusValue,
    decidedAt: Date | null,
    purgeAt: Date | null,
  ): Promise<void> {
    await this.prisma.verificationRequest.update({
      where: { id: requestId },
      data: { status, decidedAt, purgeAt },
    });
  }

  async addDocument(
    input: Parameters<VerificationRepository['addDocument']>[0],
  ): Promise<VerificationDocumentRecord> {
    const document = await this.prisma.verificationDocument.create({
      data: {
        requestId: input.requestId,
        type: input.type,
        storageKey: input.storageKey,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        checksum: input.checksum,
      },
    });
    return this.toDocument(document);
  }

  async listDocuments(requestId: string): Promise<VerificationDocumentRecord[]> {
    const documents = await this.prisma.verificationDocument.findMany({ where: { requestId } });
    return documents.map((document) => this.toDocument(document));
  }

  async findDocumentByChecksum(checksum: string): Promise<VerificationDocumentRecord | null> {
    const document = await this.prisma.verificationDocument.findFirst({ where: { checksum } });
    return document === null ? null : this.toDocument(document);
  }

  async recordDecision(
    input: Parameters<VerificationRepository['recordDecision']>[0],
  ): Promise<void> {
    // Décision immuable : on ajoute, on ne modifie jamais (docs/03-modele-de-donnees.md §3).
    await this.prisma.verificationDecision.create({
      data: {
        requestId: input.requestId,
        outcome: input.outcome,
        reasonCode: input.reasonCode,
        reasonNote: input.reasonNote,
        decidedByUserId: input.decidedByUserId,
        decidedBySystem: input.decidedBySystem,
      },
    });
  }

  async listQueue(limit: number): Promise<
    Array<{
      requestId: string;
      userId: string;
      submittedAt: Date;
      documentTypes: DocumentTypeValue[];
    }>
  > {
    const requests = await this.prisma.verificationRequest.findMany({
      where: { status: 'PENDING' },
      // Tri par ancienneté : le dossier le plus ancien passe en premier, ce qui est
      // la seule façon de tenir un SLA sans laisser de dossier au fond de la pile.
      orderBy: { submittedAt: 'asc' },
      take: limit,
      include: { documents: { select: { type: true } } },
    });

    return requests.map((request) => ({
      requestId: request.id,
      userId: request.userId,
      submittedAt: request.submittedAt,
      documentTypes: request.documents.map((document) => document.type),
    }));
  }

  async findRequestByDocumentNumberHash(hash: string): Promise<VerificationRequestRecord | null> {
    const request = await this.prisma.verificationRequest.findFirst({
      where: { documentNumberHash: hash },
    });
    return request === null ? null : this.toRequest(request);
  }

  async listDocumentsToPurge(before: Date, limit: number): Promise<VerificationDocumentRecord[]> {
    const documents = await this.prisma.verificationDocument.findMany({
      where: {
        purgedAt: null,
        request: { purgeAt: { not: null, lte: before } },
      },
      take: limit,
    });
    return documents.map((document) => this.toDocument(document));
  }

  async markDocumentPurged(documentId: string, at: Date): Promise<void> {
    // La ligne survit sans sa clé : on garde la trace qu'un document a existé et a
    // été détruit, sans conserver le moyen d'y accéder.
    await this.prisma.verificationDocument.update({
      where: { id: documentId },
      data: { purgedAt: at, storageKey: `purged:${documentId}` },
    });
  }

  private toRequest(request: {
    id: string;
    userId: string;
    status: string;
    documentNumberHash: string | null;
    submittedAt: Date;
    decidedAt: Date | null;
    purgeAt: Date | null;
  }): VerificationRequestRecord {
    return {
      id: request.id,
      userId: request.userId,
      status: request.status as VerificationStatusValue,
      documentNumberHash: request.documentNumberHash,
      submittedAt: request.submittedAt,
      decidedAt: request.decidedAt,
      purgeAt: request.purgeAt,
    };
  }

  private toDocument(document: {
    id: string;
    requestId: string;
    type: string;
    storageKey: string;
    checksum: string;
    purgedAt: Date | null;
  }): VerificationDocumentRecord {
    return {
      id: document.id,
      requestId: document.requestId,
      type: document.type as DocumentTypeValue,
      storageKey: document.storageKey,
      checksum: document.checksum,
      purgedAt: document.purgedAt,
    };
  }
}

/**
 * Passerelle vers le module `users`.
 *
 * Le module de vérification n'écrit pas directement dans les tables d'un autre
 * module : il passe par cette façade, seul point de contact (docs/01-architecture.md §3).
 */
@Injectable()
export class PrismaVerificationUserGateway implements VerificationUserGateway {
  constructor(private readonly prisma: PrismaService) {}

  async applyVerificationStatus(userId: string, status: VerificationStatusValue): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { verificationStatus: status } });
  }

  async lockBirthDate(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { birthDateLock: true } });
  }

  async getBirthDate(userId: string): Promise<Date | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { birthDate: true },
    });
    return user?.birthDate ?? null;
  }
}
