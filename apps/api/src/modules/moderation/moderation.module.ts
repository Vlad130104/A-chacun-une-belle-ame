import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CLOCK_PROVIDER, type ClockProvider } from '../../providers/ports';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { MEDIA_STORAGE, type MediaStorage } from '../profiles/application/ports';
import type { DetectionThresholds } from './domain/detection-rules';
import {
  ACCOUNT_SANCTION_GATEWAY,
  AUDIT_WRITER,
  BEHAVIOUR_SOURCE,
  DECISION_NOTIFIER,
  EVIDENCE_STORAGE,
  MESSAGE_MODERATION_GATEWAY,
  MODERATION_CASE_REPOSITORY,
  PHOTO_MODERATION_GATEWAY,
  REPORT_REPOSITORY,
  type AccountSanctionGateway,
  type AuditWriter,
  type BehaviourSource,
  type DecisionNotifier,
  type EvidenceStorage,
  type MessageModerationGateway,
  type ModerationCaseRepository,
  type PhotoModerationGateway,
  type ReportRepository,
} from './application/ports';
import {
  AddReportEvidenceUseCase,
  ApplyModerationActionUseCase,
  AssignCaseUseCase,
  EvaluateBehaviourUseCase,
  GetCaseUseCase,
  ListCaseQueueUseCase,
  ListMyReportsUseCase,
  ModerationMetricsUseCase,
  RevertActionUseCase,
  SubmitReportUseCase,
  type ModerationConfig,
} from './application/moderation.use-cases';
import { PrismaBehaviourSource } from './infrastructure/behaviour.source';
import { PrismaDecisionNotifier } from './infrastructure/decision.notifier';
import {
  AdminModerationController,
  ReportController,
} from './infrastructure/moderation.controller';
import {
  PrismaModerationCaseRepository,
  PrismaReportRepository,
} from './infrastructure/prisma.repositories';

/**
 * Seuils de détection, tous en configuration (story D6-07) : ils seront ajustés
 * sur les données réelles sans redéploiement, une fois le taux de faux positifs
 * mesuré par règle.
 */
const buildThresholds = (config: ConfigService<Env, true>): DetectionThresholds => ({
  moneyRequestCount: config.get('DETECT_MONEY_REQUEST_COUNT', { infer: true }),
  moneyRequestWindowHours: config.get('DETECT_MONEY_REQUEST_WINDOW_HOURS', { infer: true }),
  bulkSimilarCount: config.get('DETECT_BULK_SIMILAR_COUNT', { infer: true }),
  bulkSimilarRatio: config.get('DETECT_BULK_SIMILAR_RATIO', { infer: true }),
  accountCreationCount: config.get('DETECT_ACCOUNT_CREATION_COUNT', { infer: true }),
  accountCreationWindowDays: config.get('DETECT_ACCOUNT_CREATION_WINDOW_DAYS', { infer: true }),
  deviceChangeCount: config.get('DETECT_DEVICE_CHANGE_COUNT', { infer: true }),
  deviceChangeWindowDays: config.get('DETECT_DEVICE_CHANGE_WINDOW_DAYS', { infer: true }),
  likeVolumeMultiplier: config.get('DETECT_LIKE_VOLUME_MULTIPLIER', { infer: true }),
  verificationRefusalCount: config.get('DETECT_VERIFICATION_REFUSAL_COUNT', { infer: true }),
  multipleReportsCount: config.get('DETECT_MULTIPLE_REPORTS_COUNT', { infer: true }),
  multipleReportsWindowDays: config.get('DETECT_MULTIPLE_REPORTS_WINDOW_DAYS', { infer: true }),
  suspiciousLinkCount: config.get('DETECT_SUSPICIOUS_LINK_COUNT', { infer: true }),
  automationMinIntervalMs: config.get('DETECT_AUTOMATION_MIN_INTERVAL_MS', { infer: true }),
  automationSampleSize: config.get('DETECT_AUTOMATION_SAMPLE_SIZE', { infer: true }),
});

const buildConfig = (config: ConfigService<Env, true>): ModerationConfig => ({
  sla: {
    P0_CRITICAL: config.get('SLA_HOURS_P0', { infer: true }),
    P1_HIGH: config.get('SLA_HOURS_P1', { infer: true }),
    P2_NORMAL: config.get('SLA_HOURS_P2', { infer: true }),
    P3_LOW: config.get('SLA_HOURS_P3', { infer: true }),
  },
  dailyReportLimit: config.get('DAILY_REPORT_LIMIT', { infer: true }),
  dailyEvidenceLimit: config.get('DAILY_REPORT_EVIDENCE_LIMIT', { infer: true }),
  reopenWindowDays: config.get('CASE_REOPEN_WINDOW_DAYS', { infer: true }),
  maxEvidenceBytes: config.get('MAX_UPLOAD_SIZE_BYTES', { infer: true }),
  thresholds: buildThresholds(config),
});

/**
 * Module de sécurité et de modération (tranche D6).
 *
 * Propriétaire des tables `Report`, `ModerationCase`, `ModerationAction` et
 * `ModerationSignal`. Les effets d'une décision sur d'autres domaines — statut du
 * compte, photo, message — passent par des ports implémentés **par les modules
 * propriétaires** de ces tables : la modération décide, elle n'écrit pas ailleurs.
 */
@Module({
  imports: [AuditModule, AuthModule, ProfilesModule, ConversationsModule],
  controllers: [ReportController, AdminModerationController],
  providers: [
    {
      provide: REPORT_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaReportRepository(prisma),
    },
    {
      provide: MODERATION_CASE_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaModerationCaseRepository(prisma),
    },
    {
      provide: BEHAVIOUR_SOURCE,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService<Env, true>) =>
        new PrismaBehaviourSource(prisma, buildThresholds(config)),
    },
    {
      provide: DECISION_NOTIFIER,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaDecisionNotifier(prisma),
    },
    // Le port n'expose que `put` : aucune URL signée ne peut être produite pour
    // une capture, qui peut contenir la conversation d'un tiers.
    {
      provide: EVIDENCE_STORAGE,
      inject: [MEDIA_STORAGE],
      useFactory: (storage: MediaStorage): EvidenceStorage => ({
        put: (key, bytes, contentType) => storage.put(key, bytes, contentType),
      }),
    },

    {
      provide: SubmitReportUseCase,
      inject: [
        REPORT_REPOSITORY,
        MODERATION_CASE_REPOSITORY,
        DECISION_NOTIFIER,
        CLOCK_PROVIDER,
        ConfigService,
      ],
      useFactory: (
        reports: ReportRepository,
        cases: ModerationCaseRepository,
        notifier: DecisionNotifier,
        clock: ClockProvider,
        config: ConfigService<Env, true>,
      ) => new SubmitReportUseCase(reports, cases, notifier, clock, buildConfig(config)),
    },
    {
      provide: AddReportEvidenceUseCase,
      inject: [REPORT_REPOSITORY, EVIDENCE_STORAGE, CLOCK_PROVIDER, ConfigService],
      useFactory: (
        reports: ReportRepository,
        storage: EvidenceStorage,
        clock: ClockProvider,
        config: ConfigService<Env, true>,
      ) => new AddReportEvidenceUseCase(reports, storage, clock, buildConfig(config)),
    },
    {
      provide: ListMyReportsUseCase,
      inject: [REPORT_REPOSITORY],
      useFactory: (reports: ReportRepository) => new ListMyReportsUseCase(reports),
    },
    {
      provide: ListCaseQueueUseCase,
      inject: [MODERATION_CASE_REPOSITORY, CLOCK_PROVIDER, ConfigService],
      useFactory: (
        cases: ModerationCaseRepository,
        clock: ClockProvider,
        config: ConfigService<Env, true>,
      ) => new ListCaseQueueUseCase(cases, clock, buildConfig(config)),
    },
    {
      provide: GetCaseUseCase,
      inject: [MODERATION_CASE_REPOSITORY, AUDIT_WRITER, CLOCK_PROVIDER],
      useFactory: (cases: ModerationCaseRepository, audit: AuditWriter, clock: ClockProvider) =>
        new GetCaseUseCase(cases, audit, clock),
    },
    {
      provide: AssignCaseUseCase,
      inject: [MODERATION_CASE_REPOSITORY, AUDIT_WRITER, CLOCK_PROVIDER],
      useFactory: (cases: ModerationCaseRepository, audit: AuditWriter, clock: ClockProvider) =>
        new AssignCaseUseCase(cases, audit, clock),
    },
    {
      provide: ApplyModerationActionUseCase,
      inject: [
        MODERATION_CASE_REPOSITORY,
        ACCOUNT_SANCTION_GATEWAY,
        PHOTO_MODERATION_GATEWAY,
        MESSAGE_MODERATION_GATEWAY,
        DECISION_NOTIFIER,
        AUDIT_WRITER,
        CLOCK_PROVIDER,
      ],
      useFactory: (
        cases: ModerationCaseRepository,
        sanctions: AccountSanctionGateway,
        photos: PhotoModerationGateway,
        messages: MessageModerationGateway,
        notifier: DecisionNotifier,
        audit: AuditWriter,
        clock: ClockProvider,
      ) =>
        new ApplyModerationActionUseCase(
          cases,
          sanctions,
          photos,
          messages,
          notifier,
          audit,
          clock,
        ),
    },
    {
      provide: RevertActionUseCase,
      inject: [MODERATION_CASE_REPOSITORY, ACCOUNT_SANCTION_GATEWAY, AUDIT_WRITER, CLOCK_PROVIDER],
      useFactory: (
        cases: ModerationCaseRepository,
        sanctions: AccountSanctionGateway,
        audit: AuditWriter,
        clock: ClockProvider,
      ) => new RevertActionUseCase(cases, sanctions, audit, clock),
    },
    {
      provide: EvaluateBehaviourUseCase,
      inject: [BEHAVIOUR_SOURCE, MODERATION_CASE_REPOSITORY, CLOCK_PROVIDER, ConfigService],
      useFactory: (
        behaviour: BehaviourSource,
        cases: ModerationCaseRepository,
        clock: ClockProvider,
        config: ConfigService<Env, true>,
      ) => new EvaluateBehaviourUseCase(behaviour, cases, clock, buildConfig(config)),
    },
    {
      provide: ModerationMetricsUseCase,
      inject: [MODERATION_CASE_REPOSITORY, CLOCK_PROVIDER],
      useFactory: (cases: ModerationCaseRepository, clock: ClockProvider) =>
        new ModerationMetricsUseCase(cases, clock),
    },
  ],
})
export class ModerationModule {}
