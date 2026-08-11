import type { MessagingContext } from '../domain/messaging-policy';
import type {
  AttachmentPipeline,
  AttachmentStorage,
  ConversationRepository,
  ConversationSummary,
  MessageRecord,
  MessageRepository,
  ProcessedAttachment,
  RealtimeNotifier,
  SendMessageCommand,
} from './ports';

/**
 * Doublures en mémoire des ports de la messagerie.
 *
 * Elles reproduisent le comportement OBSERVABLE des dépôts Prisma — notamment
 * l'idempotence d'envoi et la remise à zéro des non-lus — pour que les cas d'usage
 * soient testés sur des règles, pas sur des `jest.fn()` muets.
 */
export class FakeConversationRepository implements ConversationRepository {
  contexts = new Map<string, MessagingContext>();
  summaries = new Map<string, ConversationSummary>();
  streaks = new Map<string, number>();
  muted: { conversationId: string; userId: string; until: Date | null }[] = [];
  archived: { conversationId: string; userId: string; at: Date | null }[] = [];

  loadMessagingContext(conversationId: string, callerId: string): Promise<MessagingContext | null> {
    const context = this.contexts.get(conversationId);
    return Promise.resolve(context === undefined ? null : { ...context, callerId });
  }

  findSummary(conversationId: string): Promise<ConversationSummary | null> {
    return Promise.resolve(this.summaries.get(conversationId) ?? null);
  }

  listForUser(
    input: Parameters<ConversationRepository['listForUser']>[0],
  ): Promise<{ items: ConversationSummary[]; nextCursor: string | null; hasMore: boolean }> {
    const items = [...this.summaries.values()]
      .filter((summary) => input.includeArchived || summary.archivedAt === null)
      .slice(0, input.limit);
    return Promise.resolve({ items, nextCursor: null, hasMore: false });
  }

  getUnansweredStreak(conversationId: string, senderId: string): Promise<number> {
    return Promise.resolve(this.streaks.get(`${conversationId}:${senderId}`) ?? 0);
  }

  setMuted(conversationId: string, userId: string, mutedUntil: Date | null): Promise<void> {
    this.muted.push({ conversationId, userId, until: mutedUntil });
    return Promise.resolve();
  }

  setArchived(conversationId: string, userId: string, archivedAt: Date | null): Promise<void> {
    this.archived.push({ conversationId, userId, at: archivedAt });
    return Promise.resolve();
  }
}

export class FakeMessageRepository implements MessageRepository {
  messages: MessageRecord[] = [];
  commands: SendMessageCommand[] = [];
  private readonly parCle = new Map<string, MessageRecord>();
  private sequence = 0;

  send(command: SendMessageCommand): Promise<{ message: MessageRecord; alreadySent: boolean }> {
    this.commands.push(command);

    const cle = `${command.senderId}:${command.clientIdempotencyKey}`;
    const existant = this.parCle.get(cle);
    if (existant !== undefined) return Promise.resolve({ message: existant, alreadySent: true });

    this.sequence += 1;
    const message: MessageRecord = {
      id: `msg-${this.sequence}`,
      conversationId: command.conversationId,
      senderId: command.senderId,
      type: command.type,
      body: command.body,
      deliveryStatus: 'SENT',
      readAt: null,
      deletedAt: null,
      hiddenByModeration: false,
      attachments:
        command.attachment === null
          ? []
          : [
              {
                id: `att-${this.sequence}`,
                storageKey: command.attachment.storageKey,
                thumbnailStorageKey: command.attachment.thumbnailStorageKey,
                status: 'PENDING_MODERATION',
                width: command.attachment.width,
                height: command.attachment.height,
              },
            ],
      createdAt: command.now,
    };

    this.parCle.set(cle, message);
    this.messages.push(message);
    return Promise.resolve({ message, alreadySent: false });
  }

  listMessages(
    input: Parameters<MessageRepository['listMessages']>[0],
  ): Promise<{ items: MessageRecord[]; nextCursor: string | null; hasMore: boolean }> {
    const items = this.messages
      .filter((message) => message.conversationId === input.conversationId)
      .slice(0, input.limit);
    return Promise.resolve({ items, nextCursor: null, hasMore: false });
  }

  findById(messageId: string): Promise<MessageRecord | null> {
    return Promise.resolve(this.messages.find((message) => message.id === messageId) ?? null);
  }

  softDelete(messageId: string, _byUserId: string, at: Date): Promise<void> {
    const message = this.messages.find((candidat) => candidat.id === messageId);
    if (message !== undefined) {
      message.deletedAt = at;
      message.body = null;
    }
    return Promise.resolve();
  }

  markRead(
    input: Parameters<MessageRepository['markRead']>[0],
  ): Promise<{ updatedMessageIds: string[] }> {
    const updated = this.messages
      .filter(
        (message) =>
          message.conversationId === input.conversationId &&
          message.senderId !== input.readerId &&
          message.deliveryStatus !== 'READ',
      )
      .map((message) => {
        message.deliveryStatus = 'READ';
        message.readAt = input.at;
        return message.id;
      });

    return Promise.resolve({ updatedMessageIds: updated });
  }
}

export class FakeRealtimeNotifier implements RealtimeNotifier {
  created: { conversationId: string; message: MessageRecord }[] = [];
  statuses: { conversationId: string; messageIds: string[]; status: string }[] = [];
  deleted: { conversationId: string; messageId: string }[] = [];
  locked: { conversationId: string; reason: string }[] = [];

  messageCreated(conversationId: string, message: MessageRecord): void {
    this.created.push({ conversationId, message });
  }

  messageStatusChanged(conversationId: string, messageIds: string[], status: string): void {
    this.statuses.push({ conversationId, messageIds, status });
  }

  messageDeleted(conversationId: string, messageId: string): void {
    this.deleted.push({ conversationId, messageId });
  }

  conversationLocked(conversationId: string, reason: string): void {
    this.locked.push({ conversationId, reason });
  }
}

export class FakeAttachmentStorage implements AttachmentStorage {
  objects = new Map<string, { bytes: Buffer; contentType: string }>();
  signed: { key: string; ttlSeconds: number }[] = [];

  put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { bytes, contentType });
    return Promise.resolve();
  }

  signedUrl(key: string, ttlSeconds: number): Promise<string> {
    this.signed.push({ key, ttlSeconds });
    return Promise.resolve(`https://stockage.test/${key}?expires=${ttlSeconds}`);
  }
}

export class FakeAttachmentPipeline implements AttachmentPipeline {
  calls = 0;

  process(bytes: Buffer): Promise<ProcessedAttachment> {
    this.calls += 1;
    return Promise.resolve({
      full: Buffer.from(`traitee:${bytes.byteLength}`),
      thumbnail: Buffer.from('miniature'),
      width: 1080,
      height: 1080,
      contentType: 'image/webp',
    });
  }
}

/** Horloge figée : aucun test ne dépend de l'heure réelle. */
export class FixedClock {
  constructor(private readonly instant: Date) {}

  now(): Date {
    return new Date(this.instant.getTime());
  }
}
