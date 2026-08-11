import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import type { ClockProvider } from '../../../providers/ports';
import type { AnalyticsTracker } from '../../analytics/application/ports';
import { remainingAttempts, verifyOtpChallenge } from '../domain/otp-challenge';
import { checkAccountAccess } from '../domain/session-policy';
import type {
  DeviceRepository,
  Hasher,
  OtpChallengeRepository,
  SessionRepository,
  TokenService,
  UserRepository,
} from './ports';

export interface VerifyOtpCommand {
  challengeId: string;
  code: string;
  device: {
    type: 'ANDROID' | 'IOS' | 'WEB';
    fingerprint: string;
    model?: string;
    osVersion?: string;
    appVersion?: string;
    pushToken?: string;
  } | null;
  ipV4: string | null;
  userAgent: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
  accountStatus: string;
  verificationStatus: string;
}

export interface VerifyOtpConfig {
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
}

/**
 * Validation du code OTP et ouverture de session (story D1-04).
 *
 * Le compte passe de `PENDING_OTP` à `ACTIVE`, mais cela n'ouvre PAS le produit :
 * découverte, matching et messagerie exigent en plus `verificationStatus = VERIFIED`
 * (ADR-006). Un compte activé ici peut seulement compléter son onboarding.
 */
export class VerifyOtpUseCase {
  constructor(
    private readonly otp: OtpChallengeRepository,
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly devices: DeviceRepository,
    private readonly hasher: Hasher,
    private readonly tokens: TokenService,
    private readonly clock: ClockProvider,
    private readonly analytics: AnalyticsTracker,
    private readonly config: VerifyOtpConfig,
  ) {}

  async execute(command: VerifyOtpCommand): Promise<AuthTokens> {
    const now = this.clock.now();
    const challenge = await this.otp.findById(command.challengeId);

    // Un défi inconnu et un défi invalide renvoient la même erreur : on ne confirme
    // pas l'existence d'un défi à qui tente des identifiants au hasard.
    if (challenge === null) throw BusinessError.unauthorized(ErrorCode.AUTH_OTP_INVALID);

    const verdict = verifyOtpChallenge(
      {
        codeHash: challenge.codeHash,
        attemptCount: challenge.attemptCount,
        maxAttempts: challenge.maxAttempts,
        expiresAt: challenge.expiresAt,
        consumedAt: challenge.consumedAt,
      },
      this.hasher.hash(command.code),
      now,
    );

    if (!verdict.valid) {
      if (verdict.reason === 'MISMATCH') {
        await this.otp.incrementAttempts(challenge.id);
        throw new BusinessError(ErrorCode.AUTH_OTP_INVALID, 401, {
          essaisRestants: remainingAttempts({
            codeHash: challenge.codeHash,
            attemptCount: challenge.attemptCount + 1,
            maxAttempts: challenge.maxAttempts,
            expiresAt: challenge.expiresAt,
            consumedAt: challenge.consumedAt,
          }),
        });
      }
      throw BusinessError.unauthorized(
        verdict.reason === 'EXPIRED'
          ? ErrorCode.AUTH_OTP_EXPIRED
          : verdict.reason === 'MAX_ATTEMPTS'
            ? ErrorCode.AUTH_OTP_MAX_ATTEMPTS
            : ErrorCode.AUTH_OTP_INVALID,
      );
    }

    const user = await this.users.findById(challenge.userId);
    if (user === null) throw BusinessError.unauthorized(ErrorCode.AUTH_OTP_INVALID);

    const access = checkAccountAccess(user.accountStatus);
    if (!access.allowed && access.reason !== 'PENDING_OTP') {
      throw BusinessError.forbidden(
        access.reason === 'BANNED' || access.reason === 'UNDERAGE'
          ? ErrorCode.AUTH_ACCOUNT_BANNED
          : ErrorCode.AUTH_ACCOUNT_SUSPENDED,
      );
    }

    await this.otp.consume(challenge.id, now);

    if (challenge.purpose === 'REGISTRATION' || !user.phoneVerified) {
      await this.users.markPhoneVerified(user.id);
    }
    if (user.accountStatus === 'PENDING_OTP') {
      await this.users.updateAccountStatus(user.id, 'ACTIVE');

      // Deuxième marche du tunnel, et seulement ici : un compte existe vraiment
      // à partir du moment où le numéro est prouvé. Compter l'inscription au
      // formulaire gonflerait les statistiques d'un nombre de comptes qui
      // n'ouvriront jamais.
      await this.analytics.track({
        userId: user.id,
        name: 'signup.completed',
        properties: { hasInvite: user.usedInviteId !== null },
      });
    }

    return this.openSession(user.id, command, now);
  }

  private async openSession(
    userId: string,
    command: VerifyOtpCommand,
    now: Date,
  ): Promise<AuthTokens> {
    const device = command.device
      ? await this.devices.upsert({
          userId,
          fingerprintHash: this.hasher.hash(command.device.fingerprint),
          type: command.device.type,
          model: command.device.model ?? null,
          osVersion: command.device.osVersion ?? null,
          appVersion: command.device.appVersion ?? null,
          pushToken: command.device.pushToken ?? null,
          seenAt: now,
        })
      : null;

    const refreshToken = this.tokens.generateRefreshToken();
    const familyId = this.tokens.newId();

    const session = await this.sessions.create({
      userId,
      familyId,
      refreshTokenHash: this.hasher.hash(refreshToken),
      deviceId: device?.id ?? null,
      expiresAt: new Date(now.getTime() + this.config.refreshTokenTtlDays * 86_400_000),
      ipV4: command.ipV4,
      userAgent: command.userAgent,
    });

    const user = await this.users.findById(userId);
    const accessToken = await this.tokens.signAccessToken({
      sub: userId,
      sid: session.id,
      accountStatus: user?.accountStatus ?? 'ACTIVE',
      verificationStatus: user?.verificationStatus ?? 'NOT_STARTED',
      roles: [],
    });

    await this.users.touchLastActive(userId, now);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.accessTokenTtlSeconds,
      userId,
      accountStatus: user?.accountStatus ?? 'ACTIVE',
      verificationStatus: user?.verificationStatus ?? 'NOT_STARTED',
    };
  }
}
