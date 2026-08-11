import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { buildPage, decodeCursor } from '../../../common/pagination/cursor';
import { maskPhone } from '../../../providers/console-sms.provider';
import type { AdminRole } from '../domain/permissions';
import type {
  AdminAuditReader,
  AdminQueryRepository,
  AdminUserDetail,
  AdminUserSummary,
  AuditEntry,
  DashboardMetrics,
  FeatureFlagRecord,
  FeatureFlagRepository,
  RoleRepository,
  TwoFactorRepository,
} from '../application/ports';

const JOUR_MS = 86_400_000;

@Injectable()
export class PrismaAdminQueryRepository implements AdminQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Les 10 indicateurs, en requêtes parallèles.
   *
   * Chacune est un comptage sur colonne indexée. Aucune ne lit de contenu, aucune
   * ne nomme un membre : le tableau de bord se consulte souvent sur un écran
   * partagé.
   */
  async dashboard(now: Date): Promise<DashboardMetrics> {
    const ilYA7j = new Date(now.getTime() - 7 * JOUR_MS);
    const ilYA30j = new Date(now.getTime() - 30 * JOUR_MS);

    const [
      membresActifs,
      inscriptions7j,
      verificationsEnAttente,
      totalVerifies,
      totalComptes,
      matchs7j,
      conversationsActives7j,
      casOuverts,
      casEnRetard,
      abonnementsActifs,
      paiements30j,
    ] = await Promise.all([
      this.prisma.user.count({ where: { accountStatus: 'ACTIVE' } }),
      this.prisma.user.count({ where: { createdAt: { gte: ilYA7j } } }),
      this.prisma.verificationRequest.count({
        where: { status: { in: ['PENDING', 'IN_REVIEW'] } },
      }),
      this.prisma.user.count({ where: { verificationStatus: 'VERIFIED' } }),
      this.prisma.user.count(),
      this.prisma.match.count({ where: { matchedAt: { gte: ilYA7j } } }),
      this.prisma.conversation.count({
        where: { status: 'OPEN', lastMessageAt: { gte: ilYA7j } },
      }),
      this.prisma.moderationCase.count({
        where: { status: { in: ['OPEN', 'ASSIGNED', 'AWAITING_USER', 'ESCALATED'] } },
      }),
      this.prisma.moderationCase.count({
        where: {
          status: { in: ['OPEN', 'ASSIGNED', 'AWAITING_USER', 'ESCALATED'] },
          slaDueAt: { lt: now },
        },
      }),
      this.prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      this.prisma.payment.groupBy({
        by: ['currency'],
        where: { status: 'SUCCEEDED', paidAt: { gte: ilYA30j } },
        _sum: { amountMinor: true },
      }),
    ]);

    // Une seule devise au MVP ; si plusieurs coexistaient, additionner serait
    // une faute (ADR-009). On retient donc la plus représentée et on le sait.
    const principale = paiements30j[0];

    return {
      membresActifs,
      inscriptions7j,
      verificationsEnAttente,
      tauxVerification: totalComptes === 0 ? 0 : Math.round((totalVerifies / totalComptes) * 100),
      matchs7j,
      conversationsActives7j,
      casModerationOuverts: casOuverts,
      casModerationEnRetard: casEnRetard,
      abonnementsActifs,
      revenuMinor30j: {
        amountMinor: principale?._sum.amountMinor ?? 0,
        currency: principale?.currency ?? 'XAF',
      },
    };
  }

  async searchUsers(input: {
    phoneHash?: string;
    email?: string;
    userId?: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: AdminUserSummary[]; nextCursor: string | null; hasMore: boolean }> {
    const curseur = input.cursor === undefined ? null : decodeCursor(input.cursor);

    // Aucun critère : on ne renvoie rien plutôt que la base entière. Parcourir
    // les comptes sans savoir qui on cherche n'est pas un usage légitime.
    if (input.phoneHash === undefined && input.email === undefined && input.userId === undefined) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    const rows = await this.prisma.user.findMany({
      where: {
        ...(input.phoneHash === undefined ? {} : { phoneHash: input.phoneHash }),
        ...(input.email === undefined ? {} : { email: input.email }),
        ...(input.userId === undefined ? {} : { id: input.userId }),
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
      select: {
        id: true,
        accountStatus: true,
        verificationStatus: true,
        createdAt: true,
        lastActiveAt: true,
        phoneE164: true,
        profile: { select: { firstName: true, city: { select: { name: true } } } },
      },
    });

    const page = buildPage(rows, input.limit);

    return {
      items: page.items.map((row) => ({
        id: row.id,
        accountStatus: row.accountStatus,
        verificationStatus: row.verificationStatus,
        createdAt: row.createdAt,
        lastActiveAt: row.lastActiveAt,
        firstName: row.profile?.firstName ?? null,
        cityName: row.profile?.city.name ?? null,
        // Même au back-office, le numéro n'est jamais rendu en entier : un
        // écran partagé, une capture, un export, et il circule.
        phoneMasked: maskPhone(row.phoneE164),
      })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  async userDetail(userId: string): Promise<AdminUserDetail | null> {
    const utilisateur = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        accountStatus: true,
        verificationStatus: true,
        createdAt: true,
        lastActiveAt: true,
        phoneE164: true,
        profile: { select: { firstName: true, city: { select: { name: true } } } },
        roles: { where: { revokedAt: null }, select: { role: true } },
        _count: { select: { photos: true } },
      },
    });

    if (utilisateur === null) return null;

    const [sanctions, signalementsRecus, signalementsEmis, abonnement, sessions] =
      await Promise.all([
        this.prisma.moderationAction.findMany({
          where: { case: { subjectId: userId } },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { type: true, reasonCode: true, createdAt: true, revertedAt: true },
        }),
        this.prisma.report.count({ where: { reportedUserId: userId } }),
        this.prisma.report.count({ where: { reporterId: userId } }),
        this.prisma.subscription.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          select: {
            status: true,
            currentPeriodEnd: true,
            plan: { select: { code: true } },
          },
        }),
        this.prisma.userSession.count({ where: { userId, revokedAt: null } }),
      ]);

    return {
      id: utilisateur.id,
      accountStatus: utilisateur.accountStatus,
      verificationStatus: utilisateur.verificationStatus,
      createdAt: utilisateur.createdAt,
      lastActiveAt: utilisateur.lastActiveAt,
      firstName: utilisateur.profile?.firstName ?? null,
      cityName: utilisateur.profile?.city.name ?? null,
      phoneMasked: maskPhone(utilisateur.phoneE164),
      roles: utilisateur.roles.map((ligne) => ligne.role),
      sanctions,
      reportsAgainst: signalementsRecus,
      reportsFiled: signalementsEmis,
      subscription:
        abonnement === null
          ? null
          : {
              status: abonnement.status,
              planCode: abonnement.plan.code,
              currentPeriodEnd: abonnement.currentPeriodEnd,
            },
      sessionsActives: sessions,
      photosCount: utilisateur._count.photos,
    };
  }
}

@Injectable()
export class PrismaRoleRepository implements RoleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listRoles(userId: string): Promise<AdminRole[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId, revokedAt: null },
      select: { role: true },
    });
    return rows.map((row) => row.role);
  }

  async grant(userId: string, role: AdminRole, grantedBy: string, at: Date): Promise<void> {
    await this.prisma.userRole.upsert({
      where: { userId_role: { userId, role } },
      create: { userId, role, grantedBy, grantedAt: at },
      // Réattribution après retrait : on rouvre la ligne plutôt que d'en créer
      // une seconde, pour que l'historique reste lisible.
      update: { revokedAt: null, grantedBy, grantedAt: at },
    });
  }

  async revoke(userId: string, role: AdminRole, at: Date): Promise<void> {
    await this.prisma.userRole.updateMany({
      where: { userId, role, revokedAt: null },
      data: { revokedAt: at },
    });
  }

  async listAdmins(limit: number): Promise<{ userId: string; roles: AdminRole[] }[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { revokedAt: null },
      orderBy: { grantedAt: 'desc' },
      take: limit,
      select: { userId: true, role: true },
    });

    const parUtilisateur = new Map<string, AdminRole[]>();
    for (const row of rows) {
      parUtilisateur.set(row.userId, [...(parUtilisateur.get(row.userId) ?? []), row.role]);
    }

    return [...parUtilisateur].map(([userId, roles]) => ({ userId, roles }));
  }

  countSuperAdmins(): Promise<number> {
    return this.prisma.userRole.count({ where: { role: 'SUPER_ADMIN', revokedAt: null } });
  }
}

@Injectable()
export class PrismaFeatureFlagRepository implements FeatureFlagRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<FeatureFlagRecord[]> {
    const rows = await this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
    return rows.map((row) => ({
      key: row.key,
      description: row.description,
      enabled: row.enabled,
      rolloutPercentage: row.rolloutPercentage,
      payload: row.payload,
      updatedAt: row.updatedAt,
    }));
  }

  async update(input: {
    key: string;
    enabled?: boolean;
    rolloutPercentage?: number;
    payload?: unknown;
    updatedByUserId: string;
    now: Date;
  }): Promise<FeatureFlagRecord | null> {
    const existant = await this.prisma.featureFlag.findUnique({ where: { key: input.key } });
    if (existant === null) return null;

    const row = await this.prisma.featureFlag.update({
      where: { key: input.key },
      data: {
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        ...(input.rolloutPercentage === undefined
          ? {}
          : { rolloutPercentage: input.rolloutPercentage }),
        ...(input.payload === undefined ? {} : { payload: input.payload as Prisma.InputJsonValue }),
        updatedByUserId: input.updatedByUserId,
        updatedAt: input.now,
      },
    });

    return {
      key: row.key,
      description: row.description,
      enabled: row.enabled,
      rolloutPercentage: row.rolloutPercentage,
      payload: row.payload,
      updatedAt: row.updatedAt,
    };
  }
}

/**
 * Lecture du journal d'audit.
 *
 * Aucune méthode d'écriture, de modification ou de suppression n'existe sur
 * cette classe — pas par oubli, par construction. Les deux verrous PostgreSQL
 * posés par la migration `20260920000000_audit_append_only` refuseraient de
 * toute façon un `UPDATE` ou un `DELETE`.
 */
@Injectable()
export class PrismaAdminAuditReader implements AdminAuditReader {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: {
    actorUserId?: string;
    action?: string;
    targetId?: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: AuditEntry[]; nextCursor: string | null; hasMore: boolean }> {
    const curseur = input.cursor === undefined ? null : decodeCursor(input.cursor);

    const rows = await this.prisma.adminAuditLog.findMany({
      where: {
        ...(input.actorUserId === undefined ? {} : { actorUserId: input.actorUserId }),
        ...(input.action === undefined ? {} : { action: { startsWith: input.action } }),
        ...(input.targetId === undefined ? {} : { targetId: input.targetId }),
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
      select: {
        id: true,
        actorUserId: true,
        actorRole: true,
        action: true,
        targetType: true,
        targetId: true,
        context: true,
        createdAt: true,
      },
    });

    const page = buildPage(rows, input.limit);
    return { items: page.items, nextCursor: page.nextCursor, hasMore: page.hasMore };
  }
}

@Injectable()
export class PrismaTwoFactorRepository implements TwoFactorRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getSecret(userId: string): Promise<{ secret: string | null; enabled: boolean } | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });

    return row === null ? null : { secret: row.twoFactorSecret, enabled: row.twoFactorEnabled };
  }

  async setSecret(userId: string, secret: string, now: Date): Promise<void> {
    // Le secret est écrit mais jamais relu par une route : seule la vérification
    // interne y accède.
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret, twoFactorEnabled: false, updatedAt: now },
    });
  }

  async enable(userId: string, now: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, updatedAt: now },
    });
  }

  async disable(userId: string, now: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null, updatedAt: now },
    });
  }
}
