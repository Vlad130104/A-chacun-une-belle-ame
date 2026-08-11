import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import type { ClockProvider } from '../../../providers/ports';
import { buildPreview, detectContentSignals, validateMessageBody } from '../domain/message-content';
import {
  canDeleteMessage,
  checkCanSendMessage,
  checkConversationAccess,
  type MessagingContext,
  type MessagingDenial,
} from '../domain/messaging-policy';
import type {
  AttachmentPipeline,
  AttachmentStorage,
  ConversationRepository,
  ConversationSummary,
  MessageRecord,
  MessageRepository,
  RealtimeNotifier,
} from './ports';

export interface MessagingConfig {
  unansweredLimit: number;
  retentionMonths: number;
  maxAttachmentBytes: number;
  signedUrlTtlSeconds: number;
}

/**
 * Vue d'un message telle qu'elle sort de l'API.
 *
 * `storageKey` n'y figure jamais : le client ne reçoit que des URL signées à durée
 * limitée. Un test vérifie la liste exacte des clés de cet objet.
 */
export interface MessageView {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  body: string | null;
  deliveryStatus: string;
  deleted: boolean;
  attachments: { id: string; url: string | null; thumbnailUrl: string | null; status: string }[];
  createdAt: string;
}

/**
 * Traduction d'un refus du domaine en erreur métier.
 *
 * `NOT_A_MEMBER` devient un 404 et non un 403 : répondre « interdit » sur une
 * conversation existante et « introuvable » sur une conversation inexistante
 * donnerait un oracle permettant d'énumérer les conversations d'autrui. Le
 * catalogue d'API (docs/05-api.md §6) est corrigé en ce sens.
 */
function toBusinessError(reason: MessagingDenial): BusinessError {
  switch (reason) {
    case 'NOT_A_MEMBER':
      return BusinessError.notFound();
    case 'CONVERSATION_LOCKED':
      return BusinessError.forbidden(ErrorCode.MSG_CONVERSATION_LOCKED);
    case 'AWAITING_REPLY':
      return BusinessError.forbidden(ErrorCode.MSG_AWAITING_REPLY);
    // Les quatre motifs restants disent tous la même chose au membre : « il n'y a
    // pas d'accord mutuel actif ». Les distinguer dans la réponse révélerait qu'un
    // blocage existe, ou qu'un compte a été suspendu. Ils sont énumérés plutôt que
    // regroupés sous un `default` pour qu'un futur motif force une décision ici.
    case 'NO_MATCH':
    case 'BLOCKED':
    case 'ACCOUNT_NOT_ACTIVE':
    case 'NOT_VERIFIED':
      return BusinessError.forbidden(ErrorCode.MSG_NO_MATCH);
  }
}

/**
 * LE garde unique de la messagerie (story D5-02).
 *
 * La route HTTP et l'événement Socket.IO passent tous les deux par ce service. Il
 * n'existe pas de second chemin : c'est ce qui rend la règle vérifiable plutôt que
 * simplement écrite.
 */
export class ConversationAccessService {
  constructor(private readonly conversations: ConversationRepository) {}

  async assertCanRead(userId: string, conversationId: string): Promise<MessagingContext> {
    const context = await this.conversations.loadMessagingContext(conversationId, userId);
    // Conversation inexistante et conversation d'autrui donnent la même réponse.
    if (context === null) throw BusinessError.notFound();

    const verdict = checkConversationAccess(context);
    if (!verdict.allowed) throw toBusinessError(verdict.reason);

    return context;
  }
}

export class ListConversationsUseCase {
  constructor(private readonly conversations: ConversationRepository) {}

  async execute(input: {
    userId: string;
    limit: number;
    cursor?: string;
    includeArchived: boolean;
  }): Promise<{ items: ConversationSummary[]; nextCursor: string | null; hasMore: boolean }> {
    return this.conversations.listForUser(input);
  }
}

export class GetConversationUseCase {
  constructor(
    private readonly access: ConversationAccessService,
    private readonly conversations: ConversationRepository,
  ) {}

  async execute(userId: string, conversationId: string): Promise<ConversationSummary> {
    await this.access.assertCanRead(userId, conversationId);

    const summary = await this.conversations.findSummary(conversationId, userId);
    if (summary === null) throw BusinessError.notFound();

    return summary;
  }
}

export class ListMessagesUseCase {
  constructor(
    private readonly access: ConversationAccessService,
    private readonly messages: MessageRepository,
    private readonly storage: AttachmentStorage,
    private readonly config: MessagingConfig,
  ) {}

  async execute(input: {
    userId: string;
    conversationId: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: MessageView[]; nextCursor: string | null; hasMore: boolean }> {
    await this.access.assertCanRead(input.userId, input.conversationId);

    const page = await this.messages.listMessages(input);
    const items = await Promise.all(
      page.items.map((message) => toView(message, this.storage, this.config)),
    );

    return { items, nextCursor: page.nextCursor, hasMore: page.hasMore };
  }
}

export interface SendMessageInput {
  userId: string;
  conversationId: string;
  body: string;
  clientIdempotencyKey: string;
}

/**
 * Envoi d'un message texte — partagé mot pour mot entre `POST /conversations/:id/messages`
 * et l'événement Socket.IO `message:send`.
 */
export class SendMessageUseCase {
  constructor(
    private readonly access: ConversationAccessService,
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly realtime: RealtimeNotifier,
    private readonly storage: AttachmentStorage,
    private readonly clock: ClockProvider,
    private readonly config: MessagingConfig,
  ) {}

  async execute(input: SendMessageInput): Promise<MessageView> {
    const context = await this.access.assertCanRead(input.userId, input.conversationId);

    const contenu = validateMessageBody(input.body);
    if (!contenu.valid) {
      throw contenu.error === 'TOO_LONG'
        ? BusinessError.badRequest(ErrorCode.MSG_TOO_LONG)
        : BusinessError.badRequest(ErrorCode.VALIDATION_FAILED, { field: 'body' });
    }

    const streak = await this.conversations.getUnansweredStreak(input.conversationId, input.userId);
    const verdict = checkCanSendMessage({
      ...context,
      unansweredStreak: streak,
      unansweredLimit: this.config.unansweredLimit,
    });
    if (!verdict.allowed) throw toBusinessError(verdict.reason);

    const now = this.clock.now();
    const { message, alreadySent } = await this.messages.send({
      conversationId: input.conversationId,
      senderId: input.userId,
      recipientId: otherMember(context),
      type: 'TEXT',
      body: contenu.body,
      preview: buildPreview(contenu.body, 'TEXT'),
      clientIdempotencyKey: input.clientIdempotencyKey,
      // Le contenu passe ; les signaux alimentent la file de modération (D6-08).
      signals: detectContentSignals(contenu.body),
      attachment: null,
      purgeAt: addMonths(now, this.config.retentionMonths),
      now,
    });

    // Une ré-émission ne rediffuse rien : le destinataire a déjà reçu ce message,
    // et une notification en double serait perçue comme un second message.
    if (!alreadySent) this.realtime.messageCreated(input.conversationId, message);

    return toView(message, this.storage, this.config);
  }
}

export interface SendAttachmentInput {
  userId: string;
  conversationId: string;
  bytes: Buffer;
  clientIdempotencyKey: string;
}

/**
 * Image jointe (story D5-05).
 *
 * L'image est stockée mais reste `PENDING_MODERATION` : le destinataire voit un
 * message, pas encore l'image. C'est le seul ordre acceptable — modérer après
 * affichage reviendrait à ne pas modérer.
 */
export class SendAttachmentUseCase {
  constructor(
    private readonly access: ConversationAccessService,
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly pipeline: AttachmentPipeline,
    private readonly storage: AttachmentStorage,
    private readonly realtime: RealtimeNotifier,
    private readonly clock: ClockProvider,
    private readonly config: MessagingConfig,
  ) {}

  async execute(input: SendAttachmentInput): Promise<MessageView> {
    const context = await this.access.assertCanRead(input.userId, input.conversationId);

    if (input.bytes.byteLength > this.config.maxAttachmentBytes) {
      throw BusinessError.badRequest(ErrorCode.MEDIA_TOO_LARGE, {
        maxBytes: this.config.maxAttachmentBytes,
      });
    }

    const streak = await this.conversations.getUnansweredStreak(input.conversationId, input.userId);
    const verdict = checkCanSendMessage({
      ...context,
      unansweredStreak: streak,
      unansweredLimit: this.config.unansweredLimit,
    });
    if (!verdict.allowed) throw toBusinessError(verdict.reason);

    // Le format réel est déduit des octets, jamais du nom de fichier ni de
    // l'en-tête déclaré par le client (même traitement que les photos de profil).
    const image = await this.pipeline.process(input.bytes);

    const now = this.clock.now();
    const base = `conversations/${input.conversationId}/${input.userId}/${now.getTime()}`;
    const storageKey = `${base}.webp`;
    const thumbnailStorageKey = `${base}-thumb.webp`;

    await this.storage.put(storageKey, image.full, image.contentType);
    await this.storage.put(thumbnailStorageKey, image.thumbnail, image.contentType);

    const { message, alreadySent } = await this.messages.send({
      conversationId: input.conversationId,
      senderId: input.userId,
      recipientId: otherMember(context),
      type: 'IMAGE',
      body: null,
      preview: buildPreview('', 'IMAGE'),
      clientIdempotencyKey: input.clientIdempotencyKey,
      signals: [],
      attachment: {
        storageKey,
        thumbnailStorageKey,
        contentType: image.contentType,
        sizeBytes: image.full.byteLength,
        width: image.width,
        height: image.height,
      },
      purgeAt: addMonths(now, this.config.retentionMonths),
      now,
    });

    if (!alreadySent) this.realtime.messageCreated(input.conversationId, message);

    return toView(message, this.storage, this.config);
  }
}

export class MarkReadUseCase {
  constructor(
    private readonly access: ConversationAccessService,
    private readonly messages: MessageRepository,
    private readonly realtime: RealtimeNotifier,
    private readonly clock: ClockProvider,
  ) {}

  async execute(input: {
    userId: string;
    conversationId: string;
    upToMessageId: string;
  }): Promise<{ updated: number }> {
    await this.access.assertCanRead(input.userId, input.conversationId);

    const { updatedMessageIds } = await this.messages.markRead({
      conversationId: input.conversationId,
      readerId: input.userId,
      upToMessageId: input.upToMessageId,
      at: this.clock.now(),
    });

    if (updatedMessageIds.length > 0) {
      this.realtime.messageStatusChanged(input.conversationId, updatedMessageIds, 'READ');
    }

    return { updated: updatedMessageIds.length };
  }
}

export class DeleteMessageUseCase {
  constructor(
    private readonly access: ConversationAccessService,
    private readonly messages: MessageRepository,
    private readonly realtime: RealtimeNotifier,
    private readonly clock: ClockProvider,
  ) {}

  async execute(userId: string, messageId: string): Promise<void> {
    const message = await this.messages.findById(messageId);
    // 404 avant tout contrôle de propriété : ne pas confirmer l'existence
    // d'un message qu'on n'a pas écrit.
    if (message === null) throw BusinessError.notFound();

    await this.access.assertCanRead(userId, message.conversationId);

    if (!canDeleteMessage(message, userId)) throw BusinessError.notFound();

    await this.messages.softDelete(messageId, userId, this.clock.now());
    this.realtime.messageDeleted(message.conversationId, messageId);
  }
}

export class SetConversationFlagsUseCase {
  constructor(
    private readonly access: ConversationAccessService,
    private readonly conversations: ConversationRepository,
    private readonly clock: ClockProvider,
  ) {}

  async mute(userId: string, conversationId: string, until: Date | null): Promise<void> {
    await this.access.assertCanRead(userId, conversationId);
    await this.conversations.setMuted(conversationId, userId, until);
  }

  async archive(userId: string, conversationId: string, archived: boolean): Promise<void> {
    await this.access.assertCanRead(userId, conversationId);
    await this.conversations.setArchived(
      conversationId,
      userId,
      archived ? this.clock.now() : null,
    );
  }
}

/** L'autre membre de la conversation. Le MVP n'en compte jamais plus de deux. */
function otherMember(context: MessagingContext): string {
  const autre = context.members.find((member) => member.userId !== context.callerId);
  if (autre === undefined) {
    // Ne peut survenir que sur une donnée corrompue : on échoue bruyamment plutôt
    // que d'écrire un message sans destinataire.
    throw BusinessError.forbidden(ErrorCode.MSG_NO_MATCH);
  }
  return autre.userId;
}

function addMonths(from: Date, months: number): Date {
  const date = new Date(from.getTime());
  date.setUTCMonth(date.getUTCMonth() + months);
  return date;
}

/**
 * Sérialisation vers le client.
 *
 * Un message supprimé ou masqué par la modération sort avec un corps `null` : le
 * contenu n'est pas seulement caché à l'affichage, il n'est pas transmis.
 */
async function toView(
  message: MessageRecord,
  storage: AttachmentStorage,
  config: MessagingConfig,
): Promise<MessageView> {
  const masque = message.deletedAt !== null || message.hiddenByModeration;

  const attachments = await Promise.all(
    message.attachments.map(async (attachment) => {
      // Une image non approuvée ne reçoit aucune URL : le destinataire sait qu'une
      // image arrive, il ne peut pas la voir avant modération.
      const visible = !masque && attachment.status === 'APPROVED';
      return {
        id: attachment.id,
        status: attachment.status,
        url: visible
          ? await storage.signedUrl(attachment.storageKey, config.signedUrlTtlSeconds)
          : null,
        thumbnailUrl:
          visible && attachment.thumbnailStorageKey !== null
            ? await storage.signedUrl(attachment.thumbnailStorageKey, config.signedUrlTtlSeconds)
            : null,
      };
    }),
  );

  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    type: message.type,
    body: masque ? null : message.body,
    deliveryStatus: message.deliveryStatus,
    deleted: masque,
    attachments,
    createdAt: message.createdAt.toISOString(),
  };
}
