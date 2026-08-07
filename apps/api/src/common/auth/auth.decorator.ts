import { SetMetadata } from '@nestjs/common';

/**
 * Politique d'autorisation d'une route.
 *
 * Règle absolue : AUCUNE route ne peut exister sans `@Auth(...)` ou `@Public()`.
 * Le test d'inventaire `route-policy.spec.ts` échoue si une route n'en déclare pas
 * (docs/06-roles-et-permissions.md §6).
 */
export const AUTH_POLICY_KEY = 'acuba:auth-policy';

export type AuthLevel =
  /** Aucune authentification. */
  | 'public'
  /** Token valide, compte pas encore vérifié — parcours d'onboarding. */
  | 'pending'
  /** Compte actif, ni suspendu ni banni. */
  | 'auth'
  /** Compte vérifié — découverte, matching, messagerie. */
  | 'verified';

export interface AuthPolicy {
  level: AuthLevel;
  /** Permissions back-office requises (voir docs/06-roles-et-permissions.md §3.1). */
  permissions?: string[];
  /** La ressource doit appartenir à l'appelant. */
  owner?: boolean;
  /** L'appelant doit être membre de la conversation, avec un match actif. */
  conversationMember?: boolean;
  /** Clé de limitation de débit appliquée à la route. */
  rateLimit?: string;
  /** Action d'audit écrite dans la même transaction que l'opération. */
  audit?: string;
  /** Impose un motif écrit (consultation de donnée sensible). */
  requireReason?: boolean;
}

export const Auth = (policy: Omit<AuthPolicy, 'level'> & { level?: AuthLevel } = {}) =>
  SetMetadata<string, AuthPolicy>(AUTH_POLICY_KEY, {
    level: policy.level ?? 'auth',
    ...policy,
  });

/**
 * Ouvre une route à tous. Chaque usage doit figurer dans la liste de référence de
 * `route-policy.spec.ts` : ajouter une route publique exige une décision consciente
 * en revue de code, jamais un oubli.
 */
export const Public = () => SetMetadata<string, AuthPolicy>(AUTH_POLICY_KEY, { level: 'public' });
