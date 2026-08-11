import { beforeEach, describe, expect, it } from '@jest/globals';
import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import { FakeClock, RecordingAnalyticsTracker } from '../../auth/application/test-doubles';
import {
  DecideVerificationUseCase,
  PurgeDocumentsUseCase,
  StartVerificationUseCase,
  SubmitVerificationUseCase,
  UploadDocumentUseCase,
  type VerificationConfig,
} from './verification.use-cases';
import {
  InMemoryKycStorage,
  InMemoryUserGateway,
  InMemoryVerificationRepository,
} from './test-doubles';

const jpeg = (remplissage = 0): Buffer =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, remplissage)]);

const CONFIG: VerificationConfig = {
  maxDocumentSizeBytes: 10_485_760,
  documentRetentionDays: 90,
  resubmitCooldownHours: 24,
};

const attendreCode = async (promesse: Promise<unknown>): Promise<string> => {
  try {
    await promesse;
    throw new Error('une erreur métier était attendue');
  } catch (error) {
    if (error instanceof BusinessError) return error.code;
    throw error;
  }
};

describe('vérification d’identité', () => {
  let repository: InMemoryVerificationRepository;
  let storage: InMemoryKycStorage;
  let users: InMemoryUserGateway;
  let clock: FakeClock;
  let analytics: RecordingAnalyticsTracker;

  let demarrer: StartVerificationUseCase;
  let deposer: UploadDocumentUseCase;
  let soumettre: SubmitVerificationUseCase;
  let decider: DecideVerificationUseCase;
  let purger: PurgeDocumentsUseCase;

  beforeEach(() => {
    repository = new InMemoryVerificationRepository();
    storage = new InMemoryKycStorage();
    users = new InMemoryUserGateway();
    clock = new FakeClock();
    analytics = new RecordingAnalyticsTracker();

    demarrer = new StartVerificationUseCase(repository, clock, CONFIG);
    deposer = new UploadDocumentUseCase(repository, storage, CONFIG);
    soumettre = new SubmitVerificationUseCase(repository, users, analytics);
    decider = new DecideVerificationUseCase(repository, users, clock, analytics, CONFIG);
    purger = new PurgeDocumentsUseCase(repository, storage, clock);
  });

  /** Parcours complet jusqu'à la soumission. */
  const preparerDossier = async (userId = 'user-1'): Promise<string> => {
    const demande = await demarrer.execute(userId);
    await deposer.execute({
      userId,
      requestId: demande.id,
      type: 'NATIONAL_ID',
      declaredContentType: 'image/jpeg',
      bytes: jpeg(1),
    });
    await deposer.execute({
      userId,
      requestId: demande.id,
      type: 'SELFIE',
      declaredContentType: 'image/jpeg',
      bytes: jpeg(2),
    });
    await soumettre.execute(userId, demande.id);
    return demande.id;
  };

  describe('ouverture de la demande', () => {
    it('crée une demande au statut NOT_STARTED', async () => {
      const demande = await demarrer.execute('user-1');
      expect(demande.status).toBe('NOT_STARTED');
    });

    it('réutilise une demande déjà en file plutôt que d’en empiler une seconde', async () => {
      const requestId = await preparerDossier();
      const seconde = await demarrer.execute('user-1');
      expect(seconde.id).toBe(requestId);
      expect(repository.requests.size).toBe(1);
    });

    it('refuse une nouvelle demande pour un compte déjà vérifié', async () => {
      const requestId = await preparerDossier();
      await decider.execute({
        requestId,
        agentUserId: 'agent-1',
        outcome: 'APPROVE',
        reasonCode: 'DOCUMENTS_CONFORMES',
      });

      expect(await attendreCode(demarrer.execute('user-1'))).toBe(ErrorCode.KYC_ALREADY_VERIFIED);
    });

    it('impose un délai avant re-soumission après un rejet', async () => {
      const requestId = await preparerDossier();
      await decider.execute({
        requestId,
        agentUserId: 'agent-1',
        outcome: 'REJECT',
        reasonCode: 'PIECE_ILLISIBLE',
      });

      expect(await attendreCode(demarrer.execute('user-1'))).toBe(ErrorCode.KYC_REVIEW_PENDING);

      clock.advanceDays(2);
      const nouvelle = await demarrer.execute('user-1');
      expect(nouvelle.status).toBe('NOT_STARTED');
    });
  });

  describe('dépôt des pièces', () => {
    it('écrit dans le stockage KYC sans jamais renvoyer de clé ni d’URL', async () => {
      const demande = await demarrer.execute('user-1');
      const resultat = await deposer.execute({
        userId: 'user-1',
        requestId: demande.id,
        type: 'NATIONAL_ID',
        declaredContentType: 'image/jpeg',
        bytes: jpeg(1),
      });

      expect(Object.keys(resultat)).toEqual(['documentId', 'type']);
      expect(storage.objects.size).toBe(1);
    });

    it('refuse un exécutable renommé en image', async () => {
      const demande = await demarrer.execute('user-1');
      const code = await attendreCode(
        deposer.execute({
          userId: 'user-1',
          requestId: demande.id,
          type: 'NATIONAL_ID',
          declaredContentType: 'image/jpeg',
          bytes: Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(64)]),
        }),
      );
      expect(code).toBe(ErrorCode.KYC_DOCUMENT_INVALID_TYPE);
    });

    it('n’écrit rien dans le stockage lorsqu’un fichier est refusé', async () => {
      const demande = await demarrer.execute('user-1');
      await attendreCode(
        deposer.execute({
          userId: 'user-1',
          requestId: demande.id,
          type: 'NATIONAL_ID',
          declaredContentType: 'image/jpeg',
          bytes: Buffer.alloc(0),
        }),
      );
      expect(storage.objects.size).toBe(0);
    });

    it('refuse une pièce déjà utilisée par un autre dossier', async () => {
      await preparerDossier('user-1');
      const autre = await demarrer.execute('user-2');

      const code = await attendreCode(
        deposer.execute({
          userId: 'user-2',
          requestId: autre.id,
          type: 'NATIONAL_ID',
          declaredContentType: 'image/jpeg',
          bytes: jpeg(1),
        }),
      );
      expect(code).toBe(ErrorCode.KYC_DUPLICATE_DOCUMENT);
    });

    it('renvoie 404 sur la demande d’autrui, sans confirmer son existence', async () => {
      const demande = await demarrer.execute('user-1');
      const code = await attendreCode(
        deposer.execute({
          userId: 'user-2',
          requestId: demande.id,
          type: 'NATIONAL_ID',
          declaredContentType: 'image/jpeg',
          bytes: jpeg(3),
        }),
      );
      expect(code).toBe(ErrorCode.NOT_FOUND);
    });
  });

  describe('soumission', () => {
    it('exige une pièce officielle et un selfie', async () => {
      const demande = await demarrer.execute('user-1');
      await deposer.execute({
        userId: 'user-1',
        requestId: demande.id,
        type: 'NATIONAL_ID',
        declaredContentType: 'image/jpeg',
        bytes: jpeg(1),
      });

      const code = await attendreCode(soumettre.execute('user-1', demande.id));
      expect(code).toBe(ErrorCode.KYC_INVALID_TRANSITION);
    });

    it('place la demande en file et propage le statut au compte', async () => {
      const requestId = await preparerDossier();
      expect(repository.requests.get(requestId)?.status).toBe('PENDING');
      expect(users.statuses.get('user-1')).toBe('PENDING');
    });
  });

  describe('décision de l’agent', () => {
    it('approuve et verrouille définitivement la date de naissance', async () => {
      const requestId = await preparerDossier();
      const resultat = await decider.execute({
        requestId,
        agentUserId: 'agent-1',
        outcome: 'APPROVE',
        reasonCode: 'DOCUMENTS_CONFORMES',
      });

      expect(resultat.status).toBe('VERIFIED');
      expect(users.statuses.get('user-1')).toBe('VERIFIED');
      expect(users.lockedBirthDates).toEqual(['user-1']);
    });

    it('ne verrouille pas la date de naissance sur un rejet', async () => {
      const requestId = await preparerDossier();
      await decider.execute({
        requestId,
        agentUserId: 'agent-1',
        outcome: 'REJECT',
        reasonCode: 'PIECE_ILLISIBLE',
      });

      expect(users.lockedBirthDates).toEqual([]);
    });

    it('journalise chaque décision avec son motif normalisé', async () => {
      const requestId = await preparerDossier();
      await decider.execute({
        requestId,
        agentUserId: 'agent-1',
        outcome: 'REQUEST_ADDITIONAL',
        reasonCode: 'SELFIE_FLOU',
      });

      expect(repository.decisions).toHaveLength(1);
      expect(repository.decisions[0]).toMatchObject({
        requestId,
        outcome: 'ADDITIONAL_REQUIRED',
        reasonCode: 'SELFIE_FLOU',
        // L'agent décideur est tracé nominativement : c'est ce qui rend la décision
        // auditable (docs/06-roles-et-permissions.md §5).
        decidedByUserId: 'agent-1',
        decidedBySystem: false,
      });
    });

    it('programme la purge des documents à la durée de conservation configurée', async () => {
      const requestId = await preparerDossier();
      await decider.execute({
        requestId,
        agentUserId: 'agent-1',
        outcome: 'APPROVE',
        reasonCode: 'DOCUMENTS_CONFORMES',
      });

      const purgeAt = repository.requests.get(requestId)?.purgeAt;
      expect(purgeAt?.toISOString()).toBe('2026-11-04T12:00:00.000Z');
    });

    it('ne programme pas de purge quand un complément est demandé', async () => {
      const requestId = await preparerDossier();
      await decider.execute({
        requestId,
        agentUserId: 'agent-1',
        outcome: 'REQUEST_ADDITIONAL',
        reasonCode: 'SELFIE_FLOU',
      });

      // Purger les pièces alors qu'on en redemande serait absurde.
      expect(repository.requests.get(requestId)?.purgeAt).toBeNull();
    });

    it('interdit d’approuver une demande déjà rejetée', async () => {
      const requestId = await preparerDossier();
      await decider.execute({
        requestId,
        agentUserId: 'agent-1',
        outcome: 'REJECT',
        reasonCode: 'PIECE_ILLISIBLE',
      });

      const code = await attendreCode(
        decider.execute({
          requestId,
          agentUserId: 'agent-2',
          outcome: 'APPROVE',
          reasonCode: 'REVISION',
        }),
      );
      expect(code).toBe(ErrorCode.KYC_INVALID_TRANSITION);
    });

    it('refuse une décision sur une demande inexistante', async () => {
      const code = await attendreCode(
        decider.execute({
          requestId: 'inexistant',
          agentUserId: 'agent-1',
          outcome: 'APPROVE',
          reasonCode: 'X',
        }),
      );
      expect(code).toBe(ErrorCode.NOT_FOUND);
    });
  });

  describe('purge des documents', () => {
    it('ne purge rien avant l’échéance', async () => {
      const requestId = await preparerDossier();
      await decider.execute({
        requestId,
        agentUserId: 'agent-1',
        outcome: 'APPROVE',
        reasonCode: 'DOCUMENTS_CONFORMES',
      });

      clock.advanceDays(89);
      expect(await purger.execute()).toEqual({ purged: 0 });
      expect(storage.objects.size).toBe(2);
    });

    it('supprime réellement les objets à l’échéance', async () => {
      const requestId = await preparerDossier();
      await decider.execute({
        requestId,
        agentUserId: 'agent-1',
        outcome: 'APPROVE',
        reasonCode: 'DOCUMENTS_CONFORMES',
      });

      clock.advanceDays(91);
      expect(await purger.execute()).toEqual({ purged: 2 });
      expect(storage.objects.size).toBe(0);
      expect(storage.deleted).toHaveLength(2);
    });

    it('conserve la trace du document purgé, sans sa clé de stockage', async () => {
      const requestId = await preparerDossier();
      await decider.execute({
        requestId,
        agentUserId: 'agent-1',
        outcome: 'APPROVE',
        reasonCode: 'DOCUMENTS_CONFORMES',
      });

      clock.advanceDays(91);
      await purger.execute();

      expect(repository.documents).toHaveLength(2);
      expect(repository.documents.every((document) => document.storageKey === '')).toBe(true);
      expect(repository.documents.every((document) => document.purgedAt !== null)).toBe(true);
    });

    it('est idempotente : une seconde exécution ne purge rien', async () => {
      const requestId = await preparerDossier();
      await decider.execute({
        requestId,
        agentUserId: 'agent-1',
        outcome: 'APPROVE',
        reasonCode: 'DOCUMENTS_CONFORMES',
      });

      clock.advanceDays(91);
      await purger.execute();
      expect(await purger.execute()).toEqual({ purged: 0 });
    });
  });

  describe('tunnel de migration (story D10-04)', () => {
    it('mesure le dépôt par le TYPE de pièce, jamais par son numéro', async () => {
      await preparerDossier();

      expect(analytics.events).toEqual([{ userId: 'user-1', name: 'verification.submitted' }]);
    });

    it('mesure l’approbation, qui est la marche décisive du parcours', async () => {
      const requestId = await preparerDossier();
      analytics.events.length = 0;

      await decider.execute({
        requestId,
        agentUserId: 'agent-1',
        outcome: 'APPROVE',
        reasonCode: 'DOCUMENT_VALIDE',
      });

      expect(analytics.events).toEqual([{ userId: 'user-1', name: 'verification.approved' }]);
    });

    it('mesure aussi le refus — c’est là que le parcours se perd', async () => {
      const requestId = await preparerDossier();
      analytics.events.length = 0;

      await decider.execute({
        requestId,
        agentUserId: 'agent-1',
        outcome: 'REJECT',
        reasonCode: 'DOCUMENT_ILLISIBLE',
        reasonNote: 'Nom illisible sur la pièce de Aminata',
      });

      expect(analytics.events).toEqual([{ userId: 'user-1', name: 'verification.rejected' }]);
    });

    it('n’émet RIEN sur une demande de complément', async () => {
      // Ce n'est pas une sortie du tunnel : la personne est toujours en cours.
      const requestId = await preparerDossier();
      analytics.events.length = 0;

      await decider.execute({
        requestId,
        agentUserId: 'agent-1',
        outcome: 'REQUEST_ADDITIONAL',
        reasonCode: 'SELFIE_FLOU',
      });

      expect(analytics.events).toEqual([]);
    });
  });
});
