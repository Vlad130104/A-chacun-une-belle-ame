import { Injectable } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { buildPage, decodeCursor } from '../../../common/pagination/cursor';
import type { DeliveryContext, PreferenceEntry } from '../domain/notification-policy';
import type {
  DeviceRecord,
  DeviceRepository,
  NotificationRecord,
  NotificationRepository,
  PreferenceRepository,
} from '../application/ports';

const UNIQUE_VIOLATION = 'P2002';

/**
 * Le port parle en `string` pour ne pas imposer Prisma au domaine. La conversion
 * est validée ici : un type d'appareil inconnu échoue bruyamment plutôt que
 * d'être écrit en base par un `as`.
 */
function toDeviceType(type: string): $Enums.DeviceType {
  if (!(type in $Enums.DeviceType)) throw new Error(`Type d’appareil inconnu : ${type}`);
  return type as $Enums.DeviceType;
}

const NOTIFICATION_SELECT = {
  id: true,
  userId: true,
  type: true,
  channel: true,
  title: true,
  body: true,
  data: true,
  readAt: true,
  sentAt: true,
  failedAt: true,
  createdAt: true,
} as const;

type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof NOTIFICATION_SELECT }>;

function toRecord(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    channel: row.channel,
    title: row.title,
    body: row.body,
    data: row.data === null ? null : (row.data as Record<string, unknown>),
    readAt: row.readAt,
    sentAt: row.sentAt,
    failedAt: row.failedAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * L'anti-doublon repose sur la contrainte unique `(userId, dedupeKey)`.
   *
   * On tente l'insertion et on interprète le refus. Une lecture préalable
   * laisserait une fenêtre entre le contrôle et l'écriture, dans laquelle deux
   * déclenchements simultanés passeraient tous les deux (story D8-06).
   */
  async createIfNew(
    input: Parameters<NotificationRepository['createIfNew']>[0],
  ): Promise<{ id: string; created: boolean }> {
    try {
      const cree = await this.prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          channel: input.channel,
          title: input.title.slice(0, 140),
          body: input.body.slice(0, 500),
          data: input.data === null ? Prisma.JsonNull : (input.data as Prisma.InputJsonValue),
          dedupeKey: input.dedupeKey,
          purgeAt: input.purgeAt,
          createdAt: input.now,
        },
        select: { id: true },
      });
      return { id: cree.id, created: true };
    } catch (erreur) {
      if (
        erreur instanceof Prisma.PrismaClientKnownRequestError &&
        erreur.code === UNIQUE_VIOLATION
      ) {
        const existante = await this.prisma.notification.findUnique({
          where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } },
          select: { id: true },
        });
        if (existante !== null) return { id: existante.id, created: false };
      }
      throw erreur;
    }
  }

  async markSent(id: string, at: Date): Promise<void> {
    await this.prisma.notification.update({ where: { id }, data: { sentAt: at } });
  }

  async markFailed(id: string, reason: string, at: Date): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: { failedAt: at, failureReason: reason.slice(0, 300) },
    });
  }

  async markDelivered(id: string, at: Date): Promise<void> {
    await this.prisma.notification.update({ where: { id }, data: { deliveredAt: at } });
  }

  async listInbox(input: {
    userId: string;
    limit: number;
    cursor?: string;
    unreadOnly: boolean;
  }): Promise<{ items: NotificationRecord[]; nextCursor: string | null; hasMore: boolean }> {
    const curseur = input.cursor === undefined ? null : decodeCursor(input.cursor);

    const rows = await this.prisma.notification.findMany({
      where: {
        userId: input.userId,
        // Le centre n'affiche que l'in-app : les lignes push et e-mail sont un
        // journal d'envoi, pas un contenu destiné à être relu par le membre.
        channel: 'IN_APP',
        ...(input.unreadOnly ? { readAt: null } : {}),
        ...(curseur === null
          ? {}
          : {
              OR: [
                { createdAt: { lt: new Date(curseur.createdAt) } },
                { createdAt: new Date(curseur.createdAt), id: { lt: curseur.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      select: NOTIFICATION_SELECT,
    });

    const page = buildPage(rows, input.limit);
    return { items: page.items.map(toRecord), nextCursor: page.nextCursor, hasMore: page.hasMore };
  }

  countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, channel: 'IN_APP', readAt: null },
    });
  }

  async markRead(id: string, userId: string, at: Date): Promise<boolean> {
    // Filtré sur `userId` : impossible de marquer la notification d'autrui,
    // même en connaissant son identifiant.
    const resultat = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: at },
    });

    if (resultat.count > 0) return true;

    // Déjà lue : l'opération est idempotente, pas une erreur.
    const existe = await this.prisma.notification.count({ where: { id, userId } });
    return existe > 0;
  }

  async markAllRead(userId: string, at: Date): Promise<{ updated: number }> {
    const resultat = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: at },
    });
    return { updated: resultat.count };
  }
}

@Injectable()
export class PrismaPreferenceRepository implements PreferenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByUser(userId: string): Promise<PreferenceEntry[]> {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { userId },
      select: { type: true, channel: true, enabled: true },
    });

    return rows.map((row) => ({
      type: row.type,
      channel: row.channel,
      enabled: row.enabled,
    }));
  }

  async upsertMany(userId: string, entries: PreferenceEntry[], now: Date): Promise<void> {
    // Une seule transaction : une mise à jour partielle laisserait le membre
    // avec des réglages qu'il n'a pas demandés.
    await this.prisma.$transaction(
      entries.map((entree) =>
        this.prisma.notificationPreference.upsert({
          where: {
            userId_type_channel: {
              userId,
              type: entree.type,
              channel: entree.channel,
            },
          },
          create: {
            userId,
            type: entree.type,
            channel: entree.channel,
            enabled: entree.enabled,
          },
          update: { enabled: entree.enabled, updatedAt: now },
        }),
      ),
    );
  }
}

@Injectable()
export class PrismaDeviceRepository implements DeviceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async activePushTokens(userId: string): Promise<string[]> {
    const rows = await this.prisma.device.findMany({
      where: { userId, pushToken: { not: null } },
      select: { pushToken: true },
    });

    return rows.map((row) => row.pushToken).filter((jeton): jeton is string => jeton !== null);
  }

  async listByUser(userId: string): Promise<DeviceRecord[]> {
    const rows = await this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
      // `pushToken` n'est PAS sélectionné : il ne doit jamais remonter jusqu'à
      // une réponse d'API, seulement sa présence.
      select: { id: true, userId: true, type: true, model: true, lastSeenAt: true },
    });

    const avecJeton = await this.prisma.device.findMany({
      where: { userId, pushToken: { not: null } },
      select: { id: true },
    });
    const idsAvecJeton = new Set(avecJeton.map((row) => row.id));

    return rows.map((row) => ({ ...row, hasPushToken: idsAvecJeton.has(row.id) }));
  }

  async register(input: Parameters<DeviceRepository['register']>[0]): Promise<{ id: string }> {
    return this.prisma.device.upsert({
      where: {
        userId_fingerprintHash: { userId: input.userId, fingerprintHash: input.fingerprintHash },
      },
      create: {
        userId: input.userId,
        fingerprintHash: input.fingerprintHash,
        type: toDeviceType(input.type),
        model: input.model,
        osVersion: input.osVersion,
        appVersion: input.appVersion,
        pushToken: input.pushToken,
        lastSeenAt: input.now,
        createdAt: input.now,
      },
      update: {
        model: input.model,
        osVersion: input.osVersion,
        appVersion: input.appVersion,
        ...(input.pushToken === null ? {} : { pushToken: input.pushToken }),
        lastSeenAt: input.now,
      },
      select: { id: true },
    });
  }

  async remove(deviceId: string, userId: string): Promise<boolean> {
    const resultat = await this.prisma.device.deleteMany({ where: { id: deviceId, userId } });
    return resultat.count > 0;
  }

  async clearPushToken(pushToken: string): Promise<void> {
    await this.prisma.device.updateMany({ where: { pushToken }, data: { pushToken: null } });
  }

  async deliveryContext(userId: string): Promise<DeliveryContext> {
    const [jetons, utilisateur] = await Promise.all([
      this.prisma.device.count({ where: { userId, pushToken: { not: null } } }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, emailVerified: true, phoneE164: true },
      }),
    ]);

    return {
      hasPushToken: jetons > 0,
      hasVerifiedEmail: utilisateur?.email != null && utilisateur.emailVerified,
      hasPhone: utilisateur?.phoneE164 != null,
    };
  }

  async verifiedEmail(userId: string): Promise<string | null> {
    const utilisateur = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerified: true },
    });

    // Une adresse non vérifiée n'est pas une adresse : lui écrire reviendrait à
    // envoyer les informations d'un membre à quelqu'un qui a saisi son adresse
    // par erreur — ou volontairement.
    if (utilisateur?.email == null || !utilisateur.emailVerified) return null;
    return utilisateur.email;
  }

  async phoneE164(userId: string): Promise<string | null> {
    const utilisateur = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phoneE164: true },
    });
    return utilisateur?.phoneE164 ?? null;
  }
}
