import { beforeEach, describe, expect, it } from '@jest/globals';
import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import { RefreshTokenUseCase, type TokenReuseDetected } from './refresh-token.use-case';
import {
  FakeClock,
  FakeHasher,
  FakeTokenService,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from './test-doubles';

describe('rotation du refresh token', () => {
  let sessions: InMemorySessionRepository;
  let users: InMemoryUserRepository;
  let clock: FakeClock;
  let hasher: FakeHasher;
  let useCase: RefreshTokenUseCase;
  let volsDetectes: TokenReuseDetected[];

  const creerSession = async (statut: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE') => {
    const user = await users.create({
      phoneE164: '+237690000000',
      phoneHash: hasher.hash('+237690000000'),
      birthDate: new Date('1990-05-20T00:00:00.000Z'),
      gender: 'FEMALE',
      countryCode: '237',
      accountStatus: statut,
      usedInviteId: null,
      registrationIpV4: null,
    });
    await sessions.create({
      userId: user.id,
      familyId: 'famille-1',
      refreshTokenHash: hasher.hash('token-initial'),
      deviceId: 'device-1',
      expiresAt: new Date('2026-09-05T12:00:00.000Z'),
      ipV4: null,
      userAgent: null,
    });
    return user;
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

  beforeEach(() => {
    sessions = new InMemorySessionRepository();
    users = new InMemoryUserRepository();
    clock = new FakeClock();
    hasher = new FakeHasher();
    volsDetectes = [];

    useCase = new RefreshTokenUseCase(
      sessions,
      users,
      hasher,
      new FakeTokenService(),
      clock,
      { accessTokenTtlSeconds: 900, refreshTokenTtlDays: 30 },
      (event) => {
        volsDetectes.push(event);
        return Promise.resolve();
      },
    );
  });

  describe('cas nominal', () => {
    it('émet un nouveau couple de jetons', async () => {
      await creerSession();
      const resultat = await useCase.execute({
        refreshToken: 'token-initial',
        ipV4: null,
        userAgent: null,
      });

      expect(resultat.refreshToken).not.toBe('token-initial');
      expect(resultat.accessToken).toBeTruthy();
    });

    it('conserve la famille et l’appareil', async () => {
      await creerSession();
      await useCase.execute({ refreshToken: 'token-initial', ipV4: null, userAgent: null });

      const nouvelle = [...sessions.sessions.values()].at(-1);
      expect(nouvelle?.familyId).toBe('famille-1');
      expect(nouvelle?.deviceId).toBe('device-1');
    });

    it('marque l’ancienne session comme pivotée', async () => {
      await creerSession();
      await useCase.execute({ refreshToken: 'token-initial', ipV4: null, userAgent: null });

      expect([...sessions.sessions.values()][0]?.rotatedAt).not.toBeNull();
    });
  });

  describe('détection de vol par réutilisation — ADR-005', () => {
    it('refuse un token déjà utilisé', async () => {
      await creerSession();
      await useCase.execute({ refreshToken: 'token-initial', ipV4: null, userAgent: null });

      const code = await attendreCode(
        useCase.execute({ refreshToken: 'token-initial', ipV4: null, userAgent: null }),
      );
      expect(code).toBe(ErrorCode.AUTH_TOKEN_REUSED);
    });

    it('révoque TOUTE la famille, pas seulement la session présentée', async () => {
      await creerSession();
      await useCase.execute({ refreshToken: 'token-initial', ipV4: null, userAgent: null });
      await attendreCode(
        useCase.execute({ refreshToken: 'token-initial', ipV4: null, userAgent: null }),
      );

      const vivantes = [...sessions.sessions.values()].filter((s) => s.revokedAt === null);
      expect(vivantes).toHaveLength(0);
    });

    it('émet un événement exploitable par l’audit et la notification de sécurité', async () => {
      const user = await creerSession();
      await useCase.execute({ refreshToken: 'token-initial', ipV4: null, userAgent: null });
      await attendreCode(
        useCase.execute({ refreshToken: 'token-initial', ipV4: null, userAgent: null }),
      );

      expect(volsDetectes).toHaveLength(1);
      expect(volsDetectes[0]).toMatchObject({ userId: user.id, familyId: 'famille-1' });
    });

    it('invalide aussi le token le plus récent après détection', async () => {
      await creerSession();
      const premier = await useCase.execute({
        refreshToken: 'token-initial',
        ipV4: null,
        userAgent: null,
      });
      await attendreCode(
        useCase.execute({ refreshToken: 'token-initial', ipV4: null, userAgent: null }),
      );

      // Le voleur détenait peut-être ce token : il ne doit plus fonctionner non plus.
      const code = await attendreCode(
        useCase.execute({ refreshToken: premier.refreshToken, ipV4: null, userAgent: null }),
      );
      expect(code).toBe(ErrorCode.AUTH_TOKEN_EXPIRED);
    });
  });

  describe('sessions invalides', () => {
    it('refuse un token inconnu', async () => {
      const code = await attendreCode(
        useCase.execute({ refreshToken: 'inconnu', ipV4: null, userAgent: null }),
      );
      expect(code).toBe(ErrorCode.AUTH_TOKEN_EXPIRED);
    });

    it('refuse un token expiré', async () => {
      await creerSession();
      clock.advanceDays(31);

      const code = await attendreCode(
        useCase.execute({ refreshToken: 'token-initial', ipV4: null, userAgent: null }),
      );
      expect(code).toBe(ErrorCode.AUTH_TOKEN_EXPIRED);
    });
  });

  describe('statut du compte relu en base', () => {
    it('refuse un compte suspendu et révoque sa famille', async () => {
      await creerSession('SUSPENDED');

      const code = await attendreCode(
        useCase.execute({ refreshToken: 'token-initial', ipV4: null, userAgent: null }),
      );
      expect(code).toBe(ErrorCode.AUTH_ACCOUNT_SUSPENDED);
      expect([...sessions.sessions.values()][0]?.revokedAt).not.toBeNull();
    });

    it('applique une suspension survenue après l’ouverture de session', async () => {
      const user = await creerSession();
      await users.updateAccountStatus(user.id, 'SUSPENDED');

      const code = await attendreCode(
        useCase.execute({ refreshToken: 'token-initial', ipV4: null, userAgent: null }),
      );
      expect(code).toBe(ErrorCode.AUTH_ACCOUNT_SUSPENDED);
    });
  });
});
