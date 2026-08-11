import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import helmet from 'helmet';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/errors/global-exception.filter';
import type { Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  const config = app.get(ConfigService<Env, true>);

  // Identifiant de corrélation : c'est ce que le support demandera à l'utilisateur.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  });

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));

  // Corps brut conservé pour la vérification des signatures de webhook (ADR-010).
  //
  // Une signature porte sur les OCTETS reçus. Ré-sérialiser le JSON analysé
  // changerait l'ordre des clés et les espaces, et invaliderait toute signature
  // pourtant authentique. On garde donc le tampon d'origine, et uniquement sur
  // les routes de webhook : ailleurs, conserver le corps brut n'a aucun intérêt
  // et double la mémoire consommée par requête.
  app.use(
    express.json({
      limit: '1mb',
      verify: (req: Request & { rawBody?: Buffer }, _res, buf: Buffer) => {
        if (req.originalUrl.includes('/payments/webhook/')) {
          req.rawBody = Buffer.from(buf);
        }
      },
    }),
  );

  // CORS restrictif : uniquement les origines explicitement déclarées.
  const origins = config
    .get('CORS_ALLOWED_ORIGINS', { infer: true })
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins.length > 0 ? origins : false, credentials: true });

  app.setGlobalPrefix(config.get('API_GLOBAL_PREFIX', { infer: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableShutdownHooks();

  // La documentation interactive n'est jamais exposée en production.
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('À Chacun Une Belle Âme — API')
        .setVersion('1.0.0-mvp')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port);
}

void bootstrap();
