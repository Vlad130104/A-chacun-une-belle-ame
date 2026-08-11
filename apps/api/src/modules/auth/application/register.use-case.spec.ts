import { beforeEach, describe, expect, it } from '@jest/globals';
import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import { RegisterUseCase, type RegisterCommand } from './register.use-case';
import {
  FakeClock,
  FakeHasher,
  FakeTokenService,
  InMemoryBlockedIdentityRepository,
  InMemoryConsentRepository,
  InMemoryOtpRepository,
  InMemoryUserRepository,
  PermissiveRateLimiter,
  RecordingAnalyticsTracker,
  RecordingSmsProvider,
  StubInviteResolver,
} from './test-doubles';

describe('inscription', () => {
  let users: InMemoryUserRepository;
  let otp: InMemoryOtpRepository;
  let blocked: InMemoryBlockedIdentityRepository;
  let consents: InMemoryConsentRepository;
  let sms: RecordingSmsProvider;
  let limiter: PermissiveRateLimiter;
  let clock: FakeClock;
  let invites: StubInviteResolver;
  let analytics: RecordingAnalyticsTracker;
  let useCase: RegisterUseCase;

  const commande = (surcharge: Partial<RegisterCommand> = {}): RegisterCommand => ({
    phoneE164: '+237690000000',
    birthDate: '1990-05-20',
    gender: 'FEMALE',
    inviteCode: null,
    consents: [
      { type: 'TERMS_OF_SERVICE', documentVersion: '1.0', granted: true },
      { type: 'PRIVACY_POLICY', documentVersion: '1.0', granted: true },
      { type: 'CODE_OF_CONDUCT', documentVersion: '1.0', granted: true },
    ],
    ipV4: '10.0.0.0',
    deviceFingerprint: 'empreinte-appareil-1',
    ...surcharge,
  });

  const attendreCode = async (promesse: Promise<unknown>): Promise<string> => {
    try {
      await promesse;
      throw new Error('une erreur métier était attendue');
    } catch (error) {
      if (error instanceof BusinessError) return error.code;
      throw error;
    }
  };

  beforeEach(() => {
    users = new InMemoryUserRepository();
    otp = new InMemoryOtpRepository();
    blocked = new InMemoryBlockedIdentityRepository();
    consents = new InMemoryConsentRepository();
    sms = new RecordingSmsProvider();
    limiter = new PermissiveRateLimiter();
    clock = new FakeClock();
    invites = new StubInviteResolver();
    analytics = new RecordingAnalyticsTracker();

    useCase = new RegisterUseCase(
      users,
      otp,
      blocked,
      consents,
      new FakeHasher(),
      new FakeTokenService(),
      sms,
      clock,
      limiter,
      invites,
      analytics,
      {
        minimumAge: 18,
        otpTtlSeconds: 300,
        otpMaxAttempts: 5,
        otpRateLimitPerWindow: 3,
        otpRateWindowSeconds: 600,
      },
    );
  });

  describe('cas nominal', () => {
    it('crée un compte en attente d’OTP et émet un défi', async () => {
      const resultat = await useCase.execute(commande());

      expect(resultat.challengeId).toBeTruthy();
      expect(resultat.testMode).toBe(true);
      expect([...users.users.values()][0]).toMatchObject({
        accountStatus: 'PENDING_OTP',
        phoneVerified: false,
      });
    });

    it('envoie le code au numéro normalisé', async () => {
      await useCase.execute(commande({ phoneE164: '+237 6 90 00 00 00' }));
      expect(sms.sent).toHaveLength(1);
      expect(sms.sent[0]?.phone).toBe('+237690000000');
    });

    it('enregistre les trois consentements obligatoires', async () => {
      await useCase.execute(commande());
      expect(consents.recorded.map((c) => c.type)).toEqual([
        'TERMS_OF_SERVICE',
        'PRIVACY_POLICY',
        'CODE_OF_CONDUCT',
      ]);
    });

    it('ne stocke jamais le code OTP en clair', async () => {
      const resultat = await useCase.execute(commande());
      const defi = await otp.findById(resultat.challengeId);
      expect(defi?.codeHash).not.toBe('123456');
      expect(defi?.codeHash).toHaveLength(64);
    });
  });

  describe('refus des mineurs — règle non négociable', () => {
    it('refuse une inscription mineure', async () => {
      const code = await attendreCode(useCase.execute(commande({ birthDate: '2012-01-01' })));
      expect(code).toBe(ErrorCode.AUTH_UNDERAGE);
    });

    it('rend le refus définitif en marquant le compte BLOCKED_UNDERAGE', async () => {
      await attendreCode(useCase.execute(commande({ birthDate: '2012-01-01' })));
      expect([...users.users.values()][0]?.accountStatus).toBe('BLOCKED_UNDERAGE');
    });

    it('verse une empreinte en liste noire pour empêcher la ré-inscription', async () => {
      await attendreCode(useCase.execute(commande({ birthDate: '2012-01-01' })));
      expect(blocked.entries).toHaveLength(1);
      expect(blocked.entries[0]?.reason).toBe('UNDERAGE');
      // Aucune donnée en clair : seules des empreintes sont conservées (ADR-013).
      expect(blocked.entries[0]?.phoneHash).not.toContain('237');
    });

    it('refuse la seconde tentative avec le même numéro, même en déclarant un âge majeur', async () => {
      await attendreCode(useCase.execute(commande({ birthDate: '2012-01-01' })));
      const code = await attendreCode(useCase.execute(commande({ birthDate: '1990-01-01' })));
      expect(code).toBe(ErrorCode.AUTH_IDENTITY_BLOCKED);
    });

    it('n’envoie aucun SMS à une inscription refusée', async () => {
      await attendreCode(useCase.execute(commande({ birthDate: '2012-01-01' })));
      expect(sms.sent).toHaveLength(0);
    });

    it('accepte le jour exact des 18 ans', async () => {
      const resultat = await useCase.execute(commande({ birthDate: '2008-08-06' }));
      expect(resultat.challengeId).toBeTruthy();
    });

    it('refuse la veille des 18 ans', async () => {
      const code = await attendreCode(useCase.execute(commande({ birthDate: '2008-08-07' })));
      expect(code).toBe(ErrorCode.AUTH_UNDERAGE);
    });
  });

  describe('protections', () => {
    it('refuse un numéro invalide', async () => {
      const code = await attendreCode(useCase.execute(commande({ phoneE164: '06900' })));
      expect(code).toBe(ErrorCode.VALIDATION_FAILED);
    });

    it('refuse une date de naissance future', async () => {
      const code = await attendreCode(useCase.execute(commande({ birthDate: '2030-01-01' })));
      expect(code).toBe(ErrorCode.VALIDATION_FAILED);
    });

    it('applique la limite de débit sur le numéro', async () => {
      limiter.block(`otp:${new FakeHasher().hash('+237690000000')}`);
      const code = await attendreCode(useCase.execute(commande()));
      expect(code).toBe(ErrorCode.RATE_LIMITED);
    });

    it('refuse un numéro déjà vérifié', async () => {
      const premier = await useCase.execute(commande());
      const defi = await otp.findById(premier.challengeId);
      await users.markPhoneVerified(defi!.userId);

      const code = await attendreCode(useCase.execute(commande()));
      expect(code).toBe(ErrorCode.AUTH_PHONE_ALREADY_USED);
    });

    it('permet de relancer une inscription non finalisée sans créer de doublon', async () => {
      await useCase.execute(commande());
      await useCase.execute(commande());
      expect(users.users.size).toBe(1);
    });

    it('refuse une identité déjà en liste noire', async () => {
      await blocked.block({ phoneHash: new FakeHasher().hash('+237690000000'), reason: 'BANNED' });
      const code = await attendreCode(useCase.execute(commande()));
      expect(code).toBe(ErrorCode.AUTH_IDENTITY_BLOCKED);
    });

    it('refuse une inscription depuis un appareil banni, même avec un numéro neuf', async () => {
      await blocked.block({ deviceFingerprint: 'empreinte-appareil-1', reason: 'BANNED' });
      const code = await attendreCode(useCase.execute(commande({ phoneE164: '+237691111111' })));
      expect(code).toBe(ErrorCode.AUTH_IDENTITY_BLOCKED);
    });
  });

  describe('expiration du défi', () => {
    it('fixe l’expiration selon la configuration', async () => {
      const resultat = await useCase.execute(commande());
      expect(resultat.expiresAt.getTime() - clock.now().getTime()).toBe(300_000);
    });
  });

  describe('rattachement à un lien d’invitation (story D10-02)', () => {
    it('résout le code CÔTÉ SERVEUR et rattache le compte au lien', async () => {
      // Le client envoie une chaîne ; c'est le serveur qui décide si elle
      // correspond à un lien utilisable. Aucun identifiant interne ne transite.
      invites.reponse = { inviteId: 'invite-1', campaignCode: 'whatsapp-01' };

      await useCase.execute(commande({ inviteCode: 'WHATSAPP01' }));

      expect(invites.demandes).toEqual(['WHATSAPP01']);
      expect([...users.users.values()][0]?.usedInviteId).toBe('invite-1');
    });

    it('n’INTERROGE pas le résolveur quand aucun code n’est fourni', async () => {
      await useCase.execute(commande());
      expect(invites.demandes).toEqual([]);
    });

    it('laisse l’inscription aboutir malgré un code invalide', async () => {
      // Refuser l'inscription pour un code périmé ferait perdre la personne,
      // alors que le seul enjeu est de savoir d'où elle vient.
      invites.reponse = null;

      const resultat = await useCase.execute(commande({ inviteCode: 'CODE-PERIME' }));

      expect(resultat.challengeId).toBeDefined();
      expect([...users.users.values()][0]?.usedInviteId).toBeNull();
    });

    it('émet la première marche du tunnel de migration', async () => {
      invites.reponse = { inviteId: 'invite-1', campaignCode: 'whatsapp-01' };

      await useCase.execute(commande({ inviteCode: 'WHATSAPP01' }));

      expect(analytics.events).toEqual([
        { userId: [...users.users.values()][0]?.id, name: 'signup.started' },
      ]);
    });
  });
});
