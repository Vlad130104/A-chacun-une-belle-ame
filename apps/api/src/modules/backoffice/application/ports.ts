import type { AdminRole } from '../domain/permissions';

export const ADMIN_QUERY_REPOSITORY = Symbol('AdminQueryRepository');
export const ROLE_REPOSITORY = Symbol('RoleRepository');
export const FEATURE_FLAG_REPOSITORY = Symbol('FeatureFlagRepository');
export const ADMIN_AUDIT_READER = Symbol('AdminAuditReader');
export const TWO_FACTOR_REPOSITORY = Symbol('TwoFactorRepository');

/**
 * Les 10 indicateurs du tableau de bord (story D9-02).
 *
 * Tous sont des AGRÉGATS : aucun ne nomme un membre. Un tableau de bord se
 * consulte à plusieurs, souvent sur un écran partagé — il n'a pas à exposer
 * qui que ce soit.
 */
export interface DashboardMetrics {
  membresActifs: number;
  inscriptions7j: number;
  verificationsEnAttente: number;
  tauxVerification: number;
  matchs7j: number;
  conversationsActives7j: number;
  casModerationOuverts: number;
  casModerationEnRetard: number;
  abonnementsActifs: number;
  revenuMinor30j: { amountMinor: number; currency: string };
}

export interface AdminUserSummary {
  id: string;
  accountStatus: string;
  verificationStatus: string;
  createdAt: Date;
  lastActiveAt: Date | null;
  firstName: string | null;
  cityName: string | null;
  /** Numéro masqué : jamais rendu en entier, même au back-office. */
  phoneMasked: string;
}

export interface AdminUserDetail extends AdminUserSummary {
  roles: AdminRole[];
  sanctions: { type: string; reasonCode: string; createdAt: Date; revertedAt: Date | null }[];
  reportsAgainst: number;
  reportsFiled: number;
  subscription: { status: string; planCode: string | null; currentPeriodEnd: Date | null } | null;
  sessionsActives: number;
  photosCount: number;
}

export interface AdminQueryRepository {
  dashboard(now: Date): Promise<DashboardMetrics>;

  /**
   * Recherche d'un compte.
   *
   * La recherche par téléphone se fait sur l'EMPREINTE, jamais sur le numéro en
   * clair : la colonne indexée est un hachage salé, et c'est la seule façon de
   * retrouver un compte sans stocker le numéro en clair ailleurs.
   */
  searchUsers(input: {
    phoneHash?: string;
    email?: string;
    userId?: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: AdminUserSummary[]; nextCursor: string | null; hasMore: boolean }>;

  userDetail(userId: string): Promise<AdminUserDetail | null>;
}

export interface RoleRepository {
  listRoles(userId: string): Promise<AdminRole[]>;
  grant(userId: string, role: AdminRole, grantedBy: string, at: Date): Promise<void>;
  revoke(userId: string, role: AdminRole, at: Date): Promise<void>;
  listAdmins(limit: number): Promise<{ userId: string; roles: AdminRole[] }[]>;
  /** Nombre de super-administrateurs actifs — sert de garde-fou. */
  countSuperAdmins(): Promise<number>;
}

export interface FeatureFlagRecord {
  key: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  payload: unknown;
  updatedAt: Date;
}

export interface FeatureFlagRepository {
  list(): Promise<FeatureFlagRecord[]>;
  update(input: {
    key: string;
    enabled?: boolean;
    rolloutPercentage?: number;
    payload?: unknown;
    updatedByUserId: string;
    now: Date;
  }): Promise<FeatureFlagRecord | null>;
}

export interface AuditEntry {
  id: string;
  actorUserId: string;
  actorRole: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  context: unknown;
  createdAt: Date;
}

/** Lecture seule : aucune méthode d'écriture n'existe sur ce port, par choix. */
export interface AdminAuditReader {
  list(input: {
    actorUserId?: string;
    action?: string;
    targetId?: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: AuditEntry[]; nextCursor: string | null; hasMore: boolean }>;
}

export interface TwoFactorRepository {
  getSecret(userId: string): Promise<{ secret: string | null; enabled: boolean } | null>;
  setSecret(userId: string, secret: string, now: Date): Promise<void>;
  enable(userId: string, now: Date): Promise<void>;
  disable(userId: string, now: Date): Promise<void>;
}
