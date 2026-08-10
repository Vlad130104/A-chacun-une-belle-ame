import { beforeEach, describe, expect, it } from '@jest/globals';
import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import { VerifyOtpUseCase, type VerifyOtpCommand } from './verify-otp.use-case';
import {
  FakeClock,
  FakeHasher,
  FakeTokenService,
  InMemoryDeviceRepository,
  InMemoryOtpRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from './test-doubles';

describe('validation du code OTP', () => {
  let users: InMemoryUserRepository;
  let otp: InMemoryOtpRepository;
  let sessions: InMemorySessionRepository;
  let devices: InMemoryDeviceRepository;
  let clock: FakeClock;
  let useCase: VerifyOtpUseCase;
  let hasher: FakeHasher;

  const commande = (surcharge: Partial<VerifyOtpCommand> = {}): VerifyOtpCommand => ({
    challengeId: 'otp-1',
    code: '123456',
    device: { type: 'ANDROID', fingerprint: 'empreinte-1' },
    ipV4: '10.0.0.0',
    userAgent: 'test',
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

  const preparerDefi = async (
    statutCompte: 'PENDING_OTP' | 'ACTIVE' | 'BANNED' = 'PENDING_OTP',
  ) => {
    const user = await users.create({
      phoneE164: '+237690000000',
      phoneHash: hasher.hash('+237690000000'),
      birthDate: new Date('1990-05-20T00:00:00.000Z'),
      gender: 'FEMALE',
      countryCode: '237',
      accountStatus: statutCompte,
      usedInviteId: null,
      registrationIpV4: null,
    });
    await otp.create({
      userId: user.id,
      purpose: 'REGISTRATION',
      codeHash: hasher.hash('123456'),
      destination: '+237690000000',
      maxAttempts: 5,
      expiresAt: new Date('2026-08-06T12:05:00.000Z'),
    });
    return user;
  };

  beforeEach(() => {
    users = new InMemoryUserRepository();
    otp = new InMemoryOtpRepository();
    sessions = new InMemorySessionRepository();
    devices = new InMemoryDeviceRepository();
    clock = new FakeClock();
    hasher = new FakeHasher();

    useCase = new VerifyOtpUseCase(
      otp,
      users,
      sessions,
      devices,
      hasher,
      new FakeTokenService(),
      clock,
      {
        accessTokenTtlSeconds: 900,
        refreshTokenTtlDays: 30,
      },
    );
  });

  describe('cas nominal', () => {
    it('émet une paire de jetons', async () => {
      await preparerDefi();
      const resultat = await useCase.execute(commande());

      expect(resultat.accessToken).toBeTruthy();
      expect(resultat.refreshToken).toBeTruthy();
      expect(resultat.expiresIn).toBe(900);
    });

    it('active le compte et marque le numéro comme vérifié', async () => {
      const user = await preparerDefi();
      await useCase.execute(commande());

      const apres = await users.findById(user.id);
      expect(apres).toMatchObject({ accountStatus: 'ACTIVE', phoneVerified: true });
    });

    it('n’ouvre pas encore le produit : la vérification d’identité reste à faire', async () => {
      await preparerDefi();
      const resultat = await useCase.execute(commande());
      // Activer le compte ne vaut pas accès à la découverte ni à la messagerie (ADR-006).
      expect(resultat.verificationStatus).toBe('NOT_STARTED');
    });

    it('enregistre l’appareil et rattache la session', async () => {
      await preparerDefi();
      await useCase.execute(commande());

      expect(devices.devices).toHaveLength(1);
      expect([...sessions.sessions.values()][0]?.deviceId).toBe('device-1');
    });

    it('consomme le défi, le rendant inutilisable une seconde fois', async () => {
      await preparerDefi();
      await useCase.execute(commande());

      const code = await attendreCode(useCase.execute(commande()));
      expect(code).toBe(ErrorCode.AUTH_OTP_INVALID);
    });

    it('accepte une session sans appareil déclaré (navigateur)', async () => {
      await preparerDefi();
      const resultat = await useCase.execute(commande({ device: null }));

      expect(resultat.accessToken).toBeTruthy();
      expect(devices.devices).toHaveLength(0);
    });
  });

  describe('code incorrect', () => {
    it('refuse et annonce les essais restants', async () => {
      await preparerDefi();
      try {
        await useCase.execute(commande({ code: '000000' }));
        throw new Error('erreur attendue');
      } catch (error) {
        expect(error).toBeInstanceOf(BusinessError);
        expect((error as BusinessError).details).toEqual({ essaisRestants: 4 });
      }
    });

    it('incrémente le compteur d’essais', async () => {
      await preparerDefi();
      await attendreCode(useCase.execute(commande({ code: '000000' })));
      expect((await otp.findById('otp-1'))?.attemptCount).toBe(1);
    });

    it('bloque au-delà du nombre maximal d’essais', async () => {
      await preparerDefi();
      for (let essai = 0; essai < 5; essai += 1) {
        await attendreCode(useCase.execute(commande({ code: '000000' })));
      }
      const code = await attendreCode(useCase.execute(commande()));
      expect(code).toBe(ErrorCode.AUTH_OTP_MAX_ATTEMPTS);
    });
  });

  describe('défi expiré', () => {
    it('refuse après expiration', async () => {
      await preparerDefi();
      clock.advanceSeconds(301);

      const code = await attendreCode(useCase.execute(commande()));
      expect(code).toBe(ErrorCode.AUTH_OTP_EXPIRED);
    });
  });

  describe('défi inconnu', () => {
    it('renvoie la même erreur qu’un code incorrect', async () => {
      const code = await attendreCode(useCase.execute(commande({ challengeId: 'inexistant' })));
      // Ne pas confirmer l'existence d'un défi à qui tente au hasard.
      expect(code).toBe(ErrorCode.AUTH_OTP_INVALID);
    });
  });

  describe('compte non autorisé', () => {
    it('refuse un compte banni malgré un code valide', async () => {
      await preparerDefi('BANNED');
      const code = await attendreCode(useCase.execute(commande()));
      expect(code).toBe(ErrorCode.AUTH_ACCOUNT_BANNED);
    });

    it('n’ouvre aucune session pour un compte banni', async () => {
      await preparerDefi('BANNED');
      await attendreCode(useCase.execute(commande()));
      expect(sessions.sessions.size).toBe(0);
    });
  });
});
