import { randomBytes } from 'node:crypto';
import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import type { ClockProvider } from '../../../providers/ports';
import type { AuditWriter } from '../../moderation/application/ports';
import { canGrantRoles, type AdminRole, type Permission } from '../domain/permissions';
import { enrollmentUri, verifyTotp } from '../domain/totp';
import type {
  AdminAuditReader,
  AdminQueryRepository,
  AdminUserDetail,
  DashboardMetrics,
  FeatureFlagRepository,
  RoleRepository,
  TwoFactorRepository,
} from './ports';

/** Tableau de bord — que des agrégats, jamais un membre nommé (story D9-02). */
export class GetDashboardUseCase {
  constructor(
    private readonly queries: AdminQueryRepository,
    private readonly clock: ClockProvider,
  ) {}

  async execute(): Promise<DashboardMetrics> {
    return this.queries.dashboard(this.clock.now());
  }
}

/**
 * Recherche et consultation d'un compte (story D9-03).
 *
 * **Toute consultation est auditée**, y compris la simple lecture. Ce n'est pas
 * excessif : un back-office donne accès aux données de 9 000 personnes, et la
 * seule façon de détecter une curiosité déplacée est d'en garder la trace.
 */
export class SearchUsersUseCase {
  constructor(
    private readonly queries: AdminQueryRepository,
    private readonly audit: AuditWriter,
    private readonly hasher: { hash(value: string): string },
    private readonly clock: ClockProvider,
  ) {}

  async execute(input: {
    actorUserId: string;
    actorRole: string;
    phone?: string;
    email?: string;
    userId?: string;
    limit: number;
    cursor?: string;
  }): Promise<unknown> {
    const now = this.clock.now();

    // Le numéro est haché avant la requête : la colonne indexée est une
    // empreinte salée, et le numéro en clair ne transite pas jusqu'au SQL.
    const resultats = await this.queries.searchUsers({
      ...(input.phone === undefined ? {} : { phoneHash: this.hasher.hash(input.phone) }),
      ...(input.email === undefined ? {} : { email: input.email }),
      ...(input.userId === undefined ? {} : { userId: input.userId }),
      limit: input.limit,
      cursor: input.cursor,
    });

    await this.audit.record({
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: 'admin.user.searched',
      targetType: null,
      targetId: null,
      // Le critère recherché n'est PAS journalisé en clair : consigner un
      // numéro dans le journal d'audit le rendrait lisible à quiconque a
      // `audit.read`, ce qui annulerait le hachage.
      context: {
        critere: input.phone !== undefined ? 'phone' : input.email !== undefined ? 'email' : 'id',
      },
      now,
    });

    return resultats;
  }
}

export class GetUserDetailUseCase {
  constructor(
    private readonly queries: AdminQueryRepository,
    private readonly audit: AuditWriter,
    private readonly clock: ClockProvider,
  ) {}

  async execute(input: {
    actorUserId: string;
    actorRole: string;
    userId: string;
  }): Promise<AdminUserDetail> {
    const detail = await this.queries.userDetail(input.userId);
    if (detail === null) throw BusinessError.notFound();

    await this.audit.record({
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: 'admin.user.viewed',
      targetType: 'User',
      targetId: input.userId,
      context: null,
      now: this.clock.now(),
    });

    return detail;
  }
}

/**
 * Journal d'audit — lecture seule (story D9-07).
 *
 * Consulter le journal est lui-même audité. Cela paraît circulaire ; ça ne
 * l'est pas : c'est ce qui permet de savoir qui est allé regarder qui.
 */
export class ReadAuditLogUseCase {
  constructor(
    private readonly reader: AdminAuditReader,
    private readonly audit: AuditWriter,
    private readonly clock: ClockProvider,
  ) {}

  async execute(input: {
    actorUserId: string;
    actorRole: string;
    actorFilter?: string;
    action?: string;
    targetId?: string;
    limit: number;
    cursor?: string;
  }): Promise<unknown> {
    const page = await this.reader.list({
      ...(input.actorFilter === undefined ? {} : { actorUserId: input.actorFilter }),
      ...(input.action === undefined ? {} : { action: input.action }),
      ...(input.targetId === undefined ? {} : { targetId: input.targetId }),
      limit: input.limit,
      cursor: input.cursor,
    });

    await this.audit.record({
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: 'admin.audit.read',
      targetType: null,
      targetId: input.targetId ?? null,
      context: { filtreActeur: input.actorFilter ?? null, filtreAction: input.action ?? null },
      now: this.clock.now(),
    });

    return page;
  }
}

/**
 * Attribution et retrait de rôles (story D9-08).
 *
 * Deux garde-fous que le cahier des charges n'exigeait pas explicitement mais
 * dont l'absence se paie cher :
 *
 *  - **on ne modifie pas ses propres rôles** : sinon un super-administrateur
 *    pourrait s'attribuer discrètement un pouvoir puis le retirer ;
 *  - **on ne retire pas le dernier super-administrateur** : la plateforme
 *    deviendrait ingérable, sans aucun moyen de se rattraper par l'API.
 */
export class ManageRolesUseCase {
  constructor(
    private readonly roles: RoleRepository,
    private readonly audit: AuditWriter,
    private readonly clock: ClockProvider,
  ) {}

  async grant(input: {
    actorUserId: string;
    actorRoles: AdminRole[];
    targetUserId: string;
    role: AdminRole;
  }): Promise<{ granted: true }> {
    this.assertCanManage(input.actorRoles, input.actorUserId, input.targetUserId);

    const now = this.clock.now();
    await this.roles.grant(input.targetUserId, input.role, input.actorUserId, now);
    await this.audit.record({
      actorUserId: input.actorUserId,
      actorRole: 'SUPER_ADMIN',
      action: 'admin.role.granted',
      targetType: 'User',
      targetId: input.targetUserId,
      context: { role: input.role },
      now,
    });

    return { granted: true };
  }

  async revoke(input: {
    actorUserId: string;
    actorRoles: AdminRole[];
    targetUserId: string;
    role: AdminRole;
  }): Promise<{ revoked: true }> {
    this.assertCanManage(input.actorRoles, input.actorUserId, input.targetUserId);

    if (input.role === 'SUPER_ADMIN') {
      const restants = await this.roles.countSuperAdmins();
      if (restants <= 1) {
        // Retirer le dernier rendrait la plateforme ingérable, sans recours par
        // l'API : il faudrait intervenir en base.
        throw BusinessError.conflict(ErrorCode.AUTH_FORBIDDEN, {
          reason: 'LAST_SUPER_ADMIN',
        });
      }
    }

    const now = this.clock.now();
    await this.roles.revoke(input.targetUserId, input.role, now);
    await this.audit.record({
      actorUserId: input.actorUserId,
      actorRole: 'SUPER_ADMIN',
      action: 'admin.role.revoked',
      targetType: 'User',
      targetId: input.targetUserId,
      context: { role: input.role },
      now,
    });

    return { revoked: true };
  }

  async list(limit: number): Promise<unknown> {
    return { items: await this.roles.listAdmins(limit) };
  }

  private assertCanManage(
    actorRoles: AdminRole[],
    actorUserId: string,
    targetUserId: string,
  ): void {
    if (!canGrantRoles(actorRoles)) throw BusinessError.forbidden(ErrorCode.AUTH_FORBIDDEN);
    if (actorUserId === targetUserId) {
      throw BusinessError.forbidden(ErrorCode.AUTH_FORBIDDEN, { reason: 'SELF_ROLE_CHANGE' });
    }
  }
}

export class ManageFeatureFlagsUseCase {
  constructor(
    private readonly flags: FeatureFlagRepository,
    private readonly audit: AuditWriter,
    private readonly clock: ClockProvider,
  ) {}

  async list(): Promise<unknown> {
    return { items: await this.flags.list() };
  }

  async update(input: {
    actorUserId: string;
    actorRole: string;
    key: string;
    enabled?: boolean;
    rolloutPercentage?: number;
    payload?: unknown;
  }): Promise<unknown> {
    const now = this.clock.now();
    const flag = await this.flags.update({
      key: input.key,
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      ...(input.rolloutPercentage === undefined
        ? {}
        : { rolloutPercentage: input.rolloutPercentage }),
      ...(input.payload === undefined ? {} : { payload: input.payload }),
      updatedByUserId: input.actorUserId,
      now,
    });

    if (flag === null) throw BusinessError.notFound();

    // Un feature flag change le comportement du produit pour tout le monde :
    // le changement est tracé avec son avant/après.
    await this.audit.record({
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: 'admin.flag.updated',
      targetType: 'FeatureFlag',
      targetId: input.key,
      context: { enabled: flag.enabled, rolloutPercentage: flag.rolloutPercentage },
      now,
    });

    return flag;
  }
}

/**
 * Double authentification du back-office (story D9-01).
 *
 * Le secret est produit côté serveur et rendu **une seule fois**, à
 * l'enrôlement. Ensuite, aucune route ne le restitue : un secret qu'on peut
 * relire est un secret qu'on peut exfiltrer, et la double authentification
 * n'aurait plus d'objet.
 */
export class AdminTwoFactorUseCase {
  constructor(
    private readonly twoFactor: TwoFactorRepository,
    private readonly audit: AuditWriter,
    private readonly clock: ClockProvider,
    private readonly issuer: string,
  ) {}

  async startEnrollment(
    userId: string,
    accountLabel: string,
  ): Promise<{ secret: string; uri: string }> {
    const existant = await this.twoFactor.getSecret(userId);
    if (existant?.enabled === true) {
      // Réenrôler un compte déjà protégé permettrait de remplacer le facteur
      // d'un administrateur dont on aurait volé la session.
      throw BusinessError.conflict(ErrorCode.AUTH_FORBIDDEN, { reason: 'ALREADY_ENABLED' });
    }

    // 160 bits, taille recommandée pour HMAC-SHA1 (RFC 4226 §4).
    const secret = base32(randomBytes(20));
    await this.twoFactor.setSecret(userId, secret, this.clock.now());

    return { secret, uri: enrollmentUri(secret, accountLabel, this.issuer) };
  }

  async confirmEnrollment(input: {
    userId: string;
    actorRole: string;
    code: string;
  }): Promise<{ enabled: true }> {
    const enregistre = await this.twoFactor.getSecret(input.userId);
    if (enregistre?.secret == null) throw BusinessError.badRequest(ErrorCode.VALIDATION_FAILED);

    const now = this.clock.now();
    // On exige un code valide AVANT d'activer : sinon un administrateur
    // s'enfermerait dehors avec un secret mal recopié.
    if (!verifyTotp(enregistre.secret, input.code, now)) {
      throw BusinessError.unauthorized(ErrorCode.AUTH_INVALID_CREDENTIALS);
    }

    await this.twoFactor.enable(input.userId, now);
    await this.audit.record({
      actorUserId: input.userId,
      actorRole: input.actorRole,
      action: 'admin.2fa.enabled',
      targetType: 'User',
      targetId: input.userId,
      context: null,
      now,
    });

    return { enabled: true };
  }

  /** Vérifie un code au moment de l'ouverture d'une session back-office. */
  async verify(userId: string, code: string): Promise<boolean> {
    const enregistre = await this.twoFactor.getSecret(userId);
    if (enregistre?.secret == null || !enregistre.enabled) return false;
    return verifyTotp(enregistre.secret, code, this.clock.now());
  }
}

/** Encodage base32 sans remplissage — format attendu par les applications TOTP. */
function base32(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let valeur = 0;
  let resultat = '';

  for (const octet of buffer) {
    valeur = (valeur << 8) | octet;
    bits += 8;
    while (bits >= 5) {
      resultat += alphabet[(valeur >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) resultat += alphabet[(valeur << (5 - bits)) & 31];
  return resultat;
}

/** Permissions requises par chaque route du back-office, pour documentation. */
export const BACKOFFICE_PERMISSIONS: Record<string, Permission> = {
  dashboard: 'analytics.read',
  userSearch: 'users.read',
  userDetail: 'users.read',
  auditLog: 'audit.read',
  roles: 'system.roles',
  flags: 'system.flags',
};
