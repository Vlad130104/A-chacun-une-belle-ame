import { Injectable } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { AccountSanctionGateway } from '../../moderation/application/ports';

/**
 * Le port parle en `string` pour ne pas imposer Prisma au domaine de la
 * modération. La conversion est validée ici : un statut inconnu échoue
 * bruyamment plutôt que d'être écrit en base par un `as`.
 */
function toAccountStatus(status: string): $Enums.AccountStatus {
  if (!(status in $Enums.AccountStatus)) {
    throw new Error(`Statut de compte inconnu : ${status}`);
  }
  return status as $Enums.AccountStatus;
}

/**
 * Application d'une sanction sur un compte.
 *
 * Le port est déclaré par le module `moderation`, l'implémentation vit ici parce
 * que la table `User` appartient au module `auth` : la modération décide, elle
 * n'écrit pas elle-même dans les tables d'un autre module
 * (docs/01-architecture.md §3).
 */
@Injectable()
export class PrismaAccountSanctionGateway implements AccountSanctionGateway {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `until` n'est volontairement pas exploité ici : l'échéance vit sur l'action
   * de modération, qui est l'historique de référence. Le rétablissement
   * automatique à échéance est une tâche planifiée de la tranche D8 ; tant
   * qu'elle n'existe pas, la levée est **manuelle**, et c'est écrit tel quel
   * dans docs/MOCKS.md plutôt que suggéré comme acquis.
   */
  async applyStatus(userId: string, status: string, _until: Date | null, at: Date): Promise<void> {
    const statut = toAccountStatus(status);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { accountStatus: statut, updatedAt: at },
      });

      // Une sanction coupe les sessions en cours. Sans cela, un compte suspendu
      // continuerait de naviguer jusqu'à l'expiration de son jeton d'accès — le
      // garde relit bien le statut en base, mais autant fermer la porte tout de
      // suite plutôt que dans les quinze minutes.
      if (status !== 'ACTIVE') {
        await tx.userSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: at, revokedReason: 'MODERATION' },
        });
      }
    });
  }

  async requireReverification(userId: string, at: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { verificationStatus: 'PENDING', updatedAt: at },
    });
  }

  /**
   * ADR-013 — empêcher la recréation d'un compte banni sans conserver de données.
   *
   * Seules des empreintes sont écrites : le hash du numéro, déjà calculé à
   * l'inscription, et celui du numéro de pièce si une vérification a abouti.
   * Aucun profil, aucune photo, aucune donnée en clair.
   */
  async blockIdentityOnBan(userId: string, at: Date): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        phoneHash: true,
        devices: { select: { fingerprintHash: true }, take: 1, orderBy: { lastSeenAt: 'desc' } },
      },
    });

    if (user === null) return;

    const document = await this.prisma.verificationRequest.findFirst({
      where: { userId, status: 'VERIFIED' },
      orderBy: { submittedAt: 'desc' },
      select: { documentNumberHash: true },
    });

    await this.prisma.blockedIdentity.upsert({
      where: { phoneHash: user.phoneHash },
      create: {
        phoneHash: user.phoneHash,
        documentNumberHash: document?.documentNumberHash ?? null,
        deviceFingerprint: user.devices[0]?.fingerprintHash ?? null,
        reason: 'BANNED',
        notes: 'Bannissement prononcé par la modération',
        createdAt: at,
      },
      update: {
        documentNumberHash: document?.documentNumberHash ?? null,
        reason: 'BANNED',
      },
    });
  }
}
