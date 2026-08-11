import type { ContentSignal } from '../domain/message-content';
import type { MessagingContext } from '../domain/messaging-policy';

export const CONVERSATION_REPOSITORY = Symbol('ConversationRepository');
export const MESSAGE_REPOSITORY = Symbol('MessageRepository');
export const REALTIME_NOTIFIER = Symbol('RealtimeNotifier');
export const ATTACHMENT_PIPELINE = Symbol('AttachmentPipeline');
export const ATTACHMENT_STORAGE = Symbol('AttachmentStorage');

export interface ConversationSummary {
  id: string;
  matchId: string;
  status: string;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  mutedUntil: Date | null;
  archivedAt: Date | null;
  /** L'autre membre. Une conversation du MVP n'en a jamais plus de deux. */
  otherUserId: string;
  createdAt: Date;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  body: string | null;
  deliveryStatus: string;
  readAt: Date | null;
  deletedAt: Date | null;
  hiddenByModeration: boolean;
  attachments: AttachmentRecord[];
  createdAt: Date;
}

export interface AttachmentRecord {
  id: string;
  storageKey: string;
  thumbnailStorageKey: string | null;
  status: string;
  width: number | null;
  height: number | null;
}

export interface ConversationRepository {
  /**
   * Charge, en UNE requête, tout ce dont la règle centrale a besoin — et rien de
   * plus. C'est ce qui permet de l'appliquer sur chaque message sans coût.
   */
  loadMessagingContext(conversationId: string, callerId: string): Promise<MessagingContext | null>;

  findSummary(conversationId: string, userId: string): Promise<ConversationSummary | null>;

  listForUser(input: {
    userId: string;
    limit: number;
    cursor?: string;
    includeArchived: boolean;
  }): Promise<{ items: ConversationSummary[]; nextCursor: string | null; hasMore: boolean }>;

  /** Série de messages consécutifs de `senderId` sans réponse de l'autre membre. */
  getUnansweredStreak(conversationId: string, senderId: string): Promise<number>;

  setMuted(conversationId: string, userId: string, mutedUntil: Date | null): Promise<void>;
  setArchived(conversationId: string, userId: string, archivedAt: Date | null): Promise<void>;
}

export interface SendMessageCommand {
  conversationId: string;
  senderId: string;
  recipientId: string;
  type: 'TEXT' | 'IMAGE';
  body: string | null;
  preview: string;
  clientIdempotencyKey: string;
  signals: ContentSignal[];
  attachment: {
    storageKey: string;
    thumbnailStorageKey: string;
    contentType: string;
    sizeBytes: number;
    width: number;
    height: number;
  } | null;
  purgeAt: Date;
  now: Date;
}

export interface MessageRepository {
  /**
   * Insertion, compteurs de non-lus et aperçu de conversation dans UNE transaction.
   *
   * `alreadySent` distingue la ré-émission d'un envoi neuf : sur un réseau qui coupe,
   * le client rejoue sa requête et doit retrouver son message, pas en créer un second
   * (story D5-09).
   */
  send(command: SendMessageCommand): Promise<{ message: MessageRecord; alreadySent: boolean }>;

  listMessages(input: {
    conversationId: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: MessageRecord[]; nextCursor: string | null; hasMore: boolean }>;

  findById(messageId: string): Promise<MessageRecord | null>;

  /** Suppression logique : corps effacé, ligne conservée pour la modération. */
  softDelete(messageId: string, byUserId: string, at: Date): Promise<void>;

  /**
   * Marque comme lus les messages reçus jusqu'à `messageId` inclus, remet le
   * compteur de non-lus à zéro. Renvoie les identifiants réellement passés à READ,
   * pour n'émettre que les accusés utiles.
   */
  markRead(input: {
    conversationId: string;
    readerId: string;
    upToMessageId: string;
    at: Date;
  }): Promise<{ updatedMessageIds: string[] }>;
}

/**
 * Diffusion temps réel.
 *
 * Port déclaré ici, implémenté par la passerelle Socket.IO : les cas d'usage ne
 * connaissent pas le transport et restent testables sans serveur.
 */
export interface RealtimeNotifier {
  messageCreated(conversationId: string, message: MessageRecord): void;
  messageStatusChanged(conversationId: string, messageIds: string[], status: string): void;
  messageDeleted(conversationId: string, messageId: string): void;
  conversationLocked(conversationId: string, reason: string): void;
}

export interface ProcessedAttachment {
  full: Buffer;
  thumbnail: Buffer;
  width: number;
  height: number;
  contentType: string;
}

/** Même traitement que les photos de profil : format réel vérifié, EXIF supprimé. */
export interface AttachmentPipeline {
  process(bytes: Buffer): Promise<ProcessedAttachment>;
}

export interface AttachmentStorage {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
}
