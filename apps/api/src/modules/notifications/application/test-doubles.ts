import type { MailProvider, PushProvider, SmsProvider } from '../../../providers/ports';
import type { DeliveryContext, PreferenceEntry } from '../domain/notification-policy';
import type {
  DeviceRecord,
  DeviceRepository,
  NotificationJob,
  NotificationQueue,
  NotificationRecord,
  NotificationRepository,
  PreferenceRepository,
} from './ports';

/**
 * Doublures en mémoire des ports de notification.
 *
 * Le point qui compte : `createIfNew` reproduit la contrainte unique
 * `(userId, dedupeKey)`. Sans elle, les tests d'anti-doublon ne prouveraient
 * rien du comportement réel.
 */
export class FakeNotificationRepository implements NotificationRepository {
  notifications: NotificationRecord[] = [];
  private readonly cles = new Set<string>();
  private sequence = 0;

  createIfNew(
    input: Parameters<NotificationRepository['createIfNew']>[0],
  ): Promise<{ id: string; created: boolean }> {
    const cle = `${input.userId}:${input.dedupeKey}`;
    if (this.cles.has(cle)) {
      const existante = this.notifications.find(
        (notification) => notification.userId === input.userId && notification.type === input.type,
      );
      return Promise.resolve({ id: existante?.id ?? 'existante', created: false });
    }

    this.cles.add(cle);
    this.sequence += 1;
    const notification: NotificationRecord = {
      id: `notif-${this.sequence}`,
      userId: input.userId,
      type: input.type,
      channel: input.channel,
      title: input.title,
      body: input.body,
      data: input.data,
      readAt: null,
      sentAt: null,
      failedAt: null,
      createdAt: input.now,
    };
    this.notifications.push(notification);
    return Promise.resolve({ id: notification.id, created: true });
  }

  markSent(id: string, at: Date): Promise<void> {
    const notification = this.find(id);
    if (notification !== undefined) notification.sentAt = at;
    return Promise.resolve();
  }

  markFailed(id: string, _reason: string, at: Date): Promise<void> {
    const notification = this.find(id);
    if (notification !== undefined) notification.failedAt = at;
    return Promise.resolve();
  }

  markDelivered(): Promise<void> {
    return Promise.resolve();
  }

  listInbox(
    input: Parameters<NotificationRepository['listInbox']>[0],
  ): ReturnType<NotificationRepository['listInbox']> {
    const items = this.notifications
      .filter(
        (notification) =>
          notification.userId === input.userId &&
          notification.channel === 'IN_APP' &&
          (!input.unreadOnly || notification.readAt === null),
      )
      .slice(0, input.limit);
    return Promise.resolve({ items, nextCursor: null, hasMore: false });
  }

  countUnread(userId: string): Promise<number> {
    return Promise.resolve(
      this.notifications.filter(
        (notification) =>
          notification.userId === userId &&
          notification.channel === 'IN_APP' &&
          notification.readAt === null,
      ).length,
    );
  }

  markRead(id: string, userId: string, at: Date): Promise<boolean> {
    const notification = this.notifications.find(
      (candidate) => candidate.id === id && candidate.userId === userId,
    );
    if (notification === undefined) return Promise.resolve(false);
    notification.readAt = at;
    return Promise.resolve(true);
  }

  markAllRead(userId: string, at: Date): Promise<{ updated: number }> {
    let updated = 0;
    for (const notification of this.notifications) {
      if (notification.userId === userId && notification.readAt === null) {
        notification.readAt = at;
        updated += 1;
      }
    }
    return Promise.resolve({ updated });
  }

  private find(id: string): NotificationRecord | undefined {
    return this.notifications.find((notification) => notification.id === id);
  }
}

export class FakePreferenceRepository implements PreferenceRepository {
  entries: PreferenceEntry[] = [];

  listByUser(): Promise<PreferenceEntry[]> {
    return Promise.resolve(this.entries);
  }

  upsertMany(_userId: string, entries: PreferenceEntry[]): Promise<void> {
    for (const entree of entries) {
      const index = this.entries.findIndex(
        (candidate) => candidate.type === entree.type && candidate.channel === entree.channel,
      );
      if (index >= 0) this.entries[index] = entree;
      else this.entries.push(entree);
    }
    return Promise.resolve();
  }
}

export class FakeDeviceRepository implements DeviceRepository {
  pushTokens: string[] = ['jeton-push-1'];
  email: string | null = 'membre@example.test';
  phone: string | null = '+237699001122';
  devices: DeviceRecord[] = [];
  clearedTokens: string[] = [];
  registered: Parameters<DeviceRepository['register']>[0][] = [];

  activePushTokens(): Promise<string[]> {
    return Promise.resolve(this.pushTokens);
  }

  listByUser(): Promise<DeviceRecord[]> {
    return Promise.resolve(this.devices);
  }

  register(input: Parameters<DeviceRepository['register']>[0]): Promise<{ id: string }> {
    this.registered.push(input);
    const id = `device-${this.devices.length + 1}`;
    this.devices.push({
      id,
      userId: input.userId,
      type: input.type,
      model: input.model,
      lastSeenAt: input.now,
      hasPushToken: input.pushToken !== null,
    });
    return Promise.resolve({ id });
  }

  remove(deviceId: string, userId: string): Promise<boolean> {
    const index = this.devices.findIndex(
      (device) => device.id === deviceId && device.userId === userId,
    );
    if (index < 0) return Promise.resolve(false);
    this.devices.splice(index, 1);
    return Promise.resolve(true);
  }

  clearPushToken(pushToken: string): Promise<void> {
    this.clearedTokens.push(pushToken);
    this.pushTokens = this.pushTokens.filter((jeton) => jeton !== pushToken);
    return Promise.resolve();
  }

  deliveryContext(): Promise<DeliveryContext> {
    return Promise.resolve({
      hasPushToken: this.pushTokens.length > 0,
      hasVerifiedEmail: this.email !== null,
      hasPhone: this.phone !== null,
    });
  }

  verifiedEmail(): Promise<string | null> {
    return Promise.resolve(this.email);
  }

  phoneE164(): Promise<string | null> {
    return Promise.resolve(this.phone);
  }
}

export class FakeQueue implements NotificationQueue {
  jobs: { job: NotificationJob; delayMs: number }[] = [];

  enqueue(job: NotificationJob, delayMs: number): Promise<void> {
    this.jobs.push({ job, delayMs });
    return Promise.resolve();
  }
}

/** Fournisseurs de test dont l'échec est pilotable. */
export class FakePushProvider implements PushProvider {
  readonly name = 'FakePushProvider';
  readonly simulated = true;

  sent: { token: string; title: string }[] = [];
  failWith: Error | null = null;

  sendToDevice(pushToken: string, title: string): Promise<void> {
    if (this.failWith !== null) return Promise.reject(this.failWith);
    this.sent.push({ token: pushToken, title });
    return Promise.resolve();
  }
}

export class FakeMailProvider implements MailProvider {
  readonly name = 'FakeMailProvider';
  readonly simulated = true;

  sent: { to: string; subject: string; html: string }[] = [];
  failWith: Error | null = null;

  send(to: string, subject: string, html: string): Promise<void> {
    if (this.failWith !== null) return Promise.reject(this.failWith);
    this.sent.push({ to, subject, html });
    return Promise.resolve();
  }
}

export class FakeSmsProvider implements SmsProvider {
  readonly name = 'FakeSmsProvider';
  readonly simulated = true;

  sent: { phone: string; body: string }[] = [];

  sendOtp(): Promise<void> {
    return Promise.resolve();
  }

  sendTransactional(phoneE164: string, body: string): Promise<void> {
    this.sent.push({ phone: phoneE164, body });
    return Promise.resolve();
  }
}

/** Horloge figée : aucun test ne dépend de l'heure réelle. */
export class FixedClock {
  constructor(private readonly instant: Date) {}

  now(): Date {
    return new Date(this.instant.getTime());
  }
}
