import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import type {
  ClockProvider,
  MailProvider,
  PushProvider,
  SmsProvider,
} from '../../../providers/ports';
import {
  ALL_CHANNELS,
  checkPreferenceUpdate,
  defaultChannels,
  isMandatory,
  MVP_TRIGGERS,
  purgeAt,
  resolveChannels,
  type NotificationChannel,
  type NotificationType,
  type PreferenceEntry,
} from '../domain/notification-policy';
import { classifyFailure, decideRetry, type RetryConfig } from '../domain/retry-policy';
import type {
  DeviceRepository,
  NotificationQueue,
  NotificationRepository,
  PreferenceRepository,
} from './ports';

/**
 * Hachage salé des empreintes d'appareil.
 *
 * Sous-ensemble volontairement minimal du `Hasher` du module `auth` : ce module
 * n'a besoin que de produire une empreinte, jamais de la comparer.
 */
export interface FingerprintHasher {
  hash(value: string): string;
}

export interface NotificationConfig {
  retry: RetryConfig;
  retentionDays: number;
}

export interface SendNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Identifie l'ÉVÉNEMENT, jamais l'instant : c'est ce qui déduplique. */
  dedupeKey: string;
}

/**
 * Point d'entrée unique de toute notification (stories D8-01, D8-02, D8-06).
 *
 * Les autres modules appellent ceci et rien d'autre. Trois choses s'y passent,
 * dans cet ordre :
 *
 *  1. les canaux sont résolus — préférences du membre, sauf type obligatoire,
 *     puis moyens techniquement disponibles ;
 *  2. une ligne est écrite par canal retenu, sous contrainte d'anti-doublon ;
 *  3. les canaux sortants sont mis en file. `IN_APP` ne l'est pas : l'écriture
 *     en base **est** la livraison.
 */
export class SendNotificationUseCase {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly preferences: PreferenceRepository,
    private readonly devices: DeviceRepository,
    private readonly queue: NotificationQueue,
    private readonly clock: ClockProvider,
    private readonly config: NotificationConfig,
  ) {}

  async execute(
    input: SendNotificationInput,
  ): Promise<{ channels: NotificationChannel[]; duplicate: boolean }> {
    const now = this.clock.now();

    const [preferences, contexte] = await Promise.all([
      this.preferences.listByUser(input.userId),
      this.devices.deliveryContext(input.userId),
    ]);

    const canaux = resolveChannels(input.type, preferences, contexte);
    if (canaux.length === 0) return { channels: [], duplicate: false };

    const retenus: NotificationChannel[] = [];
    let doublon = false;

    for (const canal of canaux) {
      const { id, created } = await this.notifications.createIfNew({
        userId: input.userId,
        type: input.type,
        channel: canal,
        title: input.title,
        body: input.body,
        data: input.data ?? null,
        // La clé porte le canal : un doublon sur le push ne doit pas empêcher
        // l'écriture in-app, qui est l'historique.
        dedupeKey: `${input.dedupeKey}:${canal.toLowerCase()}`,
        purgeAt: purgeAt(now, this.config.retentionDays),
        now,
      });

      if (!created) {
        doublon = true;
        continue;
      }

      retenus.push(canal);

      if (canal === 'IN_APP') {
        // Écrire, c'est livrer : aucun tiers n'intervient.
        await this.notifications.markSent(id, now);
        continue;
      }

      await this.queue.enqueue(
        {
          notificationId: id,
          userId: input.userId,
          type: input.type,
          channel: canal,
          title: input.title,
          body: input.body,
          attempt: 1,
        },
        0,
      );
    }

    return { channels: retenus, duplicate: doublon };
  }
}

/**
 * Envoi effectif sur un canal sortant (story D8-01).
 *
 * Appelé par le consommateur de la file. En cas d'échec, la décision de
 * réessayer appartient au domaine : un jeton révoqué est abandonné tout de
 * suite, un fournisseur saturé est retenté plus tard.
 *
 * Un abandon n'est pas une perte d'information : la ligne `IN_APP` a déjà été
 * écrite et reste visible dans le centre de notifications.
 */
export class DispatchNotificationUseCase {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly devices: DeviceRepository,
    private readonly queue: NotificationQueue,
    private readonly push: PushProvider,
    private readonly mail: MailProvider,
    private readonly sms: SmsProvider,
    private readonly clock: ClockProvider,
    private readonly config: NotificationConfig,
  ) {}

  async execute(job: {
    notificationId: string;
    userId: string;
    type: NotificationType;
    channel: NotificationChannel;
    title: string;
    body: string;
    attempt: number;
  }): Promise<{ delivered: boolean; retried: boolean }> {
    const now = this.clock.now();

    try {
      await this.deliver(job);
      await this.notifications.markSent(job.notificationId, now);
      return { delivered: true, retried: false };
    } catch (erreur) {
      const nature = classifyFailure(erreur);
      const decision = decideRetry(job.attempt, nature, this.config.retry);

      if (decision.action === 'GIVE_UP') {
        // Un jeton définitivement invalide est effacé : sans cela, chaque
        // notification future recréerait le même échec.
        if (nature === 'PERMANENT' && job.channel === 'PUSH') {
          await this.clearInvalidPushTokens(job.userId);
        }
        await this.notifications.markFailed(job.notificationId, decision.reason, now);
        return { delivered: false, retried: false };
      }

      await this.queue.enqueue({ ...job, attempt: decision.attempt }, decision.delayMs);
      return { delivered: false, retried: true };
    }
  }

  private async deliver(job: {
    userId: string;
    channel: NotificationChannel;
    title: string;
    body: string;
  }): Promise<void> {
    switch (job.channel) {
      case 'PUSH': {
        const jetons = await this.devices.activePushTokens(job.userId);
        if (jetons.length === 0) throw new Error('invalid token: aucun appareil enregistré');
        for (const jeton of jetons) {
          await this.push.sendToDevice(jeton, job.title, job.body);
        }
        return;
      }
      case 'EMAIL': {
        const adresse = await this.devices.verifiedEmail(job.userId);
        if (adresse === null) throw new Error('invalid recipient: aucune adresse vérifiée');
        await this.mail.send(adresse, job.title, `<p>${escapeHtml(job.body)}</p>`);
        return;
      }
      case 'SMS': {
        const numero = await this.devices.phoneE164(job.userId);
        if (numero === null) throw new Error('invalid number: aucun numéro connu');
        await this.sms.sendTransactional(numero, job.body);
        return;
      }
      case 'IN_APP':
        // Ne devrait jamais atteindre la file : l'écriture en base est la
        // livraison. On échoue bruyamment plutôt que de boucler en silence.
        throw new Error('Le canal IN_APP ne passe pas par la file d’envoi.');
    }
  }

  private async clearInvalidPushTokens(userId: string): Promise<void> {
    const jetons = await this.devices.activePushTokens(userId);
    for (const jeton of jetons) {
      await this.devices.clearPushToken(jeton);
    }
  }
}

/** Centre de notifications in-app (story D8-05). */
export class ListInboxUseCase {
  constructor(private readonly notifications: NotificationRepository) {}

  async execute(input: {
    userId: string;
    limit: number;
    cursor?: string;
    unreadOnly: boolean;
  }): Promise<unknown> {
    const [page, nonLues] = await Promise.all([
      this.notifications.listInbox(input),
      this.notifications.countUnread(input.userId),
    ]);

    return {
      items: page.items.map((notification) => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        read: notification.readAt !== null,
        createdAt: notification.createdAt.toISOString(),
      })),
      unreadCount: nonLues,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }
}

export class MarkNotificationReadUseCase {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly clock: ClockProvider,
  ) {}

  async execute(userId: string, notificationId: string): Promise<{ read: true }> {
    const applique = await this.notifications.markRead(notificationId, userId, this.clock.now());
    // 404 et non 403 : ne pas confirmer l'existence de la notification d'autrui.
    if (!applique) throw BusinessError.notFound();
    return { read: true };
  }

  async all(userId: string): Promise<{ updated: number }> {
    return this.notifications.markAllRead(userId, this.clock.now());
  }
}

export interface PreferenceView {
  type: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
  /** Verrouillée : le membre ne peut pas la désactiver (story D8-04). */
  locked: boolean;
}

/**
 * Préférences (stories D8-03, D8-04).
 *
 * La grille complète est rendue, y compris les combinaisons jamais enregistrées :
 * une interface ne devrait pas avoir à deviner ce qui existe. `locked` sert
 * l'affichage — mais il ne sert QUE l'affichage : le refus réel est appliqué
 * côté serveur à la mise à jour.
 */
export class GetPreferencesUseCase {
  constructor(private readonly preferences: PreferenceRepository) {}

  async execute(userId: string): Promise<{ items: PreferenceView[] }> {
    const enregistrees = await this.preferences.listByUser(userId);
    const items: PreferenceView[] = [];

    for (const type of MVP_TRIGGERS) {
      for (const canal of ALL_CHANNELS) {
        if (!defaultChannels(type).includes(canal)) continue;

        const enregistree = enregistrees.find(
          (entree) => entree.type === type && entree.channel === canal,
        );

        items.push({
          type,
          channel: canal,
          enabled: isMandatory(type) ? true : (enregistree?.enabled ?? true),
          locked: isMandatory(type),
        });
      }
    }

    return { items };
  }
}

export class UpdatePreferencesUseCase {
  constructor(
    private readonly preferences: PreferenceRepository,
    private readonly clock: ClockProvider,
  ) {}

  /**
   * Toute la mise à jour est refusée si une seule entrée est interdite.
   *
   * Appliquer partiellement laisserait le membre croire que sa demande a été
   * suivie, alors qu'une partie a été ignorée en silence.
   */
  async execute(userId: string, entries: PreferenceEntry[]): Promise<{ updated: number }> {
    for (const entree of entries) {
      const verdict = checkPreferenceUpdate(entree.type, entree.enabled);
      if (!verdict.allowed) {
        throw BusinessError.forbidden(ErrorCode.NOTIF_MANDATORY_TYPE, { type: entree.type });
      }
    }

    await this.preferences.upsertMany(userId, entries, this.clock.now());
    return { updated: entries.length };
  }
}

export class RegisterDeviceUseCase {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly hasher: FingerprintHasher,
    private readonly clock: ClockProvider,
  ) {}

  /**
   * L'empreinte transmise par le client n'est jamais stockée telle quelle.
   *
   * Elle agrège des signaux d'appareil ; conservée en clair, elle permettrait de
   * relier entre eux des comptes distincts. Le hachage est salé côté serveur —
   * la comparaison reste possible, la donnée d'origine non (ADR-013).
   */
  async execute(input: {
    userId: string;
    fingerprint: string;
    type: string;
    model: string | null;
    osVersion: string | null;
    appVersion: string | null;
    pushToken: string | null;
  }): Promise<{ id: string }> {
    const { fingerprint, ...reste } = input;

    return this.devices.register({
      ...reste,
      fingerprintHash: this.hasher.hash(fingerprint),
      now: this.clock.now(),
    });
  }

  async list(userId: string): Promise<unknown> {
    // Le jeton push n'est jamais rendu : seule sa présence est signalée.
    return { items: await this.devices.listByUser(userId) };
  }

  async remove(userId: string, deviceId: string): Promise<{ removed: true }> {
    const applique = await this.devices.remove(deviceId, userId);
    if (!applique) throw BusinessError.notFound();
    return { removed: true };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
