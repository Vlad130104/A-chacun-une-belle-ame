import type { DocumentTypeValue } from '../domain/document-policy';
import type { VerificationStatusValue } from '../domain/verification-state-machine';

/** Dépendances sortantes du module de vérification. */
export const VERIFICATION_REPOSITORY = Symbol('VerificationRepository');
export const DOCUMENT_STORAGE = Symbol('KycDocumentStorage');
export const VERIFICATION_USER_GATEWAY = Symbol('VerificationUserGateway');

export interface VerificationRequestRecord {
  id: string;
  userId: string;
  status: VerificationStatusValue;
  documentNumberHash: string | null;
  submittedAt: Date;
  decidedAt: Date | null;
  purgeAt: Date | null;
}

export interface VerificationDocumentRecord {
  id: string;
  requestId: string;
  type: DocumentTypeValue;
  storageKey: string;
  checksum: string;
  purgedAt: Date | null;
}

export interface VerificationRepository {
  createRequest(userId: string): Promise<VerificationRequestRecord>;
  findRequestById(id: string): Promise<VerificationRequestRecord | null>;
  findLatestByUser(userId: string): Promise<VerificationRequestRecord | null>;
  updateStatus(
    requestId: string,
    status: VerificationStatusValue,
    decidedAt: Date | null,
    purgeAt: Date | null,
  ): Promise<void>;

  addDocument(input: {
    requestId: string;
    type: DocumentTypeValue;
    storageKey: string;
    contentType: string;
    sizeBytes: number;
    checksum: string;
  }): Promise<VerificationDocumentRecord>;
  listDocuments(requestId: string): Promise<VerificationDocumentRecord[]>;
  /** Empêche qu'un document déjà refusé soit re-déposé à l'identique. */
  findDocumentByChecksum(checksum: string): Promise<VerificationDocumentRecord | null>;

  recordDecision(input: {
    requestId: string;
    outcome: 'APPROVED' | 'REJECTED' | 'ADDITIONAL_REQUIRED' | 'SUSPENDED';
    reasonCode: string;
    reasonNote: string | null;
    decidedByUserId: string | null;
    decidedBySystem: boolean;
  }): Promise<void>;

  /** File de vérification, triée par ancienneté (le plus ancien d'abord). */
  listQueue(limit: number): Promise<
    Array<{
      requestId: string;
      userId: string;
      submittedAt: Date;
      documentTypes: DocumentTypeValue[];
    }>
  >;

  /** Une même pièce ne peut pas vérifier deux comptes différents. */
  findRequestByDocumentNumberHash(hash: string): Promise<VerificationRequestRecord | null>;

  /** Documents dont la date de purge est dépassée. */
  listDocumentsToPurge(before: Date, limit: number): Promise<VerificationDocumentRecord[]>;
  markDocumentPurged(documentId: string, at: Date): Promise<void>;
}

/**
 * Écriture dans le bucket KYC — distinct du bucket média, avec sa propre clé de
 * chiffrement (ADR-004). Aucune URL publique n'est jamais générée pour ces objets.
 */
export interface KycDocumentStorage {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  /** URL signée de très courte durée, réservée à un agent, avec motif journalisé. */
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

/**
 * Accès minimal au module `users` : le module de vérification n'écrit jamais
 * directement dans les tables d'un autre module (docs/01-architecture.md §3).
 */
export interface VerificationUserGateway {
  applyVerificationStatus(userId: string, status: VerificationStatusValue): Promise<void>;
  lockBirthDate(userId: string): Promise<void>;
  getBirthDate(userId: string): Promise<Date | null>;
}
