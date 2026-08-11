import { Injectable, Logger } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { AuditWriter } from '../../moderation/application/ports';

/**
 * Journal d'audit administratif, en ajout seul.
 *
 * Aucune méthode de mise à jour ni de suppression n'existe sur ce service, et
 * aucune route d'écriture n'est exposée : la seule façon d'entrer une ligne est
 * une opération sensible réellement effectuée. Le verrou définitif est un
 * déclencheur PostgreSQL interdisant UPDATE et DELETE — TODO(D9-07): l'ajouter —
 * tant qu'il n'existe pas, la garantie est applicative, pas structurelle, et
 * c'est dit tel quel dans docs/MOCKS.md.
 */
@Injectable()
export class PrismaAuditWriter implements AuditWriter {
  private readonly logger = new Logger(PrismaAuditWriter.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    actorUserId: string;
    actorRole: string;
    action: string;
    targetType: string | null;
    targetId: string | null;
    context: Record<string, unknown> | null;
    now: Date;
  }): Promise<void> {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          actorUserId: input.actorUserId,
          actorRole: toAdminRole(input.actorRole),
          action: input.action.slice(0, 80),
          targetType: input.targetType?.slice(0, 60) ?? null,
          targetId: input.targetId,
          context: (input.context ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          createdAt: input.now,
        },
      });
    } catch (erreur) {
      // Un audit qui échoue ne doit pas annuler la décision de modération déjà
      // prise : la sanction est légitime, c'est sa trace qui manque. On journalise
      // bruyamment pour que la supervision le voie, plutôt que de rejouer en
      // silence une opération sensible.
      this.logger.error({ err: erreur, action: input.action }, 'Écriture d’audit impossible');
    }
  }
}

function toAdminRole(role: string): $Enums.AdminRole {
  return role in $Enums.AdminRole ? (role as $Enums.AdminRole) : $Enums.AdminRole.SUPPORT;
}
