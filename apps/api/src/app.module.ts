import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv } from './config/env.schema';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { ProvidersModule } from './providers/providers.module';
import { HealthModule } from './modules/health/health.module';

/**
 * Module racine.
 *
 * Les 17 modules de domaine seront ajoutés ici au fil des tranches verticales
 * (docs/08-backlog-mvp.md). À ce stade, seuls le socle technique et la route de
 * santé existent.
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
  ],
})
export class AppModule {}
