import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { MessageModerationGateway } from '../../moderation/application/ports';

/**
 * Masquage d'un message décidé par la modération.
 *
 * Le corps n'est PAS effacé, contrairement à une suppression par son auteur :
 * un message retiré par la modération est une pièce du dossier, il doit rester
 * lisible pour instruire un recours. `hiddenByModeration` suffit à le retirer de
 * la vue des membres — la sérialisation renvoie déjà un corps nul dans ce cas.
 */
@Injectable()
export class PrismaMessageModerationGateway implements MessageModerationGateway {
  constructor(private readonly prisma: PrismaService) {}

  async hide(messageId: string, at: Date): Promise<void> {
    await this.prisma.message.update({
      where: { id: messageId },
      data: { hiddenByModeration: true, deletedAt: at },
    });
  }
}
