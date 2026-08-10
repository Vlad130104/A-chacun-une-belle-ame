import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CLOCK_PROVIDER, KYC_PROVIDER, type ClockProvider } from '../../providers/ports';
import {
  DOCUMENT_STORAGE,
  VERIFICATION_REPOSITORY,
  VERIFICATION_USER_GATEWAY,
  type KycDocumentStorage,
  type VerificationRepository,
  type VerificationUserGateway,
} from './application/ports';
import {
  DecideVerificationUseCase,
  PurgeDocumentsUseCase,
  StartVerificationUseCase,
  SubmitVerificationUseCase,
  UploadDocumentUseCase,
  type VerificationConfig,
} from './application/verification.use-cases';
import {
  AdminVerificationController,
  VerificationController,
} from './infrastructure/verification.controller';
import { KycDocumentStorageAdapter } from './infrastructure/kyc-storage.adapter';
import { MockKycProvider } from './infrastructure/mock-kyc.provider';
import {
  PrismaVerificationRepository,
  PrismaVerificationUserGateway,
} from './infrastructure/prisma.repositories';

const buildConfig = (config: ConfigService<Env, true>): VerificationConfig => ({
  maxDocumentSizeBytes: config.get('MAX_KYC_UPLOAD_SIZE_BYTES', { infer: true }),
  documentRetentionDays: config.get('KYC_DOCUMENT_RETENTION_DAYS', { infer: true }),
  resubmitCooldownHours: 24,
});

/**
 * Module de vérification d'identité.
 *
 * Le fournisseur KYC est sélectionné ici et nulle part ailleurs : remplacer le
 * simulateur par un prestataire réel ne touchera ni `domain/` ni `application/`
 * (docs/MOCKS.md).
 */
@Module({
  controllers: [VerificationController, AdminVerificationController],
  providers: [
    KycDocumentStorageAdapter,
    MockKycProvider,

    { provide: DOCUMENT_STORAGE, useExisting: KycDocumentStorageAdapter },
    {
      provide: KYC_PROVIDER,
      inject: [ConfigService, MockKycProvider],
      useFactory: (config: ConfigService<Env, true>, mock: MockKycProvider) => {
        const selected = config.get('KYC_PROVIDER', { infer: true });
        if (selected === 'mock') return mock;
        // Aucun prestataire n'est contractualisé : ne pas inventer d'intégration.
        throw new Error(
          "KYC_PROVIDER=live demandé mais aucune implémentation réelle n'existe encore. " +
            'Voir docs/MOCKS.md et la question Q2 du cadrage.',
        );
      },
    },

    {
      provide: VERIFICATION_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaVerificationRepository(prisma),
    },
    {
      provide: VERIFICATION_USER_GATEWAY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaVerificationUserGateway(prisma),
    },

    {
      provide: StartVerificationUseCase,
      inject: [VERIFICATION_REPOSITORY, CLOCK_PROVIDER, ConfigService],
      useFactory: (
        repository: VerificationRepository,
        clock: ClockProvider,
        config: ConfigService<Env, true>,
      ) => new StartVerificationUseCase(repository, clock, buildConfig(config)),
    },
    {
      provide: UploadDocumentUseCase,
      inject: [VERIFICATION_REPOSITORY, DOCUMENT_STORAGE, ConfigService],
      useFactory: (
        repository: VerificationRepository,
        storage: KycDocumentStorage,
        config: ConfigService<Env, true>,
      ) => new UploadDocumentUseCase(repository, storage, buildConfig(config)),
    },
    {
      provide: SubmitVerificationUseCase,
      inject: [VERIFICATION_REPOSITORY, VERIFICATION_USER_GATEWAY],
      useFactory: (repository: VerificationRepository, users: VerificationUserGateway) =>
        new SubmitVerificationUseCase(repository, users),
    },
    {
      provide: DecideVerificationUseCase,
      inject: [VERIFICATION_REPOSITORY, VERIFICATION_USER_GATEWAY, CLOCK_PROVIDER, ConfigService],
      useFactory: (
        repository: VerificationRepository,
        users: VerificationUserGateway,
        clock: ClockProvider,
        config: ConfigService<Env, true>,
      ) => new DecideVerificationUseCase(repository, users, clock, buildConfig(config)),
    },
    {
      provide: PurgeDocumentsUseCase,
      inject: [VERIFICATION_REPOSITORY, DOCUMENT_STORAGE, CLOCK_PROVIDER],
      useFactory: (
        repository: VerificationRepository,
        storage: KycDocumentStorage,
        clock: ClockProvider,
      ) => new PurgeDocumentsUseCase(repository, storage, clock),
    },
  ],
  exports: [VERIFICATION_REPOSITORY, PurgeDocumentsUseCase],
})
export class VerificationModule {}
