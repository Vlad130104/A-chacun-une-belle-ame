/**
 * Réessais d'envoi (story D8-01).
 *
 * Deux idées, et elles sont indépendantes :
 *
 *  - **Tous les échecs ne se réessaient pas.** Un jeton push révoqué échouera
 *    autant de fois qu'on insistera. Réessayer un échec permanent consomme la
 *    file et retarde les envois légitimes.
 *  - **Le délai croît.** Un fournisseur momentanément saturé n'a pas besoin
 *    qu'on le martèle ; il a besoin qu'on attende.
 */

export type FailureKind =
  /** Panne réseau, délai dépassé, 5xx : le fournisseur peut revenir. */
  | 'TRANSIENT'
  /** Débit dépassé : réessayable, mais plus tard que la normale. */
  | 'RATE_LIMITED'
  /** Jeton invalide, adresse inexistante, numéro invalide : insister est inutile. */
  | 'PERMANENT';

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 5,
  baseDelayMs: 30_000,
  maxDelayMs: 3_600_000,
};

export function isRetryable(kind: FailureKind): boolean {
  return kind !== 'PERMANENT';
}

/**
 * Délai avant la prochaine tentative — **déterministe**.
 *
 * Croissance exponentielle plafonnée : 30 s, 1 min, 2 min, 4 min… jusqu'au
 * plafond. Aucune part d'aléatoire n'est introduite ici, pour deux raisons :
 * le calcul reste testable exactement, et la dispersion des tentatives est
 * mieux traitée par la file elle-même, qui connaît la charge réelle.
 *
 * `RATE_LIMITED` démarre volontairement au double : quand un fournisseur nous
 * dit d'attendre, le minimum est de ne pas revenir aussitôt.
 */
export function nextDelayMs(attempt: number, kind: FailureKind, config: RetryConfig): number {
  const multiplicateur = kind === 'RATE_LIMITED' ? 2 : 1;
  const brut = config.baseDelayMs * multiplicateur * 2 ** Math.max(0, attempt - 1);
  return Math.min(brut, config.maxDelayMs);
}

export type RetryDecision =
  | { action: 'RETRY'; delayMs: number; attempt: number }
  | { action: 'GIVE_UP'; reason: 'PERMANENT' | 'MAX_ATTEMPTS' };

/**
 * Que faire après un échec d'envoi ?
 *
 * L'abandon n'est pas une perte : la notification `IN_APP` a déjà été écrite en
 * base et reste visible dans le centre de notifications. Ce qui échoue ici est
 * le canal sortant, pas l'information.
 */
export function decideRetry(
  attempt: number,
  kind: FailureKind,
  config: RetryConfig,
): RetryDecision {
  if (!isRetryable(kind)) return { action: 'GIVE_UP', reason: 'PERMANENT' };
  if (attempt >= config.maxAttempts) return { action: 'GIVE_UP', reason: 'MAX_ATTEMPTS' };

  return { action: 'RETRY', delayMs: nextDelayMs(attempt, kind, config), attempt: attempt + 1 };
}

/**
 * Classification d'une erreur de fournisseur.
 *
 * Faite sur le message faute d'un contrat d'erreur commun aux fournisseurs. Le
 * défaut est `TRANSIENT` : en cas de doute, mieux vaut réessayer une notification
 * que la perdre — le plafond de tentatives borne le coût de cette prudence.
 */
export function classifyFailure(error: unknown): FailureKind {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

  if (
    message.includes('not registered') ||
    message.includes('invalid token') ||
    message.includes('unregistered') ||
    message.includes('invalid recipient') ||
    message.includes('mailbox not found') ||
    message.includes('invalid number')
  ) {
    return 'PERMANENT';
  }

  if (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('429')
  ) {
    return 'RATE_LIMITED';
  }

  return 'TRANSIENT';
}
