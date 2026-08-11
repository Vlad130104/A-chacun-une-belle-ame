/**
 * Cycle de vie d'un abonnement (stories D7-02, D7-06, D7-07).
 *
 * Trois principes qui gouvernent ce fichier :
 *
 *  1. **Un droit se perd à une date, jamais par surprise.** Une annulation laisse
 *     l'abonnement actif jusqu'à la fin de la période déjà payée.
 *  2. **Un échec de paiement n'est pas une fraude.** Sur les marchés visés, un
 *     prélèvement échoue pour cause de solde mobile momentanément vide. La période
 *     de grâce existe pour cela.
 *  3. **Un droit payant n'ouvre jamais une porte de sécurité.** Les droits listés
 *     ici touchent la visibilité et les quotas, jamais la vérification, la
 *     modération ou le consentement.
 */

export type SubscriptionStatus =
  'PENDING_PAYMENT' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED';

export type PlanInterval = 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'ONE_TIME';

/**
 * Durée d'une période, en mois.
 *
 * `ONE_TIME` vaut zéro : un boost n'a pas de période d'abonnement, sa durée lui
 * est propre et vit sur la table `Boost`.
 */
const MOIS_PAR_INTERVALLE: Record<PlanInterval, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
  ONE_TIME: 0,
};

export function monthsFor(interval: PlanInterval): number {
  return MOIS_PAR_INTERVALLE[interval];
}

/**
 * Fin de période.
 *
 * `setUTCMonth` gère seul le débordement d'année. Le piège est ailleurs : le
 * 31 janvier + 1 mois donnerait le 3 mars. On ramène donc au dernier jour du mois
 * cible — un abonné du 31 est facturé le 28 février, pas le 3 mars.
 */
export function addPeriod(from: Date, interval: PlanInterval): Date {
  const mois = monthsFor(interval);
  if (mois === 0) return new Date(from.getTime());

  const jourInitial = from.getUTCDate();
  const cible = new Date(from.getTime());
  cible.setUTCDate(1);
  cible.setUTCMonth(cible.getUTCMonth() + mois);

  const dernierJourDuMois = new Date(
    Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0),
  ).getUTCDate();

  cible.setUTCDate(Math.min(jourInitial, dernierJourDuMois));
  return cible;
}

export interface SubscriptionState {
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  gracePeriodEnd: Date | null;
}

/**
 * Les droits d'un abonnement sont-ils ouverts à cet instant ?
 *
 * `CANCELLED` reste actif jusqu'à l'échéance : le membre a payé sa période, il
 * la garde. `PAST_DUE` reste actif jusqu'à la fin de la grâce — couper l'accès à
 * la seconde où un prélèvement échoue punirait un incident réseau.
 */
export function hasActiveEntitlements(state: SubscriptionState, now: Date): boolean {
  switch (state.status) {
    case 'ACTIVE':
    case 'CANCELLED':
      return state.currentPeriodEnd !== null && state.currentPeriodEnd.getTime() > now.getTime();
    case 'PAST_DUE':
      return state.gracePeriodEnd !== null && state.gracePeriodEnd.getTime() > now.getTime();
    case 'PENDING_PAYMENT':
    case 'EXPIRED':
    case 'REFUNDED':
      return false;
  }
}

export type SubscribeRefusal =
  /** Un abonnement est déjà actif — il faut attendre l'échéance ou l'annuler. */
  | 'ALREADY_ACTIVE'
  /** Le plan n'est pas ouvert, ou pas dans le pays du membre. */
  | 'PLAN_UNAVAILABLE';

export type SubscribeVerdict = { allowed: true } | { allowed: false; reason: SubscribeRefusal };

export interface PlanAvailability {
  active: boolean;
  /** `null` = plan mondial. */
  countryCode: string | null;
  interval: PlanInterval;
}

export function checkSubscribe(
  plan: PlanAvailability | null,
  userCountryCode: string,
  existing: SubscriptionState | null,
  now: Date,
): SubscribeVerdict {
  if (plan === null || !plan.active) return { allowed: false, reason: 'PLAN_UNAVAILABLE' };
  if (plan.countryCode !== null && plan.countryCode !== userCountryCode) {
    // Un plan ciblé sur un pays ne doit pas être souscrit ailleurs : les prix
    // diffèrent, et la devise avec eux.
    return { allowed: false, reason: 'PLAN_UNAVAILABLE' };
  }
  if (plan.interval === 'ONE_TIME') return { allowed: false, reason: 'PLAN_UNAVAILABLE' };

  if (existing !== null && hasActiveEntitlements(existing, now)) {
    return { allowed: false, reason: 'ALREADY_ACTIVE' };
  }

  return { allowed: true };
}

/**
 * Un paiement réussi active l'abonnement.
 *
 * La nouvelle période part de la fin de l'ancienne si elle est encore future :
 * un membre qui renouvelle en avance ne perd pas les jours restants. Sinon elle
 * part de maintenant.
 */
export function activateAfterPayment(
  state: SubscriptionState | null,
  interval: PlanInterval,
  now: Date,
): { status: SubscriptionStatus; startedAt: Date; currentPeriodEnd: Date } {
  const base =
    state?.currentPeriodEnd !== null &&
    state?.currentPeriodEnd !== undefined &&
    state.currentPeriodEnd.getTime() > now.getTime()
      ? state.currentPeriodEnd
      : now;

  return { status: 'ACTIVE', startedAt: now, currentPeriodEnd: addPeriod(base, interval) };
}

/**
 * Échec de paiement : période de grâce (story D7-07).
 *
 * Les droits restent ouverts pendant la grâce. C'est un choix produit assumé :
 * sur les marchés visés, un prélèvement échoue le plus souvent pour un solde
 * momentanément insuffisant, pas pour une insolvabilité.
 */
export function applyPaymentFailure(
  now: Date,
  graceDays: number,
): { status: SubscriptionStatus; gracePeriodEnd: Date } {
  return { status: 'PAST_DUE', gracePeriodEnd: new Date(now.getTime() + graceDays * 86_400_000) };
}

/** Fin de grâce sans régularisation : les droits se ferment, la donnée reste. */
export function expireAfterGrace(state: SubscriptionState, now: Date): SubscriptionStatus | null {
  if (state.status !== 'PAST_DUE') return null;
  if (state.gracePeriodEnd === null || state.gracePeriodEnd.getTime() > now.getTime()) return null;
  return 'EXPIRED';
}

export type CancelRefusal = 'NOT_ACTIVE' | 'ALREADY_CANCELLED';

export type CancelVerdict = { allowed: true } | { allowed: false; reason: CancelRefusal };

/**
 * Annulation du renouvellement (story D7-06).
 *
 * On n'interrompt jamais la période en cours : le membre a payé, il garde ses
 * droits jusqu'à l'échéance. `cancelAtPeriodEnd` est donc un drapeau, pas une
 * coupure.
 */
export function checkCancel(state: SubscriptionState | null): CancelVerdict {
  if (state === null || (state.status !== 'ACTIVE' && state.status !== 'PAST_DUE')) {
    return { allowed: false, reason: 'NOT_ACTIVE' };
  }
  if (state.cancelAtPeriodEnd) return { allowed: false, reason: 'ALREADY_CANCELLED' };
  return { allowed: true };
}

/**
 * Droits ouverts par un abonnement.
 *
 * **Aucun de ces droits ne touche à la sécurité.** Ni la vérification d'identité,
 * ni la modération, ni le consentement, ni le blocage ne s'achètent. Un test le
 * vérifie sur la liste complète (principe non négociable du cahier des charges).
 */
export interface Entitlements {
  dailySuggestions: number;
  dailyLikes: number;
  /** Voir qui a manifesté un intérêt. */
  seeInterestSenders: boolean;
  advancedFilters: boolean;
  /** Boosts inclus par période. */
  includedBoosts: number;
  readReceipts: boolean;
}

export const FREE_ENTITLEMENTS: Entitlements = {
  dailySuggestions: 10,
  dailyLikes: 10,
  seeInterestSenders: false,
  advancedFilters: false,
  includedBoosts: 0,
  readReceipts: false,
};

/**
 * Lecture défensive des droits stockés en JSON sur le plan.
 *
 * Un champ absent ou mal typé retombe sur la valeur gratuite, jamais sur une
 * valeur permissive : une donnée corrompue ne doit pas offrir un accès payant,
 * et surtout pas en offrir un illimité.
 */
export function readEntitlements(raw: unknown): Entitlements {
  if (typeof raw !== 'object' || raw === null) return FREE_ENTITLEMENTS;
  const source = raw as Record<string, unknown>;

  return {
    dailySuggestions: entier(source.dailySuggestions, FREE_ENTITLEMENTS.dailySuggestions),
    dailyLikes: entier(source.dailyLikes, FREE_ENTITLEMENTS.dailyLikes),
    seeInterestSenders: booleen(source.seeInterestSenders),
    advancedFilters: booleen(source.advancedFilters),
    includedBoosts: entier(source.includedBoosts, FREE_ENTITLEMENTS.includedBoosts),
    readReceipts: booleen(source.readReceipts),
  };
}

function entier(valeur: unknown, defaut: number): number {
  return typeof valeur === 'number' && Number.isInteger(valeur) && valeur >= 0 ? valeur : defaut;
}

function booleen(valeur: unknown): boolean {
  return valeur === true;
}
