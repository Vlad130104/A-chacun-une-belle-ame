import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { ConversationGateway } from '../../discovery/application/ports';

/**
 * Propriétaire des tables `Conversation` et `ConversationMember`.
 *
 * Le module `discovery` déclare le port, celui-ci l'implémente : le matching n'écrit
 * jamais directement dans les tables d'un autre module (docs/01-architecture.md §3).
 *
 * La tranche D5 étendra ce module avec les messages ; la frontière est déjà posée.
 */
@Injectable()
export class PrismaConversationGateway implements ConversationGateway {
  constructor(private readonly prisma: PrismaService) {}

  async createForMatch(matchId: string, memberIds: [string, string], at: Date): Promise<string> {
    const conversation = await this.prisma.$transaction(async (tx) => {
      const cree = await tx.conversation.create({
        data: { matchId, status: 'OPEN', createdAt: at },
      });

      await tx.conversationMember.createMany({
        data: memberIds.map((userId) => ({ conversationId: cree.id, userId })),
        skipDuplicates: true,
      });

      return cree;
    });

    return conversation.id;
  }

  async lockForUnmatch(matchId: string, at: Date): Promise<void> {
    // Verrouillage, jamais suppression : la conversation reste consultable par la
    // modération si un signalement la vise (docs/03-modele-de-donnees.md §5).
    await this.prisma.conversation.updateMany({
      where: { matchId, status: 'OPEN' },
      data: {
        status: 'LOCKED_BY_UNMATCH',
        lockedAt: at,
        lockedReason: 'Match annulé par un membre',
      },
    });
  }

  async lockForBlock(userAId: string, userBId: string, at: Date): Promise<void> {
    const [a, b] = [userAId, userBId].sort();

    await this.prisma.conversation.updateMany({
      where: {
        status: 'OPEN',
        match: { userAId: a, userBId: b },
      },
      data: {
        status: 'LOCKED_BY_BLOCK',
        lockedAt: at,
        lockedReason: 'Blocage entre les membres',
      },
    });
  }
}
