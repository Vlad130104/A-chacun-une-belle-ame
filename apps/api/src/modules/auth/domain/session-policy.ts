/**
 * Règles de session et de rotation des refresh tokens (ADR-005).
 *
 * Le point central : un refresh token est à USAGE UNIQUE. Sa réutilisation signifie
 * qu'une copie circule — soit l'ancien porteur, soit un voleur. On ne peut pas les
 * distinguer, donc on révoque toute la famille et on notifie. Mieux vaut déconnecter
 * une personne légitime que laisser un voleur en place.
 */

export type SessionVerdict =
  { valid: true } | { valid: false; reason: 'EXPIRED' | 'REVOKED' | 'REUSED' };

export interface SessionState {
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  /** Renseigné dès que le token a servi à en produire un nouveau. */
  rotatedAt: Date | null;
}

export function verifySession(session: SessionState, now: Date): SessionVerdict {
  // La réutilisation prime sur tout autre motif : c'est le signal de sécurité.
  if (session.rotatedAt !== null) return { valid: false, reason: 'REUSED' };
  if (session.revokedAt !== null) return { valid: false, reason: 'REVOKED' };
  if (now.getTime() >= session.expiresAt.getTime()) return { valid: false, reason: 'EXPIRED' };

  return { valid: true };
}

/**
 * Une réutilisation détectée doit révoquer la famille entière, pas seulement la
 * session présentée : le voleur détient probablement un token plus récent.
 */
export function requiresFamilyRevocation(verdict: SessionVerdict): boolean {
  return !verdict.valid && verdict.reason === 'REUSED';
}

export type AccountAccess =
  | { allowed: true }
  | { allowed: false; reason: 'SUSPENDED' | 'BANNED' | 'UNDERAGE' | 'DELETED' | 'PENDING_OTP' };

/** Statuts de compte au sens du schéma Prisma. */
export type AccountStatusValue =
  | 'PENDING_OTP'
  | 'ACTIVE'
  | 'PAUSED'
  | 'RESTRICTED'
  | 'SUSPENDED'
  | 'BANNED'
  | 'BLOCKED_UNDERAGE'
  | 'PENDING_DELETION'
  | 'DELETED';

/**
 * Un compte en pause, restreint ou en attente de suppression conserve l'accès à son
 * compte : c'est le produit qui est limité, pas l'authentification. Un compte suspendu,
 * banni, refusé pour minorité ou supprimé ne se connecte plus du tout.
 */
export function checkAccountAccess(status: AccountStatusValue): AccountAccess {
  switch (status) {
    case 'ACTIVE':
    case 'PAUSED':
    case 'RESTRICTED':
    case 'PENDING_DELETION':
      return { allowed: true };
    case 'PENDING_OTP':
      return { allowed: false, reason: 'PENDING_OTP' };
    case 'SUSPENDED':
      return { allowed: false, reason: 'SUSPENDED' };
    case 'BANNED':
      return { allowed: false, reason: 'BANNED' };
    case 'BLOCKED_UNDERAGE':
      return { allowed: false, reason: 'UNDERAGE' };
    case 'DELETED':
      return { allowed: false, reason: 'DELETED' };
  }
}
