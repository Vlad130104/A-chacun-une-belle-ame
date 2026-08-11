import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  CLOCK_PROVIDER,
  MAIL_PROVIDER,
  PUSH_PROVIDER,
  SMS_PROVIDER,
  type ClockProvider,
  type MailProvider,
  type PushProvider,
  type SmsProvider,
} from '../../providers/ports';
import { AuthModule } from '../auth/auth.module';
import { HASHER, type Hasher } from '../auth/application/ports';
import { DEFAULT_RETRY } from './domain/retry-policy';
import {
  DEVICE_REPOSITORY,
  NOTIFICATION_QUEUE,
  NOTIFICATION_REPOSITORY,
  PREFERENCE_REPOSITORY,
  type DeviceRepository,
  type NotificationQueue,
  type NotificationRepository,
  type PreferenceRepository,
} from './application/ports';
import {
  DispatchNotificationUseCase,
  GetPreferencesUseCase,
  ListInboxUseCase,
  MarkNotificationReadUseCase,
  RegisterDeviceUseCase,
  SendNotificationUseCase,
  UpdatePreferencesUseCase,
  type NotificationConfig,
} from './application/notification.use-cases';
import { BullMqNotificationQueue } from './infrastructure/bullmq.queue';
import { NotificationWorker } from './infrastructure/notification.worker';
import {
  DevicesController,
  NotificationsController,
} from './infrastructure/notifications.controller';
import {
  PrismaDeviceRepository,
  PrismaNotificationRepository,
  PrismaPreferenceRepository,
} from './infrastructure/prisma.repositories';

const buildConfig = (config: ConfigService<Env, true>): NotificationConfig => ({
  retry: {
    maxAttempts: config.get('NOTIFICATION_MAX_ATTEMPTS', { infer: true }),
    baseDelayMs: config.get('NOTIFICATION_RETRY_BASE_MS', { infer: true }),
    maxDelayMs: DEFAULT_RETRY.maxDelayMs,
  },
  retentionDays: config.get('NOTIFICATION_RETENTION_DAYS', { infer: true }),
});

/**
 * Module de notifications (tranche D8).
 *
 * Propriétaire des tables `Notification`, `NotificationPreference` et `Device`.
 *
 * `SendNotificationUseCase` est exporté : c'est le **point d'entrée unique** de
 * toute notification. Les autres modules l'appellent au lieu d'écrire eux-mêmes
 * dans la table — sinon les préférences, l'anti-doublon et les canaux sortants
 * seraient contournés par quiconque oublierait de les appliquer.
 *
 * Le producteur de file (`BullMqNotificationQueue`) et son consommateur
 * (`NotificationWorker`) sont deux fournisseurs distincts. Les réunir créerait
 * un cycle `file → dispatch → file` qui empêcherait le démarrage — c'est
 * exactement le défaut rencontré en D5 sur la passerelle temps réel, et le test
 * de résolution du conteneur l'a rattrapé de la même façon.
 */
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController, DevicesController],
  providers: [
    {
      provide: NOTIFICATION_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaNotificationRepository(prisma),
    },
    {
      provide: PREFERENCE_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaPreferenceRepository(prisma),
    },
    {
      provide: DEVICE_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaDeviceRepository(prisma),
    },

    // Producteur d'abord : il ne dépend que de la configuration. Le
    // consommateur, lui, dépend du cas d'usage de distribution — c'est ce sens
    // unique qui évite le cycle d'injection.
    BullMqNotificationQueue,
    { provide: NOTIFICATION_QUEUE, useExisting: BullMqNotificationQueue },

    {
      provide: DispatchNotificationUseCase,
      inject: [
        NOTIFICATION_REPOSITORY,
        DEVICE_REPOSITORY,
        NOTIFICATION_QUEUE,
        PUSH_PROVIDER,
        MAIL_PROVIDER,
        SMS_PROVIDER,
        CLOCK_PROVIDER,
        ConfigService,
      ],
      useFactory: (
        notifications: NotificationRepository,
        devices: DeviceRepository,
        queue: NotificationQueue,
        push: PushProvider,
        mail: MailProvider,
        sms: SmsProvider,
        clock: ClockProvider,
        config: ConfigService<Env, true>,
      ) =>
        new DispatchNotificationUseCase(
          notifications,
          devices,
          queue,
          push,
          mail,
          sms,
          clock,
          buildConfig(config),
        ),
    },

    NotificationWorker,

    {
      provide: SendNotificationUseCase,
      inject: [
        NOTIFICATION_REPOSITORY,
        PREFERENCE_REPOSITORY,
        DEVICE_REPOSITORY,
        NOTIFICATION_QUEUE,
        CLOCK_PROVIDER,
        ConfigService,
      ],
      useFactory: (
        notifications: NotificationRepository,
        preferences: PreferenceRepository,
        devices: DeviceRepository,
        queue: NotificationQueue,
        clock: ClockProvider,
        config: ConfigService<Env, true>,
      ) =>
        new SendNotificationUseCase(
          notifications,
          preferences,
          devices,
          queue,
          clock,
          buildConfig(config),
        ),
    },
    {
      provide: ListInboxUseCase,
      inject: [NOTIFICATION_REPOSITORY],
      useFactory: (notifications: NotificationRepository) => new ListInboxUseCase(notifications),
    },
    {
      provide: MarkNotificationReadUseCase,
      inject: [NOTIFICATION_REPOSITORY, CLOCK_PROVIDER],
      useFactory: (notifications: NotificationRepository, clock: ClockProvider) =>
        new MarkNotificationReadUseCase(notifications, clock),
    },
    {
      provide: GetPreferencesUseCase,
      inject: [PREFERENCE_REPOSITORY],
      useFactory: (preferences: PreferenceRepository) => new GetPreferencesUseCase(preferences),
    },
    {
      provide: UpdatePreferencesUseCase,
      inject: [PREFERENCE_REPOSITORY, CLOCK_PROVIDER],
      useFactory: (preferences: PreferenceRepository, clock: ClockProvider) =>
        new UpdatePreferencesUseCase(preferences, clock),
    },
    {
      provide: RegisterDeviceUseCase,
      inject: [DEVICE_REPOSITORY, HASHER, CLOCK_PROVIDER],
      useFactory: (devices: DeviceRepository, hasher: Hasher, clock: ClockProvider) =>
        new RegisterDeviceUseCase(devices, hasher, clock),
    },
  ],
  exports: [SendNotificationUseCase],
})
export class NotificationsModule {}
