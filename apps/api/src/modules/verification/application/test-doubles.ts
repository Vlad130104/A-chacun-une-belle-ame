import type { DocumentTypeValue } from '../domain/document-policy';
import type { VerificationStatusValue } from '../domain/verification-state-machine';
import type {
  KycDocumentStorage,
  VerificationDocumentRecord,
  VerificationRepository,
  VerificationRequestRecord,
  VerificationUserGateway,
} from './ports';

/** Doubles en mémoire du module de vérification (docs/09-plan-de-tests.md §1). */

export class InMemoryVerificationRepository implements VerificationRepository {
  readonly requests = new Map<string, VerificationRequestRecord>();
  readonly documents: VerificationDocumentRecord[] = [];
  readonly decisions: Array<{ requestId: string; outcome: string; reasonCode: string }> = [];
  private counter = 0;

  createRequest(userId: string): Promise<VerificationRequestRecord> {
    const request: VerificationRequestRecord = {
      id: `req-${++this.counter}`,
      userId,
      status: 'NOT_STARTED',
      documentNumberHash: null,
      submittedAt: new Date('2026-08-06T12:00:00.000Z'),
      decidedAt: null,
      purgeAt: null,
    };
    this.requests.set(request.id, request);
    return Promise.resolve(request);
  }

  findRequestById(id: string): Promise<VerificationRequestRecord | null> {
    return Promise.resolve(this.requests.get(id) ?? null);
  }

  findLatestByUser(userId: string): Promise<VerificationRequestRecord | null> {
    const found = [...this.requests.values()].filter((request) => request.userId === userId);
    return Promise.resolve(found.at(-1) ?? null);
  }

  updateStatus(
    requestId: string,
    status: VerificationStatusValue,
    decidedAt: Date | null,
    purgeAt: Date | null,
  ): Promise<void> {
    const request = this.requests.get(requestId);
    if (request) this.requests.set(requestId, { ...request, status, decidedAt, purgeAt });
    return Promise.resolve();
  }

  addDocument(input: {
    requestId: string;
    type: DocumentTypeValue;
    storageKey: string;
    checksum: string;
  }): Promise<VerificationDocumentRecord> {
    const document: VerificationDocumentRecord = {
      id: `doc-${this.documents.length + 1}`,
      requestId: input.requestId,
      type: input.type,
      storageKey: input.storageKey,
      checksum: input.checksum,
      purgedAt: null,
    };
    this.documents.push(document);
    return Promise.resolve(document);
  }

  listDocuments(requestId: string): Promise<VerificationDocumentRecord[]> {
    return Promise.resolve(this.documents.filter((document) => document.requestId === requestId));
  }

  findDocumentByChecksum(checksum: string): Promise<VerificationDocumentRecord | null> {
    return Promise.resolve(
      this.documents.find((document) => document.checksum === checksum) ?? null,
    );
  }

  recordDecision(input: { requestId: string; outcome: string; reasonCode: string }): Promise<void> {
    this.decisions.push(input);
    return Promise.resolve();
  }

  listQueue(limit: number): Promise<
    Array<{
      requestId: string;
      userId: string;
      submittedAt: Date;
      documentTypes: DocumentTypeValue[];
    }>
  > {
    return Promise.resolve(
      [...this.requests.values()]
        .filter((request) => request.status === 'PENDING')
        .slice(0, limit)
        .map((request) => ({
          requestId: request.id,
          userId: request.userId,
          submittedAt: request.submittedAt,
          documentTypes: this.documents
            .filter((document) => document.requestId === request.id)
            .map((document) => document.type),
        })),
    );
  }

  findRequestByDocumentNumberHash(hash: string): Promise<VerificationRequestRecord | null> {
    return Promise.resolve(
      [...this.requests.values()].find((request) => request.documentNumberHash === hash) ?? null,
    );
  }

  listDocumentsToPurge(before: Date, limit: number): Promise<VerificationDocumentRecord[]> {
    const aPurger = this.documents.filter((document) => {
      const request = this.requests.get(document.requestId);
      return (
        document.purgedAt === null &&
        request?.purgeAt !== null &&
        request?.purgeAt !== undefined &&
        request.purgeAt.getTime() <= before.getTime()
      );
    });
    return Promise.resolve(aPurger.slice(0, limit));
  }

  markDocumentPurged(documentId: string, at: Date): Promise<void> {
    const index = this.documents.findIndex((document) => document.id === documentId);
    const document = this.documents[index];
    if (document) this.documents[index] = { ...document, purgedAt: at, storageKey: '' };
    return Promise.resolve();
  }
}

export class InMemoryKycStorage implements KycDocumentStorage {
  readonly objects = new Map<string, Buffer>();
  readonly deleted: string[] = [];

  put(key: string, bytes: Buffer): Promise<void> {
    this.objects.set(key, bytes);
    return Promise.resolve();
  }

  signedUrl(key: string, ttlSeconds: number): Promise<string> {
    return Promise.resolve(`https://stockage.invalid/${key}?expire=${ttlSeconds}`);
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    this.deleted.push(key);
    return Promise.resolve();
  }
}

export class InMemoryUserGateway implements VerificationUserGateway {
  readonly statuses = new Map<string, VerificationStatusValue>();
  readonly lockedBirthDates: string[] = [];

  applyVerificationStatus(userId: string, status: VerificationStatusValue): Promise<void> {
    this.statuses.set(userId, status);
    return Promise.resolve();
  }

  lockBirthDate(userId: string): Promise<void> {
    this.lockedBirthDates.push(userId);
    return Promise.resolve();
  }

  getBirthDate(): Promise<Date | null> {
    return Promise.resolve(new Date('1990-05-20T00:00:00.000Z'));
  }
}
