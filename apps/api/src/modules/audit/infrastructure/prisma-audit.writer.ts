import { Injectable } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { AuditWriter } from '../../moderation/application/ports';

/**
 * Journal d'audit administratif, en ajout seul.
 *
 * **L'écriture n'est plus tolérante à l'échec** (story D9-07). Elle l'était en
 * D6 : une erreur d'audit était journalisée sans annuler l'action, au motif
 * qu'une sanction légitime ne devait pas échouer faute de trace. Ce
 * raisonnement était faux, et le cahier des charges tranche dans l'autre sens —
 * une action sensible sans trace est précisément ce qu'un abus produirait. Si
 * l'audit ne peut pas être écrit, l'action n'a pas lieu.
 *
 * Deux verrous garantissent l'immuabilité, posés par la migration
 * `20260920000000_audit_append_only` : un déclencheur PostgreSQL qui refuse
 * `UPDATE` et `DELETE`, et le retrait de ces droits au rôle applicatif. Aucune
 * méthode de modification n'existe ici, et aucune route ne l'expose.
 */
@Injectable()
export class PrismaAuditWriter implements AuditWriter {
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
    await this.write(this.prisma, input);
  }

  /**
   * Écriture dans une transaction fournie par l'appelant.
   *
   * C'est la forme à privilégier : l'action et sa trace réussissent ou échouent
   * ensemble. Un appelant qui utilise `record()` hors transaction accepte que
   * l'action soit déjà validée si l'audit échoue — ce qui reste acceptable pour
   * une simple consultation, jamais pour une décision.
   */
  async recordIn(
    tx: Prisma.TransactionClient,
    input: Parameters<AuditWriter['record']>[0],
  ): Promise<void> {
    await this.write(tx, input);
  }

  private async write(
    client: Pick<PrismaService, 'adminAuditLog'> | Prisma.TransactionClient,
    input: Parameters<AuditWriter['record']>[0],
  ): Promise<void> {
    await client.adminAuditLog.create({
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
  }
}

/**
 * Rôle inconnu → `SUPPORT`, le rôle le moins puissant.
 *
 * Une valeur inattendue ne doit ni faire échouer l'audit — on perdrait la trace
 * pour un détail de forme — ni surestimer les droits de l'auteur dans le
 * journal. On retient donc le plancher, jamais le plafond.
 */
function toAdminRole(role: string): $Enums.AdminRole {
  return role in $Enums.AdminRole ? (role as $Enums.AdminRole) : $Enums.AdminRole.SUPPORT;
}
