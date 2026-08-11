import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv } from './config/env.schema';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { ProvidersModule } from './providers/providers.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { VerificationModule } from './modules/verification/verification.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { AuditModule } from './modules/audit/audit.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { BillingModule } from './modules/billing/billing.module';

/**
 * Module racine.
 *
 * Les 17 modules de domaine sont ajoutés ici au fil des tranches verticales
 * (docs/08-backlog-mvp.md). Livrés à ce jour : socle technique, santé,
 * authentification, vérification d'identité, profils, découverte, messagerie,
 * audit, modération et facturation.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        // Rédaction : aucune donnée sensible ne peut atteindre les logs.
        // Cette liste est vérifiée par un test dédié (docs/09-plan-de-tests.md §6).
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.code',
            'req.body.refreshToken',
            'req.body.phoneE164',
            'req.body.body',
            'res.headers["set-cookie"]',
            '*.otp',
            '*.token',
            '*.documentUrl',
            '*.storageKey',
            // Le corps d'un message n'entre jamais dans un log applicatif : il n'est
            // lisible que par la modération, rattaché à un signalement (ADR-008).
            '*.body',
          ],
          censor: '[REDACTED]',
        },
        transport:
          process.env.NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),
    PrismaModule,
    ProvidersModule,
    HealthModule,
    AuthModule,
    VerificationModule,
    ProfilesModule,
    ConversationsModule,
    DiscoveryModule,
    AuditModule,
    ModerationModule,
    BillingModule,
  ],
})
export class AppModule {}
