import type { SupportedCurrency } from '@acuba/contracts';
import type { Entitlements, PlanInterval, SubscriptionStatus } from '../domain/subscription-policy';
import type { PaymentMethodType, PaymentStatus } from '../domain/payment-policy';

export const PLAN_REPOSITORY = Symbol('PlanRepository');
export const SUBSCRIPTION_REPOSITORY = Symbol('SubscriptionRepository');
export const PAYMENT_REPOSITORY = Symbol('PaymentRepository');
export const WEBHOOK_REPOSITORY = Symbol('WebhookRepository');
export const BOOST_REPOSITORY = Symbol('BoostRepository');
export const BILLING_NOTIFIER = Symbol('BillingNotifier');

export interface PlanRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  interval: PlanInterval;
  priceMinor: number;
  currency: SupportedCurrency;
  minorUnitExponent: number;
  countryCode: string | null;
  entitlements: Entitlements;
  active: boolean;
  sortOrder: number;
}

export interface PlanRepository {
  /** Plans ouverts dans un pays : les plans mondiaux et ceux ciblés sur ce pays. */
  listActiveForCountry(countryCode: string): Promise<PlanRecord[]>;
  findById(planId: string): Promise<PlanRecord | null>;
  findByCode(code: string): Promise<PlanRecord | null>;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  planId: string;
  status: SubscriptionStatus;
  startedAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  gracePeriodEnd: Date | null;
  isPromotional: boolean;
}

export interface SubscriptionRepository {
  findCurrent(userId: string): Promise<SubscriptionRecord | null>;
  findById(subscriptionId: string): Promise<SubscriptionRecord | null>;

  create(input: {
    userId: string;
    planId: string;
    isPromotional: boolean;
    now: Date;
  }): Promise<SubscriptionRecord>;

  activate(input: {
    subscriptionId: string;
    startedAt: Date;
    currentPeriodEnd: Date;
    now: Date;
  }): Promise<void>;

  markPastDue(subscriptionId: string, gracePeriodEnd: Date, now: Date): Promise<void>;
  markCancelAtPeriodEnd(subscriptionId: string, now: Date): Promise<void>;
  markExpired(subscriptionId: string, now: Date): Promise<void>;

  /** Abonnements dont la grâce est écoulée — balayés par la tâche de clôture. */
  listGraceExpired(now: Date, limit: number): Promise<SubscriptionRecord[]>;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  subscriptionId: string | null;
  planId: string | null;
  amountMinor: number;
  currency: SupportedCurrency;
  status: PaymentStatus;
  methodType: PaymentMethodType;
  providerName: string;
  providerPaymentRef: string | null;
  methodLabel: string | null;
  idempotencyKey: string;
  refundedAmountMinor: number;
  receiptNumber: string | null;
  paidAt: Date | null;
  createdAt: Date;
}

export interface PaymentRepository {
  findByIdempotencyKey(key: string): Promise<PaymentRecord | null>;
  findById(paymentId: string): Promise<PaymentRecord | null>;
  findByProviderRef(providerName: string, ref: string): Promise<PaymentRecord | null>;

  create(input: {
    userId: string;
    subscriptionId: string | null;
    planId: string | null;
    amountMinor: number;
    currency: SupportedCurrency;
    minorUnitExponent: number;
    methodType: PaymentMethodType;
    providerName: string;
    providerPaymentRef: string | null;
    methodLabel: string | null;
    methodLast4: string | null;
    idempotencyKey: string;
    now: Date;
  }): Promise<PaymentRecord>;

  /**
   * Transition de statut **conditionnée à l'état courant**.
   *
   * Renvoie `false` si le paiement n'était plus dans `expectedFrom` : c'est la
   * garantie d'idempotence au niveau de la base, pas seulement en mémoire. Deux
   * webhooks concurrents ne peuvent pas créditer deux fois.
   */
  transition(input: {
    paymentId: string;
    expectedFrom: PaymentStatus[];
    to: PaymentStatus;
    providerPaymentRef?: string | null;
    receiptNumber?: string | null;
    failureCode?: string | null;
    failureReason?: string | null;
    paidAt?: Date | null;
    now: Date;
  }): Promise<boolean>;

  recordRefund(input: {
    paymentId: string;
    totalRefundedMinor: number;
    status: PaymentStatus;
    byUserId: string;
    now: Date;
  }): Promise<void>;

  listByUser(input: {
    userId: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: PaymentRecord[]; nextCursor: string | null; hasMore: boolean }>;

  /** Compteur mensuel des reçus, pour composer un numéro séquentiel. */
  nextReceiptSequence(now: Date): Promise<number>;
}

export interface WebhookRepository {
  /**
   * Enregistre l'événement et dit s'il est **nouveau**.
   *
   * La contrainte unique `(provider, providerEventId)` est l'arbitre : c'est elle
   * qui rend le rejeu inoffensif, pas une lecture préalable qui laisserait une
   * fenêtre de concurrence (ADR-010).
   */
  recordIfNew(input: {
    provider: string;
    providerEventId: string;
    eventType: string;
    signatureValid: boolean;
    payload: unknown;
    payloadHash: string;
    purgeAt: Date;
    now: Date;
  }): Promise<{ id: string; isNew: boolean }>;

  markProcessed(id: string, relatedPaymentId: string | null, now: Date): Promise<void>;
  markFailed(id: string, error: string, now: Date): Promise<void>;
}

export interface BoostRepository {
  create(input: {
    userId: string;
    paymentId: string | null;
    startsAt: Date;
    endsAt: Date;
    multiplier: number;
    grantedByPlan: boolean;
  }): Promise<{ id: string }>;

  listForUser(
    userId: string,
    limit: number,
  ): Promise<
    { id: string; startsAt: Date; endsAt: Date; multiplier: number; grantedByPlan: boolean }[]
  >;
}

/**
 * Notification des événements de facturation.
 *
 * Comme en D6 : la notification in-app est écrite en base, les canaux sortants
 * (push, e-mail) arrivent en D8. Voir docs/MOCKS.md.
 */
export interface BillingNotifier {
  subscriptionRenewed(userId: string, periodEnd: Date, now: Date): Promise<void>;
  paymentFailed(userId: string, gracePeriodEnd: Date, now: Date): Promise<void>;
  subscriptionExpiring(userId: string, periodEnd: Date, now: Date): Promise<void>;
}
