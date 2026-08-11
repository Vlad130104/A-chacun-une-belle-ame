import { Injectable } from '@nestjs/common';
import { Prisma, type $Enums } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { buildPage, decodeCursor } from '../../../common/pagination/cursor';
import type { MessagingContext } from '../domain/messaging-policy';
import type { ContentSignal } from '../domain/message-content';
import type {
  ConversationRepository,
  ConversationSummary,
  MessageRecord,
  MessageRepository,
  SendMessageCommand,
} from '../application/ports';

/** Violation de contrainte d'unicité — le code Prisma est stable et documenté. */
const UNIQUE_VIOLATION = 'P2002';

const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  senderId: true,
  type: true,
  body: true,
  deliveryStatus: true,
  readAt: true,
  deletedAt: true,
  hiddenByModeration: true,
  createdAt: true,
  attachments: {
    select: {
      id: true,
      storageKey: true,
      thumbnailStorageKey: true,
      status: true,
      width: true,
      height: true,
    },
  },
} as const;

type MessageRow = Prisma.MessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

function toRecord(row: MessageRow): MessageRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    type: row.type,
    body: row.body,
    deliveryStatus: row.deliveryStatus,
    readAt: row.readAt,
    deletedAt: row.deletedAt,
    hiddenByModeration: row.hiddenByModeration,
    attachments: row.attachments.map((attachment) => ({
      id: attachment.id,
      storageKey: attachment.storageKey,
      thumbnailStorageKey: attachment.thumbnailStorageKey,
      status: attachment.status,
      width: attachment.width,
      height: attachment.height,
    })),
    createdAt: row.createdAt,
  };
}

/**
 * Correspondance entre les signaux détectés dans un message et le catalogue de
 * signaux de modération. `evidence` ne contient JAMAIS le texte du message : la
 * colonne est documentée comme non nominative, un modérateur ouvre le message par
 * le cas, pas par le signal (docs/03-modele-de-donnees.md §6).
 */
const SIGNAL_MAPPING: Record<ContentSignal, { type: $Enums.SignalType; severity: number }> = {
  MONEY_REQUEST: { type: 'REPEATED_MONEY_REQUEST', severity: 4 },
  EXTERNAL_LINK: { type: 'SUSPICIOUS_LINK', severity: 2 },
  CONTACT_SHARING: { type: 'CONTACT_SHARING', severity: 1 },
};

@Injectable()
export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async loadMessagingContext(
    conversationId: string,
    callerId: string,
  ): Promise<MessagingContext | null> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        status: true,
        match: { select: { status: true } },
        members: {
          select: {
            userId: true,
            user: { select: { accountStatus: true, verificationStatus: true } },
          },
        },
      },
    });

    if (conversation === null) return null;

    const [a, b] = conversation.members.map((member) => member.userId);
    // Seconde requête assumée : les blocages vivent dans une autre table, et le
    // couple d'identifiants y est indexé dans les deux sens. Le blocage compte
    // quel que soit son sens — c'est le point de la règle.
    const blocages =
      a === undefined || b === undefined
        ? 0
        : await this.prisma.block.count({
            where: {
              OR: [
                { blockerId: a, blockedId: b },
                { blockerId: b, blockedId: a },
              ],
            },
          });

    return {
      callerId,
      conversationStatus: conversation.status,
      matchStatus: conversation.match.status,
      members: conversation.members.map((member) => ({
        userId: member.userId,
        accountStatus: member.user.accountStatus,
        verificationStatus: member.user.verificationStatus,
      })),
      blockedEitherWay: blocages > 0,
    };
  }

  async findSummary(conversationId: string, userId: string): Promise<ConversationSummary | null> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        matchId: true,
        status: true,
        lastMessageAt: true,
        lastMessagePreview: true,
        createdAt: true,
        members: {
          select: {
            userId: true,
            unreadCount: true,
            mutedUntil: true,
            archivedAt: true,
          },
        },
      },
    });

    if (conversation === null) return null;

    const moi = conversation.members.find((member) => member.userId === userId);
    const autre = conversation.members.find((member) => member.userId !== userId);
    if (moi === undefined || autre === undefined) return null;

    return {
      id: conversation.id,
      matchId: conversation.matchId,
      status: conversation.status,
      lastMessageAt: conversation.lastMessageAt,
      lastMessagePreview: conversation.lastMessagePreview,
      unreadCount: moi.unreadCount,
      mutedUntil: moi.mutedUntil,
      archivedAt: moi.archivedAt,
      otherUserId: autre.userId,
      createdAt: conversation.createdAt,
    };
  }

  async listForUser(input: {
    userId: string;
    limit: number;
    cursor?: string;
    includeArchived: boolean;
  }): Promise<{ items: ConversationSummary[]; nextCursor: string | null; hasMore: boolean }> {
    const curseur = input.cursor === undefined ? null : decodeCursor(input.cursor);

    const rows = await this.prisma.conversationMember.findMany({
      where: {
        userId: input.userId,
        leftAt: null,
        ...(input.includeArchived ? {} : { archivedAt: null }),
        ...(curseur === null
          ? {}
          : {
              conversation: {
                OR: [
                  { createdAt: { lt: new Date(curseur.createdAt) } },
                  { createdAt: new Date(curseur.createdAt), id: { lt: curseur.id } },
                ],
              },
            }),
      },
      // `lastMessageAt` peut être nul sur une conversation neuve : `createdAt` sert
      // de départage stable, et c'est lui que le curseur encode.
      orderBy: [{ conversation: { createdAt: 'desc' } }, { conversationId: 'desc' }],
      take: input.limit + 1,
      select: {
        unreadCount: true,
        mutedUntil: true,
        archivedAt: true,
        conversation: {
          select: {
            id: true,
            matchId: true,
            status: true,
            lastMessageAt: true,
            lastMessagePreview: true,
            createdAt: true,
            members: { select: { userId: true } },
          },
        },
      },
    });

    const summaries = rows.map((row) => ({
      id: row.conversation.id,
      matchId: row.conversation.matchId,
      status: row.conversation.status,
      lastMessageAt: row.conversation.lastMessageAt,
      lastMessagePreview: row.conversation.lastMessagePreview,
      unreadCount: row.unreadCount,
      mutedUntil: row.mutedUntil,
      archivedAt: row.archivedAt,
      otherUserId:
        row.conversation.members.find((member) => member.userId !== input.userId)?.userId ?? '',
      createdAt: row.conversation.createdAt,
    }));

    return buildPage(summaries, input.limit);
  }

  async getUnansweredStreak(conversationId: string, senderId: string): Promise<number> {
    // Dernier message de l'autre membre : tout ce qui suit forme la série.
    const derniereReponse = await this.prisma.message.findFirst({
      where: { conversationId, senderId: { not: senderId } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    return this.prisma.message.count({
      where: {
        conversationId,
        senderId,
        ...(derniereReponse === null ? {} : { createdAt: { gt: derniereReponse.createdAt } }),
      },
    });
  }

  async setMuted(conversationId: string, userId: string, mutedUntil: Date | null): Promise<void> {
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { mutedUntil },
    });
  }

  async setArchived(
    conversationId: string,
    userId: string,
    archivedAt: Date | null,
  ): Promise<void> {
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { archivedAt },
    });
  }
}

@Injectable()
export class PrismaMessageRepository implements MessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async send(
    command: SendMessageCommand,
  ): Promise<{ message: MessageRecord; alreadySent: boolean }> {
    try {
      const message = await this.prisma.$transaction(async (tx) => {
        const cree = await tx.message.create({
          data: {
            conversationId: command.conversationId,
            senderId: command.senderId,
            type: command.type,
            body: command.body,
            clientIdempotencyKey: command.clientIdempotencyKey,
            purgeAt: command.purgeAt,
            createdAt: command.now,
            ...(command.attachment === null
              ? {}
              : {
                  attachments: {
                    create: {
                      storageKey: command.attachment.storageKey,
                      thumbnailStorageKey: command.attachment.thumbnailStorageKey,
                      contentType: command.attachment.contentType,
                      sizeBytes: command.attachment.sizeBytes,
                      width: command.attachment.width,
                      height: command.attachment.height,
                      createdAt: command.now,
                    },
                  },
                }),
          },
          select: MESSAGE_SELECT,
        });

        // Dénormalisation : la liste des conversations se trie sans jointure lourde.
        await tx.conversation.update({
          where: { id: command.conversationId },
          data: { lastMessageAt: command.now, lastMessagePreview: command.preview },
        });

        await tx.conversationMember.updateMany({
          where: { conversationId: command.conversationId, userId: command.recipientId },
          data: { unreadCount: { increment: 1 } },
        });

        if (command.signals.length > 0) {
          await tx.moderationSignal.createMany({
            data: command.signals.map((signal) => ({
              userId: command.senderId,
              type: SIGNAL_MAPPING[signal].type,
              severity: SIGNAL_MAPPING[signal].severity,
              evidence: {
                source: 'MESSAGE',
                messageId: cree.id,
                conversationId: command.conversationId,
                signal,
              },
              createdAt: command.now,
            })),
          });
        }

        return cree;
      });

      return { message: toRecord(message), alreadySent: false };
    } catch (erreur) {
      // Le client a rejoué sa requête : on lui rend SON message, on n'en crée pas
      // un second (story D5-09). La contrainte unique est l'arbitre, pas une
      // lecture préalable qui laisserait une fenêtre de concurrence.
      if (
        erreur instanceof Prisma.PrismaClientKnownRequestError &&
        erreur.code === UNIQUE_VIOLATION
      ) {
        const existant = await this.prisma.message.findUnique({
          where: {
            senderId_clientIdempotencyKey: {
              senderId: command.senderId,
              clientIdempotencyKey: command.clientIdempotencyKey,
            },
          },
          select: MESSAGE_SELECT,
        });

        if (existant !== null) return { message: toRecord(existant), alreadySent: true };
      }

      throw erreur;
    }
  }

  async listMessages(input: {
    conversationId: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: MessageRecord[]; nextCursor: string | null; hasMore: boolean }> {
    const curseur = input.cursor === undefined ? null : decodeCursor(input.cursor);

    const rows = await this.prisma.message.findMany({
      where: {
        conversationId: input.conversationId,
        ...(curseur === null
          ? {}
          : {
              OR: [
                { createdAt: { lt: new Date(curseur.createdAt) } },
                { createdAt: new Date(curseur.createdAt), id: { lt: curseur.id } },
              ],
            }),
      },
      // Index composite (conversationId, createdAt desc, id) : aucun OFFSET.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      select: MESSAGE_SELECT,
    });

    const page = buildPage(rows, input.limit);
    return { items: page.items.map(toRecord), nextCursor: page.nextCursor, hasMore: page.hasMore };
  }

  async findById(messageId: string): Promise<MessageRecord | null> {
    const row = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: MESSAGE_SELECT,
    });

    return row === null ? null : toRecord(row);
  }

  async softDelete(messageId: string, byUserId: string, at: Date): Promise<void> {
    // Le corps est effacé, la ligne survit : la modération doit pouvoir constater
    // qu'un message a existé même après son retrait (docs/03-modele-de-donnees.md §5).
    await this.prisma.message.update({
      where: { id: messageId },
      data: { body: null, deletedAt: at, deletedByUserId: byUserId },
    });
  }

  async markRead(input: {
    conversationId: string;
    readerId: string;
    upToMessageId: string;
    at: Date;
  }): Promise<{ updatedMessageIds: string[] }> {
    return this.prisma.$transaction(async (tx) => {
      const borne = await tx.message.findFirst({
        where: { id: input.upToMessageId, conversationId: input.conversationId },
        select: { createdAt: true },
      });

      if (borne === null) return { updatedMessageIds: [] };

      const aMarquer = await tx.message.findMany({
        where: {
          conversationId: input.conversationId,
          senderId: { not: input.readerId },
          createdAt: { lte: borne.createdAt },
          deliveryStatus: { not: 'READ' },
        },
        select: { id: true },
      });

      if (aMarquer.length > 0) {
        await tx.message.updateMany({
          where: { id: { in: aMarquer.map((message) => message.id) } },
          data: { deliveryStatus: 'READ', readAt: input.at, deliveredAt: input.at },
        });
      }

      await tx.conversationMember.updateMany({
        where: { conversationId: input.conversationId, userId: input.readerId },
        data: { unreadCount: 0, lastReadAt: input.at, lastReadMessageId: input.upToMessageId },
      });

      return { updatedMessageIds: aMarquer.map((message) => message.id) };
    });
  }
}
