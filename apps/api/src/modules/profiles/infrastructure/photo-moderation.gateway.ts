import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { PhotoModerationGateway } from '../../moderation/application/ports';

/**
 * Masquage d'une photo décidé par la modération.
 *
 * Port déclaré par le module `moderation`, implémenté ici : la table `Photo`
 * appartient au module `profiles` (docs/01-architecture.md §3).
 */
@Injectable()
export class PrismaPhotoModerationGateway implements PhotoModerationGateway {
  constructor(private readonly prisma: PrismaService) {}

  async hide(photoId: string, reason: string, moderatorId: string | null, at: Date): Promise<void> {
    // La photo est REJETÉE, pas supprimée : le fichier reste disponible pour
    // contester la décision, et la ligne garde le motif et son auteur.
    await this.prisma.photo.update({
      where: { id: photoId },
      data: {
        status: 'REJECTED',
        moderationReason: reason.slice(0, 300),
        moderatedBy: moderatorId,
        moderatedAt: at,
      },
    });
  }
}
