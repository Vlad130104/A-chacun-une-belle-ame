import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import type { Env } from '../../config/env.schema';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CLOCK_PROVIDER, type ClockProvider } from '../../providers/ports';
import { AuthModule } from '../auth/auth.module';
import { ProfilesModule } from '../profiles/profiles.module';
import {
  MEDIA_PIPELINE,
  MEDIA_STORAGE,
  type MediaPipeline,
  type MediaStorage,
} from '../profiles/application/ports';
import { CONVERSATION_GATEWAY } from '../discovery/application/ports';
import { MESSAGE_MODERATION_GATEWAY } from '../moderation/application/ports';
import { PrismaMessageModerationGateway } from './infrastructure/message-moderation.gateway';
import {
  ATTACHMENT_PIPELINE,
  ATTACHMENT_STORAGE,
  CONVERSATION_REPOSITORY,
  MESSAGE_REPOSITORY,
  REALTIME_NOTIFIER,
  type AttachmentPipeline,
  type AttachmentStorage,
  type ConversationRepository,
  type MessageRepository,
  type RealtimeNotifier,
} from './application/ports';
import {
  ConversationAccessService,
  DeleteMessageUseCase,
  GetConversationUseCase,
  ListConversationsUseCase,
  ListMessagesUseCase,
  MarkReadUseCase,
  SendAttachmentUseCase,
  SendMessageUseCase,
  SetConversationFlagsUseCase,
  type MessagingConfig,
} from './application/conversation.use-cases';
import { PrismaConversationGateway } from './infrastructure/conversation.gateway';
import { ConversationMemberGuard } from './infrastructure/conversation-member.guard';
import { ConversationsController } from './infrastructure/conversations.controller';
import { RealtimeGateway } from './infrastructure/realtime.gateway';
import { SocketRealtimeNotifier } from './infrastructure/socket-realtime.notifier';
import {
  PrismaConversationRepository,
  PrismaMessageRepository,
} from './infrastructure/prisma.repositories';

const buildConfig = (config: ConfigService<Env, true>): MessagingConfig => ({
  unansweredLimit: config.get('UNANSWERED_MESSAGE_LIMIT', { infer: true }),
  retentionMonths: config.get('MESSAGE_RETENTION_MONTHS', { infer: true }),
  maxAttachmentBytes: config.get('MAX_UPLOAD_SIZE_BYTES', { infer: true }),
  signedUrlTtlSeconds: config.get('SIGNED_URL_TTL_SECONDS', { infer: true }),
});

/**
 * Module des conversations et de la messagerie (tranche D5).
 *
 * Propriétaire des tables `Conversation`, `ConversationMember`, `Message` et
 * `MessageAttachment`. Le module `discovery` crée et verrouille les conversations
 * à travers `CONVERSATION_GATEWAY` : il n'écrit jamais ici directement.
 *
 * Le traitement d'image est celui des photos de profil, consommé par un port
 * déclaré ici : la messagerie ne réimplémente pas un second pipeline, et ne
 * dépend pas non plus des types internes du module `profiles`.
 */
@Module({
  imports: [AuthModule, ProfilesModule],
  controllers: [ConversationsController],
  providers: [
    {
      provide: CONVERSATION_GATEWAY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaConversationGateway(prisma),
    },
    {
      provide: CONVERSATION_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaConversationRepository(prisma),
    },
    {
      provide: MESSAGE_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaMessageRepository(prisma),
    },
    // Port déclaré par le module `moderation`, implémenté ici : la table
    // `Message` appartient à `conversations`.
    {
      provide: MESSAGE_MODERATION_GATEWAY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaMessageModerationGateway(prisma),
    },

    // Les deux ports média se branchent sur les implémentations déjà éprouvées
    // par la tranche D3 : même vérification du format réel, même suppression
    // des métadonnées EXIF.
    {
      provide: ATTACHMENT_PIPELINE,
      inject: [MEDIA_PIPELINE],
      useFactory: (pipeline: MediaPipeline): AttachmentPipeline => pipeline,
    },
    {
      provide: ATTACHMENT_STORAGE,
      inject: [MEDIA_STORAGE],
      useFactory: (storage: MediaStorage): AttachmentStorage => storage,
    },

    {
      provide: ConversationAccessService,
      inject: [CONVERSATION_REPOSITORY],
      useFactory: (conversations: ConversationRepository) =>
        new ConversationAccessService(conversations),
    },

    // Émission et réception sont deux fournisseurs distincts : la passerelle
    // appelle les cas d'usage, les cas d'usage appellent le diffuseur. Les réunir
    // recréerait un cycle d'injection (voir socket-realtime.notifier.ts).
    SocketRealtimeNotifier,
    { provide: REALTIME_NOTIFIER, useExisting: SocketRealtimeNotifier },
    RealtimeGateway,

    {
      provide: ListConversationsUseCase,
      inject: [CONVERSATION_REPOSITORY],
      useFactory: (conversations: ConversationRepository) =>
        new ListConversationsUseCase(conversations),
    },
    {
      provide: GetConversationUseCase,
      inject: [ConversationAccessService, CONVERSATION_REPOSITORY],
      useFactory: (access: ConversationAccessService, conversations: ConversationRepository) =>
        new GetConversationUseCase(access, conversations),
    },
    {
      provide: ListMessagesUseCase,
      inject: [ConversationAccessService, MESSAGE_REPOSITORY, ATTACHMENT_STORAGE, ConfigService],
      useFactory: (
        access: ConversationAccessService,
        messages: MessageRepository,
        storage: AttachmentStorage,
        config: ConfigService<Env, true>,
      ) => new ListMessagesUseCase(access, messages, storage, buildConfig(config)),
    },
    {
      provide: SendMessageUseCase,
      inject: [
        ConversationAccessService,
        CONVERSATION_REPOSITORY,
        MESSAGE_REPOSITORY,
        REALTIME_NOTIFIER,
        ATTACHMENT_STORAGE,
        CLOCK_PROVIDER,
        ConfigService,
      ],
      useFactory: (
        access: ConversationAccessService,
        conversations: ConversationRepository,
        messages: MessageRepository,
        realtime: RealtimeNotifier,
        storage: AttachmentStorage,
        clock: ClockProvider,
        config: ConfigService<Env, true>,
      ) =>
        new SendMessageUseCase(
          access,
          conversations,
          messages,
          realtime,
          storage,
          clock,
          buildConfig(config),
        ),
    },
    {
      provide: SendAttachmentUseCase,
      inject: [
        ConversationAccessService,
        CONVERSATION_REPOSITORY,
        MESSAGE_REPOSITORY,
        ATTACHMENT_PIPELINE,
        ATTACHMENT_STORAGE,
        REALTIME_NOTIFIER,
        CLOCK_PROVIDER,
        ConfigService,
      ],
      useFactory: (
        access: ConversationAccessService,
        conversations: ConversationRepository,
        messages: MessageRepository,
        pipeline: AttachmentPipeline,
        storage: AttachmentStorage,
        realtime: RealtimeNotifier,
        clock: ClockProvider,
        config: ConfigService<Env, true>,
      ) =>
        new SendAttachmentUseCase(
          access,
          conversations,
          messages,
          pipeline,
          storage,
          realtime,
          clock,
          buildConfig(config),
        ),
    },
    {
      provide: MarkReadUseCase,
      inject: [ConversationAccessService, MESSAGE_REPOSITORY, REALTIME_NOTIFIER, CLOCK_PROVIDER],
      useFactory: (
        access: ConversationAccessService,
        messages: MessageRepository,
        realtime: RealtimeNotifier,
        clock: ClockProvider,
      ) => new MarkReadUseCase(access, messages, realtime, clock),
    },
    {
      provide: DeleteMessageUseCase,
      inject: [ConversationAccessService, MESSAGE_REPOSITORY, REALTIME_NOTIFIER, CLOCK_PROVIDER],
      useFactory: (
        access: ConversationAccessService,
        messages: MessageRepository,
        realtime: RealtimeNotifier,
        clock: ClockProvider,
      ) => new DeleteMessageUseCase(access, messages, realtime, clock),
    },
    {
      provide: SetConversationFlagsUseCase,
      inject: [ConversationAccessService, CONVERSATION_REPOSITORY, CLOCK_PROVIDER],
      useFactory: (
        access: ConversationAccessService,
        conversations: ConversationRepository,
        clock: ClockProvider,
      ) => new SetConversationFlagsUseCase(access, conversations, clock),
    },

    // Enregistré globalement : le drapeau `conversationMember` d'une politique de
    // route devient ainsi un contrôle réel, sur toute route qui le déclare.
    { provide: APP_GUARD, useClass: ConversationMemberGuard },
  ],
  exports: [CONVERSATION_GATEWAY, MESSAGE_MODERATION_GATEWAY],
})
export class ConversationsModule {}
