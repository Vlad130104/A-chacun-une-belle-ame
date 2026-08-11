import type {
  DeliveryContext,
  NotificationChannel,
  NotificationType,
  PreferenceEntry,
} from '../domain/notification-policy';

export const NOTIFICATION_REPOSITORY = Symbol('NotificationRepository');
export const PREFERENCE_REPOSITORY = Symbol('PreferenceRepository');
export const DEVICE_REPOSITORY = Symbol('DeviceRepository');
export const NOTIFICATION_QUEUE = Symbol('NotificationQueue');

export interface NotificationRecord {
  id: string;
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: Date | null;
  sentAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
}

export interface NotificationRepository {
  /**
   * Écrit la notification si sa clé d'anti-doublon est neuve.
   *
   * `created: false` signale un doublon : la contrainte unique
   * `(userId, dedupeKey)` est l'arbitre, jamais une lecture préalable qui
   * laisserait une fenêtre de concurrence (story D8-06).
   */
  createIfNew(input: {
    userId: string;
    type: NotificationType;
    channel: NotificationChannel;
    title: string;
    body: string;
    data: Record<string, unknown> | null;
    dedupeKey: string;
    purgeAt: Date;
    now: Date;
  }): Promise<{ id: string; created: boolean }>;

  markSent(id: string, at: Date): Promise<void>;
  markFailed(id: string, reason: string, at: Date): Promise<void>;
  markDelivered(id: string, at: Date): Promise<void>;

  listInbox(input: {
    userId: string;
    limit: number;
    cursor?: string;
    unreadOnly: boolean;
  }): Promise<{ items: NotificationRecord[]; nextCursor: string | null; hasMore: boolean }>;

  countUnread(userId: string): Promise<number>;

  /** Renvoie `false` si la notification n'appartient pas à l'appelant. */
  markRead(id: string, userId: string, at: Date): Promise<boolean>;
  markAllRead(userId: string, at: Date): Promise<{ updated: number }>;
}

export interface PreferenceRepository {
  listByUser(userId: string): Promise<PreferenceEntry[]>;
  upsertMany(userId: string, entries: PreferenceEntry[], now: Date): Promise<void>;
}

export interface DeviceRecord {
  id: string;
  userId: string;
  type: string;
  model: string | null;
  lastSeenAt: Date | null;
  hasPushToken: boolean;
}

export interface DeviceRepository {
  /** Jetons push actifs d'un membre. Jamais rendus par une route publique. */
  activePushTokens(userId: string): Promise<string[]>;

  listByUser(userId: string): Promise<DeviceRecord[]>;

  register(input: {
    userId: string;
    fingerprintHash: string;
    type: string;
    model: string | null;
    osVersion: string | null;
    appVersion: string | null;
    pushToken: string | null;
    now: Date;
  }): Promise<{ id: string }>;

  remove(deviceId: string, userId: string): Promise<boolean>;

  /** Efface un jeton devenu invalide : inutile de réessayer indéfiniment. */
  clearPushToken(pushToken: string): Promise<void>;

  /** Contexte de livraison : quels canaux sont techniquement possibles. */
  deliveryContext(userId: string): Promise<DeliveryContext>;

  /** Adresse de contact e-mail vérifiée, ou `null`. */
  verifiedEmail(userId: string): Promise<string | null>;

  phoneE164(userId: string): Promise<string | null>;
}

export interface NotificationJob {
  notificationId: string;
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  attempt: number;
}

/**
 * File d'envoi.
 *
 * Le port est déclaré ici, l'implémentation BullMQ vit dans `infrastructure/` :
 * les cas d'usage ne connaissent pas Redis et restent testables sans file.
 */
export interface NotificationQueue {
  enqueue(job: NotificationJob, delayMs: number): Promise<void>;
}
