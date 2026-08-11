import { Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Auth } from '../../../common/auth/auth.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../../common/auth/auth.guard';
import { ZodBody } from '../../../common/validation/zod.pipe';
import { ALL_ROLES, type AdminRole } from '../domain/permissions';
import {
  AdminTwoFactorUseCase,
  GetDashboardUseCase,
  GetUserDetailUseCase,
  ManageFeatureFlagsUseCase,
  ManageRolesUseCase,
  ReadAuditLogUseCase,
  SearchUsersUseCase,
} from '../application/backoffice.use-cases';

const roleSchema = z.object({ role: z.enum(ALL_ROLES as [AdminRole, ...AdminRole[]]) }).strict();

const flagSchema = z
  .object({
    enabled: z.boolean().optional(),
    rolloutPercentage: z.number().int().min(0).max(100).optional(),
    payload: z.unknown().optional(),
  })
  .strict();

const enrollSchema = z.object({ accountLabel: z.string().min(3).max(120) }).strict();
const confirmSchema = z.object({ code: z.string().length(6) }).strict();

const limite = (valeur: string | undefined, defaut: number, max: number): number =>
  Math.min(Number(valeur ?? defaut) || defaut, max);

/**
 * Rôle retenu pour l'audit.
 *
 * On prend le rôle le PLUS FAIBLE que l'appelant détient réellement, jamais un
 * rôle qu'il n'a pas : le journal ne doit pas surestimer le pouvoir de l'auteur
 * d'une action.
 */
function primaryRole(user: AuthenticatedUser): string {
  const detenus = ALL_ROLES.filter((role) => user.roles.includes(role));
  return detenus[detenus.length - 1] ?? 'SUPPORT';
}

function adminRoles(user: AuthenticatedUser): AdminRole[] {
  return ALL_ROLES.filter((role) => user.roles.includes(role));
}

/**
 * Back-office (tranche D9).
 *
 * Chaque route déclare sa permission ; le garde d'authentification la vérifie
 * contre les rôles réels de l'appelant, relus en base à chaque requête.
 *
 * **Toute lecture nominative est auditée** — recherche, consultation d'un
 * compte, lecture du journal. Un back-office donne accès aux données de
 * milliers de personnes, et la seule façon de détecter une curiosité déplacée
 * est d'en garder la trace.
 */
@ApiTags('admin')
@Controller('admin')
export class BackofficeController {
  constructor(
    private readonly dashboard: GetDashboardUseCase,
    private readonly search: SearchUsersUseCase,
    private readonly userDetail: GetUserDetailUseCase,
    private readonly auditLog: ReadAuditLogUseCase,
    private readonly rolesUseCase: ManageRolesUseCase,
    private readonly flags: ManageFeatureFlagsUseCase,
  ) {}

  @Auth({ permissions: ['analytics.read'] })
  @Get('dashboard')
  @ApiOperation({ summary: 'Les 10 indicateurs clés — agrégats uniquement, aucun membre nommé' })
  async getDashboard(): Promise<unknown> {
    return this.dashboard.execute();
  }

  @Auth({ permissions: ['users.read'], audit: 'admin.user.searched' })
  @Get('users')
  @ApiOperation({ summary: 'Rechercher un compte — le numéro est haché avant la requête' })
  async searchUsers(
    @CurrentUser() user: AuthenticatedUser,
    @Query('phone') phone?: string,
    @Query('email') email?: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<unknown> {
    return this.search.execute({
      actorUserId: user.id,
      actorRole: primaryRole(user),
      phone,
      email,
      userId,
      limit: limite(limit, 20, 50),
      cursor,
    });
  }

  @Auth({ permissions: ['users.read'], audit: 'admin.user.viewed' })
  @Get('users/:userId')
  @ApiOperation({ summary: 'Dossier complet d’un compte — sanctions, signalements, abonnement' })
  async getUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ): Promise<unknown> {
    return this.userDetail.execute({
      actorUserId: user.id,
      actorRole: primaryRole(user),
      userId,
    });
  }

  /**
   * Le journal est en LECTURE SEULE.
   *
   * Aucune route d'écriture, de modification ou de suppression n'existe ici, et
   * un test d'inventaire le vérifie. Deux verrous PostgreSQL refuseraient de
   * toute façon un `UPDATE` ou un `DELETE` (migration `audit_append_only`).
   */
  @Auth({ permissions: ['audit.read'], audit: 'admin.audit.read' })
  @Get('audit-logs')
  @ApiOperation({ summary: 'Journal d’audit — lecture seule, inaltérable' })
  async getAuditLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Query('actor') actor?: string,
    @Query('action') action?: string,
    @Query('targetId') targetId?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<unknown> {
    return this.auditLog.execute({
      actorUserId: user.id,
      actorRole: primaryRole(user),
      actorFilter: actor,
      action,
      targetId,
      limit: limite(limit, 50, 100),
      cursor,
    });
  }

  @Auth({ permissions: ['system.roles'] })
  @Get('roles')
  @ApiOperation({ summary: 'Comptes disposant d’un rôle back-office' })
  async listRoles(@Query('limit') limit?: string): Promise<unknown> {
    return this.rolesUseCase.list(limite(limit, 100, 200));
  }

  @Auth({ permissions: ['system.roles'], audit: 'admin.role.granted' })
  @Post('users/:userId/roles')
  @ApiOperation({ summary: 'Attribuer un rôle — jamais à soi-même' })
  async grantRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @ZodBody(roleSchema) body: unknown,
  ): Promise<unknown> {
    const { role } = body as { role: AdminRole };
    return this.rolesUseCase.grant({
      actorUserId: user.id,
      actorRoles: adminRoles(user),
      targetUserId: userId,
      role,
    });
  }

  @Auth({ permissions: ['system.roles'], audit: 'admin.role.revoked' })
  @Post('users/:userId/roles/revoke')
  @ApiOperation({ summary: 'Retirer un rôle — jamais le dernier super-administrateur' })
  async revokeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @ZodBody(roleSchema) body: unknown,
  ): Promise<unknown> {
    const { role } = body as { role: AdminRole };
    return this.rolesUseCase.revoke({
      actorUserId: user.id,
      actorRoles: adminRoles(user),
      targetUserId: userId,
      role,
    });
  }

  @Auth({ permissions: ['system.flags'] })
  @Get('feature-flags')
  @ApiOperation({ summary: 'Feature flags et leur état' })
  async listFlags(): Promise<unknown> {
    return this.flags.list();
  }

  @Auth({ permissions: ['system.flags'], audit: 'admin.flag.updated' })
  @Patch('feature-flags/:key')
  @ApiOperation({ summary: 'Modifier un feature flag — changement tracé' })
  async updateFlag(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @ZodBody(flagSchema) body: unknown,
  ): Promise<unknown> {
    const input = body as z.infer<typeof flagSchema>;
    return this.flags.update({
      actorUserId: user.id,
      actorRole: primaryRole(user),
      key,
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      ...(input.rolloutPercentage === undefined
        ? {}
        : { rolloutPercentage: input.rolloutPercentage }),
      ...(input.payload === undefined ? {} : { payload: input.payload }),
    });
  }
}

/**
 * Double authentification du back-office (story D9-01).
 *
 * Le niveau requis est `auth` et non une permission : un compte qui vient de
 * recevoir un rôle doit pouvoir s'enrôler avant d'exercer quoi que ce soit.
 * C'est le contrôle de session, en amont, qui exigera un facteur valide.
 */
@ApiTags('admin-2fa')
@Controller('admin/2fa')
export class AdminTwoFactorController {
  constructor(private readonly twoFactor: AdminTwoFactorUseCase) {}

  /**
   * Le secret n'est rendu QU'ICI, une seule fois.
   *
   * Aucune route ne le restitue ensuite : un secret qu'on peut relire est un
   * secret qu'on peut exfiltrer, et la double authentification n'aurait plus
   * d'objet.
   */
  @Auth({ rateLimit: 'admin.2fa.enroll' })
  @Post('enroll')
  @ApiOperation({ summary: 'Démarrer l’enrôlement — secret rendu une seule fois' })
  async enroll(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(enrollSchema) body: unknown,
  ): Promise<unknown> {
    const { accountLabel } = body as { accountLabel: string };
    return this.twoFactor.startEnrollment(user.id, accountLabel);
  }

  @Auth({ rateLimit: 'admin.2fa.confirm' })
  @Post('confirm')
  @ApiOperation({ summary: 'Confirmer par un code valide — active la double authentification' })
  async confirm(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(confirmSchema) body: unknown,
  ): Promise<unknown> {
    const { code } = body as { code: string };
    return this.twoFactor.confirmEnrollment({
      userId: user.id,
      actorRole: primaryRole(user),
      code,
    });
  }
}
