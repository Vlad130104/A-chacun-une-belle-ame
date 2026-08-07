import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import helmet from 'helmet';
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
