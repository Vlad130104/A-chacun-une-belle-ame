/**
 * Paiements : montants, transitions et idempotence (stories D7-03, D7-04, D7-08).
 *
 * Le fichier le plus dangereux du projet. Une erreur d'exposant monétaire, une
 * transition de statut permissive ou un webhook rejoué sans garde produisent tous
 * le même résultat : de l'argent créé ou perdu. Tout est donc en fonctions pures,
 * testé cas par cas, et rien n'est laissé à l'appréciation d'un appelant.
 */

import { isSupportedCurrency, minorUnitExponent, type SupportedCurrency } from '@acuba/contracts';

export type PaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type PaymentMethodType = 'MOBILE_MONEY' | 'CARD' | 'MANUAL';

/**
 * Transitions autorisées d'un paiement.
 *
 * Un état terminal ne se rouvre pas. Le point qui compte : `SUCCEEDED` n'est
 * atteignable que depuis `PENDING` ou `PROCESSING` — un paiement échoué ne peut
 * pas devenir réussi par un webhook tardif ou rejoué.
 */
const TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  PENDING: ['PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED'],
  PROCESSING: ['SUCCEEDED', 'FAILED', 'CANCELLED'],
  SUCCEEDED: ['REFUNDED', 'PARTIALLY_REFUNDED'],
  PARTIALLY_REFUNDED: ['REFUNDED', 'PARTIALLY_REFUNDED'],
  FAILED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Un paiement dans un état terminal ne bouge plus, sauf remboursement. */
export function isTerminal(status: PaymentStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export class AmountMismatchError extends Error {
  constructor(expected: number, received: number, currency: string) {
    super(
      `Montant incohérent : ${expected} ${currency} attendu, ${received} ${currency} reçu. ` +
        'Le montant du fournisseur ne fait jamais autorité sur celui du plan.',
    );
    this.name = 'AmountMismatchError';
  }
}

export type AmountRefusal = 'CURRENCY_UNSUPPORTED' | 'CURRENCY_MISMATCH' | 'AMOUNT_MISMATCH';

export type AmountVerdict = { valid: true } | { valid: false; reason: AmountRefusal };

/**
 * Le montant confirmé par le fournisseur correspond-il à celui du plan ?
 *
 * Contrôle non négociable : c'est **le plan** qui fait foi, jamais la réponse du
 * fournisseur. Sans ce contrôle, un webhook falsifié ou une erreur de leur côté
 * créditerait un abonnement pour un montant arbitraire.
 */
export function verifyAmount(input: {
  expectedAmountMinor: number;
  expectedCurrency: string;
  receivedAmountMinor: number;
  receivedCurrency: string;
}): AmountVerdict {
  if (
    !isSupportedCurrency(input.receivedCurrency) ||
    !isSupportedCurrency(input.expectedCurrency)
  ) {
    return { valid: false, reason: 'CURRENCY_UNSUPPORTED' };
  }
  if (input.receivedCurrency !== input.expectedCurrency) {
    return { valid: false, reason: 'CURRENCY_MISMATCH' };
  }
  if (input.receivedAmountMinor !== input.expectedAmountMinor) {
    return { valid: false, reason: 'AMOUNT_MISMATCH' };
  }
  return { valid: true };
}

/**
 * Vérifie qu'un prix stocké est cohérent avec l'exposant de sa devise.
 *
 * Le piège du projet (ADR-009) : XAF et XOF n'ont **pas** de sous-unité. Un prix
 * de 5 000 F CFA se stocke `5000`. Quelqu'un qui raisonne en centimes écrirait
 * `500000` et facturerait cent fois trop. On ne peut pas détecter cela avec
 * certitude, mais on peut refuser l'incohérence évidente : un montant non entier.
 */
export function assertStorablePrice(amountMinor: number, currency: SupportedCurrency): void {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new Error(
      `Prix invalide : ${amountMinor} ${currency}. ` +
        'Un montant est un entier positif en unité minimale (ADR-009).',
    );
  }
}

export type RefundRefusal =
  | 'NOT_SUCCEEDED'
  | 'AMOUNT_EXCEEDS_REMAINDER'
  | 'SECOND_APPROVER_REQUIRED'
  | 'SECOND_APPROVER_MUST_DIFFER'
  | 'REASON_REQUIRED';

export type RefundVerdict = { allowed: true } | { allowed: false; reason: RefundRefusal };

export interface RefundRequest {
  paymentStatus: PaymentStatus;
  paidAmountMinor: number;
  alreadyRefundedMinor: number;
  requestedAmountMinor: number;
  requestedByUserId: string;
  approvedByUserId: string | null;
  reason: string;
}

/**
 * Remboursement (story D7-08) — quatre yeux obligatoires.
 *
 * Même exigence que le bannissement, pour la même raison : une action qui sort de
 * l'argent ou détruit un compte ne doit jamais dépendre d'une seule personne.
 */
export function checkRefund(request: RefundRequest): RefundVerdict {
  if (request.paymentStatus !== 'SUCCEEDED' && request.paymentStatus !== 'PARTIALLY_REFUNDED') {
    return { allowed: false, reason: 'NOT_SUCCEEDED' };
  }

  const restant = request.paidAmountMinor - request.alreadyRefundedMinor;
  if (request.requestedAmountMinor <= 0 || request.requestedAmountMinor > restant) {
    return { allowed: false, reason: 'AMOUNT_EXCEEDS_REMAINDER' };
  }

  if (request.approvedByUserId === null) {
    return { allowed: false, reason: 'SECOND_APPROVER_REQUIRED' };
  }
  if (request.approvedByUserId === request.requestedByUserId) {
    return { allowed: false, reason: 'SECOND_APPROVER_MUST_DIFFER' };
  }

  if (request.reason.trim().length === 0) return { allowed: false, reason: 'REASON_REQUIRED' };

  return { allowed: true };
}

/** Statut résultant d'un remboursement : total ou partiel. */
export function statusAfterRefund(
  paidAmountMinor: number,
  totalRefundedMinor: number,
): PaymentStatus {
  return totalRefundedMinor >= paidAmountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
}

export type WebhookDecision =
  /** Signature invalide : rien n'est lu, rien n'est traité. */
  | { action: 'REJECT'; reason: 'INVALID_SIGNATURE' }
  /** Déjà vu : on répond 200 sans retraiter (ADR-010). */
  | { action: 'IGNORE_DUPLICATE' }
  | { action: 'PROCESS' };

/**
 * Que faire d'un webhook entrant (story D7-04) ?
 *
 * L'ordre est impératif : **la signature est vérifiée avant toute lecture du
 * corps**. Analyser d'abord reviendrait à faire confiance à un corps non
 * authentifié pour décider s'il faut l'authentifier.
 *
 * La déduplication s'appuie sur la contrainte unique `(provider, providerEventId)`
 * en base ; cette fonction dit seulement quoi faire du verdict.
 */
export function decideWebhook(input: {
  signatureValid: boolean;
  alreadyProcessed: boolean;
}): WebhookDecision {
  if (!input.signatureValid) return { action: 'REJECT', reason: 'INVALID_SIGNATURE' };
  if (input.alreadyProcessed) return { action: 'IGNORE_DUPLICATE' };
  return { action: 'PROCESS' };
}

/**
 * Numéro de reçu, séquentiel et lisible.
 *
 * Format `ACUBA-AAAAMM-NNNNNN`. Le compteur repart chaque mois : un numéro doit
 * rester court à lire au téléphone par un membre qui conteste un prélèvement.
 */
export function buildReceiptNumber(now: Date, monthlySequence: number): string {
  const annee = now.getUTCFullYear();
  const mois = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `ACUBA-${annee}${mois}-${String(monthlySequence).padStart(6, '0')}`;
}

/**
 * Étiquette d'un moyen de paiement, telle qu'elle sera stockée et affichée.
 *
 * Le numéro complet n'est **jamais** conservé : mobile money → opérateur et quatre
 * derniers chiffres ; carte → quatre derniers chiffres seulement. Cette fonction
 * est le seul endroit qui produit cette chaîne, pour qu'il n'y ait qu'un endroit
 * à relire.
 */
export function maskPaymentMethod(
  methodType: PaymentMethodType,
  identifier: string | null,
): { label: string; last4: string | null } {
  if (identifier === null || identifier.length < 4) {
    return { label: labelFor(methodType), last4: null };
  }

  const last4 = identifier.slice(-4);
  return { label: `${labelFor(methodType)} ••••${last4}`, last4 };
}

function labelFor(methodType: PaymentMethodType): string {
  switch (methodType) {
    case 'MOBILE_MONEY':
      return 'Mobile money';
    case 'CARD':
      return 'Carte';
    case 'MANUAL':
      return 'Régularisation';
  }
}

/** Formatage lisible d'un montant, dans la devise et l'exposant qui lui sont propres. */
export function formatAmount(amountMinor: number, currency: SupportedCurrency): string {
  const exposant = minorUnitExponent(currency);
  if (exposant === 0) return `${amountMinor.toLocaleString('fr-FR')} ${currency}`;

  const majeur = amountMinor / 10 ** exposant;
  return `${majeur.toLocaleString('fr-FR', {
    minimumFractionDigits: exposant,
    maximumFractionDigits: exposant,
  })} ${currency}`;
}
