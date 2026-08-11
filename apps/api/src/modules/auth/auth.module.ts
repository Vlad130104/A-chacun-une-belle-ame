import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import {
  ANALYTICS_TRACKER,
  INVITE_RESOLVER,
  type AnalyticsTracker,
  type InviteResolver,
} from '../analytics/application/ports';
import { ACCOUNT_SANCTION_GATEWAY } from '../moderation/application/ports';
import { PrismaAccountSanctionGateway } from './infrastructure/account-sanction.gateway';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import type { Env } from '../../config/env.schema';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CACHE_PROBE } from '../health/ports';
import { RateLimitGuard } from '../../common/auth/rate-limit.guard';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  CLOCK_PROVIDER,
  SMS_PROVIDER,
  type ClockProvider,
  type SmsProvider,
} from '../../providers/ports';
import {
  BLOCKED_IDENTITY_REPOSITORY,
  CONSENT_REPOSITORY,
  DEVICE_REPOSITORY,
  HASHER,
  OTP_REPOSITORY,
  PASSWORD_HASHER,
  RATE_LIMITER,
  ROLE_READER,
  SESSION_REPOSITORY,
  TOKEN_SERVICE,
  USER_REPOSITORY,
  type BlockedIdentityRepository,
  type ConsentRepository,
  type DeviceRepository,
  type Hasher,
  type OtpChallengeRepository,
  type RateLimiter,
  type SessionRepository,
  type TokenService,
  type UserRepository,
} from './application/ports';
import { RegisterUseCase } from './application/register.use-case';
import { VerifyOtpUseCase } from './application/verify-otp.use-case';
import { RefreshTokenUseCase } from './application/refresh-token.use-case';
import {
  ListSessionsUseCase,
  LogoutAllUseCase,
  LogoutUseCase,
  RevokeSessionUseCase,
} from './application/session.use-cases';
import { AuthController } from './infrastructure/auth.controller';
import {
  Argon2PasswordHasher,
  JwtTokenService,
  SaltedHasher,
} from './infrastructure/crypto.adapters';
import { RedisRateLimiter } from './infrastructure/redis-rate-limiter';
import {
  PrismaBlockedIdentityRepository,
  PrismaConsentRepository,
  PrismaDeviceRepository,
  PrismaOtpRepository,
  PrismaRoleReader,
  PrismaSessionRepository,
  PrismaUserRepository,
} from './infrastructure/prisma.repositories';

/**
 * Module d'authentification.
 *
 * C'est ici — et uniquement ici — que les cas d'usage sont reliés à leurs
 * implémentations concrètes. Les cas d'usage ne connaissent ni Prisma, ni Redis, ni
 * Argon2 (docs/01-architecture.md §4).
 */
@Module({
  imports: [
    AnalyticsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const privateKey = process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n');
        const publicKey = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n');

        // RS256 quand une paire de clés est fournie ; sinon HS256 avec un secret de
        // développement. En production, la validation de configuration impose les clés.
        if (privateKey && publicKey) {
          return {
            privateKey,
            publicKey,
            signOptions: {
              algorithm: 'RS256' as const,
              expiresIn: config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
            },
            verifyOptions: { algorithms: ['RS256' as const] },
          };
        }

        return {
          secret: process.env.JWT_DEV_SECRET ?? 'secret-de-developpement-non-production',
          signOptions: {
            expiresIn: config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    SaltedHasher,
    Argon2PasswordHasher,
    JwtTokenService,
    RedisRateLimiter,
    PrismaRoleReader,

    { provide: HASHER, useExisting: SaltedHasher },
    { provide: PASSWORD_HASHER, useExisting: Argon2PasswordHasher },
    { provide: TOKEN_SERVICE, useExisting: JwtTokenService },
    { provide: RATE_LIMITER, useExisting: RedisRateLimiter },
    { provide: ROLE_READER, useExisting: PrismaRoleReader },
    // Le module de santé sonde la connexion Redis RÉELLEMENT utilisée (story E-03).
    { provide: CACHE_PROBE, useExisting: RedisRateLimiter },

    {
      provide: USER_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaUserRepository(prisma),
    },
    {
      provide: OTP_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaOtpRepository(prisma),
    },
    {
      provide: SESSION_REPOSITORY,
      inject: [PrismaService, CLOCK_PROVIDER],
      useFactory: (prisma: PrismaService, clock: ClockProvider) =>
        new PrismaSessionRepository(prisma, clock),
    },
    {
      provide: DEVICE_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaDeviceRepository(prisma),
    },
    {
      provide: BLOCKED_IDENTITY_REPOSITORY,
      inject: [PrismaService, CLOCK_PROVIDER],
      useFactory: (prisma: PrismaService, clock: ClockProvider) =>
        new PrismaBlockedIdentityRepository(prisma, clock),
    },
    {
      provide: CONSENT_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaConsentRepository(prisma),
    },

    {
      provide: RegisterUseCase,
      inject: [
        USER_REPOSITORY,
        OTP_REPOSITORY,
        BLOCKED_IDENTITY_REPOSITORY,
        CONSENT_REPOSITORY,
        HASHER,
        TOKEN_SERVICE,
        SMS_PROVIDER,
        CLOCK_PROVIDER,
        RATE_LIMITER,
        INVITE_RESOLVER,
        ANALYTICS_TRACKER,
        ConfigService,
      ],
      useFactory: (
        users: UserRepository,
        otp: OtpChallengeRepository,
        blocked: BlockedIdentityRepository,
        consents: ConsentRepository,
        hasher: Hasher,
        tokens: TokenService,
        sms: SmsProvider,
        clock: ClockProvider,
        limiter: RateLimiter,
        invites: InviteResolver,
        analytics: AnalyticsTracker,
        config: ConfigService<Env, true>,
      ) =>
        new RegisterUseCase(
          users,
          otp,
          blocked,
          consents,
          hasher,
          tokens,
          sms,
          clock,
          limiter,
          invites,
          analytics,
          {
            minimumAge: config.get('MINIMUM_AGE', { infer: true }),
            otpTtlSeconds: config.get('OTP_TTL_SECONDS', { infer: true }),
            otpMaxAttempts: config.get('OTP_MAX_ATTEMPTS', { infer: true }),
            otpRateLimitPerWindow: config.get('RATE_LIMIT_OTP_PER_10_MIN', { infer: true }),
            otpRateWindowSeconds: 600,
          },
        ),
    },
    {
      provide: VerifyOtpUseCase,
      inject: [
        OTP_REPOSITORY,
        USER_REPOSITORY,
        SESSION_REPOSITORY,
        DEVICE_REPOSITORY,
        HASHER,
        TOKEN_SERVICE,
        CLOCK_PROVIDER,
        ANALYTICS_TRACKER,
        ConfigService,
      ],
      useFactory: (
        otp: OtpChallengeRepository,
        users: UserRepository,
        sessions: SessionRepository,
        devices: DeviceRepository,
        hasher: Hasher,
        tokens: TokenService,
        clock: ClockProvider,
        analytics: AnalyticsTracker,
        config: ConfigService<Env, true>,
      ) =>
        new VerifyOtpUseCase(otp, users, sessions, devices, hasher, tokens, clock, analytics, {
          accessTokenTtlSeconds: config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
          refreshTokenTtlDays: config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }),
        }),
    },
    {
      provide: RefreshTokenUseCase,
      inject: [
        SESSION_REPOSITORY,
        USER_REPOSITORY,
        HASHER,
        TOKEN_SERVICE,
        CLOCK_PROVIDER,
        ConfigService,
      ],
      useFactory: (
        sessions: SessionRepository,
        users: UserRepository,
        hasher: Hasher,
        tokens: TokenService,
        clock: ClockProvider,
        config: ConfigService<Env, true>,
      ) =>
        new RefreshTokenUseCase(sessions, users, hasher, tokens, clock, {
          accessTokenTtlSeconds: config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
          refreshTokenTtlDays: config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }),
        }),
      // TODO(D8-02): brancher ici la notification de sécurité et l'événement d'audit
      // émis lors d'une réutilisation de refresh token détectée.
    },
    {
      provide: LogoutUseCase,
      inject: [SESSION_REPOSITORY, CLOCK_PROVIDER],
      useFactory: (sessions: SessionRepository, clock: ClockProvider) =>
        new LogoutUseCase(sessions, clock),
    },
    {
      provide: LogoutAllUseCase,
      inject: [SESSION_REPOSITORY, CLOCK_PROVIDER],
      useFactory: (sessions: SessionRepository, clock: ClockProvider) =>
        new LogoutAllUseCase(sessions, clock),
    },
    {
      provide: ListSessionsUseCase,
      inject: [SESSION_REPOSITORY],
      useFactory: (sessions: SessionRepository) => new ListSessionsUseCase(sessions),
    },
    {
      provide: RevokeSessionUseCase,
      inject: [SESSION_REPOSITORY, CLOCK_PROVIDER],
      useFactory: (sessions: SessionRepository, clock: ClockProvider) =>
        new RevokeSessionUseCase(sessions, clock),
    },

    // Port déclaré par le module `moderation`, implémenté ici : la table `User`
    // appartient à `auth`.
    {
      provide: ACCOUNT_SANCTION_GATEWAY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaAccountSanctionGateway(prisma),
    },

    // Garde global : toute route non déclarée `@Public()` est protégée par défaut.
    { provide: APP_GUARD, useClass: AuthGuard },
    // Enregistré APRÈS le garde d'authentification : il compte alors par compte
    // plutôt que par adresse IP. Il ne dépend cependant pas de cet ordre — sans
    // `request.user`, il retombe sur l'IP (story E-02).
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  // `ACCOUNT_SANCTION_GATEWAY` est déclaré par le module `moderation` et
  // implémenté ici : la table `User` appartient à `auth`, la modération décide
  // mais n'écrit pas elle-même dans les tables d'un autre module.
  exports: [USER_REPOSITORY, TOKEN_SERVICE, HASHER, ACCOUNT_SANCTION_GATEWAY, CACHE_PROBE],
})
export class AuthModule {}
