import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import type { ClockProvider } from '../../../providers/ports';
import {
  checkAccountAccess,
  requiresFamilyRevocation,
  verifySession,
} from '../domain/session-policy';
import type { AuthTokens } from './verify-otp.use-case';
import type { Hasher, SessionRepository, TokenService, UserRepository } from './ports';

export interface RefreshCommand {
  refreshToken: string;
  ipV4: string | null;
  userAgent: string | null;
}

export interface RefreshConfig {
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
}

/** Événement émis en cas de vol présumé — consommé par l'audit et les notifications. */
export interface TokenReuseDetected {
  userId: string;
  familyId: string;
  revokedSessions: number;
  at: Date;
}

/**
 * Rotation du refresh token (story D1-06, ADR-005).
 *
 * Le token est à usage unique. S'il resurgit après avoir déjà servi, deux copies
 * circulent : impossible de distinguer le porteur légitime du voleur, donc toute la
 * famille est révoquée. Déconnecter quelqu'un à tort coûte une reconnexion ; laisser
 * un voleur en place coûte un compte.
 */
export class RefreshTokenUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly users: UserRepository,
    private readonly hasher: Hasher,
    private readonly tokens: TokenService,
    private readonly clock: ClockProvider,
    private readonly config: RefreshConfig,
    private readonly onReuseDetected?: (event: TokenReuseDetected) => Promise<void>,
  ) {}

  async execute(command: RefreshCommand): Promise<AuthTokens> {
    const now = this.clock.now();
    const session = await this.sessions.findByRefreshTokenHash(
      this.hasher.hash(command.refreshToken),
    );

    if (session === null) throw BusinessError.unauthorized(ErrorCode.AUTH_TOKEN_EXPIRED);

    const verdict = verifySession(
      {
        familyId: session.familyId,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
        rotatedAt: session.rotatedAt,
      },
      now,
    );

    if (!verdict.valid) {
      if (requiresFamilyRevocation(verdict)) {
        const revoked = await this.sessions.revokeFamily(
          session.familyId,
          now,
          'Réutilisation d’un refresh token détectée',
        );
        await this.onReuseDetected?.({
          userId: session.userId,
          familyId: session.familyId,
          revokedSessions: revoked,
          at: now,
        });
        throw BusinessError.unauthorized(ErrorCode.AUTH_TOKEN_REUSED);
      }
      throw BusinessError.unauthorized(ErrorCode.AUTH_TOKEN_EXPIRED);
    }

    const user = await this.users.findById(session.userId);
    if (user === null) throw BusinessError.unauthorized(ErrorCode.AUTH_TOKEN_EXPIRED);

    // Le statut est relu en base, jamais lu depuis le token : une suspension doit
    // prendre effet au prochain rafraîchissement, pas au bout de 30 jours.
    const access = checkAccountAccess(user.accountStatus);
    if (!access.allowed) {
      await this.sessions.revokeFamily(session.familyId, now, `Compte ${access.reason}`);
      throw BusinessError.forbidden(
        access.reason === 'BANNED' || access.reason === 'UNDERAGE'
          ? ErrorCode.AUTH_ACCOUNT_BANNED
          : ErrorCode.AUTH_ACCOUNT_SUSPENDED,
      );
    }

    // L'ancienne session est marquée « pivotée » AVANT la création de la nouvelle :
    // un rejeu concurrent trouvera donc toujours l'état pivoté.
    await this.sessions.markRotated(session.id, now);

    const refreshToken = this.tokens.generateRefreshToken();
    const rotated = await this.sessions.create({
      userId: user.id,
      familyId: session.familyId,
      refreshTokenHash: this.hasher.hash(refreshToken),
      deviceId: session.deviceId,
      expiresAt: new Date(now.getTime() + this.config.refreshTokenTtlDays * 86_400_000),
      ipV4: command.ipV4,
      userAgent: command.userAgent,
    });

    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      sid: rotated.id,
      accountStatus: user.accountStatus,
      verificationStatus: user.verificationStatus,
      roles: [],
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.accessTokenTtlSeconds,
      userId: user.id,
      accountStatus: user.accountStatus,
      verificationStatus: user.verificationStatus,
    };
  }
}
