import type { CheckoutInstruction, PaymentProvider } from '../../../providers/ports';
import type { PaymentStatus } from '../domain/payment-policy';
import { FREE_ENTITLEMENTS } from '../domain/subscription-policy';
import type {
  BillingNotifier,
  BoostRepository,
  PaymentRecord,
  PaymentRepository,
  PlanRecord,
  PlanRepository,
  SubscriptionRecord,
  SubscriptionRepository,
  WebhookRepository,
} from './ports';

/**
 * Doublures en mémoire des ports de facturation.
 *
 * Elles reproduisent le comportement qui compte : la contrainte unique sur la
 * clé d'idempotence, la transition conditionnée à l'état courant, et l'unicité
 * `(provider, providerEventId)` des webhooks. Sans cela, les tests d'idempotence
 * ne prouveraient rien.
 */
export class FakePlanRepository implements PlanRepository {
  plans: PlanRecord[] = [];

  listActiveForCountry(countryCode: string): Promise<PlanRecord[]> {
    return Promise.resolve(
      this.plans.filter(
        (plan) => plan.active && (plan.countryCode === null || plan.countryCode === countryCode),
      ),
    );
  }

  findById(planId: string): Promise<PlanRecord | null> {
    return Promise.resolve(this.plans.find((plan) => plan.id === planId) ?? null);
  }

  findByCode(code: string): Promise<PlanRecord | null> {
    return Promise.resolve(this.plans.find((plan) => plan.code === code) ?? null);
  }

  seed(surcharge: Partial<PlanRecord> = {}): PlanRecord {
    const plan: PlanRecord = {
      id: `plan-${this.plans.length + 1}`,
      code: 'premium_monthly',
      name: 'Premium mensuel',
      description: null,
      interval: 'MONTHLY',
      priceMinor: 5000,
      currency: 'XAF',
      minorUnitExponent: 0,
      countryCode: null,
      entitlements: { ...FREE_ENTITLEMENTS, dailySuggestions: 30, seeInterestSenders: true },
      active: true,
      sortOrder: 0,
      ...surcharge,
    };
    this.plans.push(plan);
    return plan;
  }
}

export class FakeSubscriptionRepository implements SubscriptionRepository {
  subscriptions: SubscriptionRecord[] = [];
  private sequence = 0;

  findCurrent(userId: string): Promise<SubscriptionRecord | null> {
    const trouve = [...this.subscriptions]
      .reverse()
      .find((abonnement) => abonnement.userId === userId);
    return Promise.resolve(trouve ?? null);
  }

  findById(subscriptionId: string): Promise<SubscriptionRecord | null> {
    return Promise.resolve(
      this.subscriptions.find((abonnement) => abonnement.id === subscriptionId) ?? null,
    );
  }

  create(input: Parameters<SubscriptionRepository['create']>[0]): Promise<SubscriptionRecord> {
    this.sequence += 1;
    const abonnement: SubscriptionRecord = {
      id: `sub-${this.sequence}`,
      userId: input.userId,
      planId: input.planId,
      status: 'PENDING_PAYMENT',
      startedAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      gracePeriodEnd: null,
      isPromotional: input.isPromotional,
    };
    this.subscriptions.push(abonnement);
    return Promise.resolve(abonnement);
  }

  activate(input: Parameters<SubscriptionRepository['activate']>[0]): Promise<void> {
    const abonnement = this.find(input.subscriptionId);
    if (abonnement !== undefined) {
      abonnement.status = 'ACTIVE';
      abonnement.startedAt = input.startedAt;
      abonnement.currentPeriodEnd = input.currentPeriodEnd;
      abonnement.gracePeriodEnd = null;
    }
    return Promise.resolve();
  }

  markPastDue(subscriptionId: string, gracePeriodEnd: Date): Promise<void> {
    const abonnement = this.find(subscriptionId);
    if (abonnement !== undefined) {
      abonnement.status = 'PAST_DUE';
      abonnement.gracePeriodEnd = gracePeriodEnd;
    }
    return Promise.resolve();
  }

  markCancelAtPeriodEnd(subscriptionId: string): Promise<void> {
    const abonnement = this.find(subscriptionId);
    if (abonnement !== undefined) {
      abonnement.cancelAtPeriodEnd = true;
      abonnement.status = 'CANCELLED';
    }
    return Promise.resolve();
  }

  markExpired(subscriptionId: string): Promise<void> {
    const abonnement = this.find(subscriptionId);
    if (abonnement !== undefined) abonnement.status = 'EXPIRED';
    return Promise.resolve();
  }

  listGraceExpired(now: Date, limit: number): Promise<SubscriptionRecord[]> {
    return Promise.resolve(
      this.subscriptions
        .filter(
          (abonnement) =>
            abonnement.status === 'PAST_DUE' &&
            abonnement.gracePeriodEnd !== null &&
            abonnement.gracePeriodEnd.getTime() <= now.getTime(),
        )
        .slice(0, limit),
    );
  }

  seed(surcharge: Partial<SubscriptionRecord> & { userId: string }): SubscriptionRecord {
    this.sequence += 1;
    const abonnement: SubscriptionRecord = {
      id: `sub-${this.sequence}`,
      planId: 'plan-1',
      status: 'ACTIVE',
      startedAt: new Date('2026-03-01T12:00:00.000Z'),
      currentPeriodEnd: new Date('2026-04-01T12:00:00.000Z'),
      cancelAtPeriodEnd: false,
      gracePeriodEnd: null,
      isPromotional: false,
      ...surcharge,
    };
    this.subscriptions.push(abonnement);
    return abonnement;
  }

  private find(id: string): SubscriptionRecord | undefined {
    return this.subscriptions.find((abonnement) => abonnement.id === id);
  }
}

export class FakePaymentRepository implements PaymentRepository {
  payments: PaymentRecord[] = [];
  transitions: { paymentId: string; to: PaymentStatus; applied: boolean }[] = [];
  private sequence = 0;
  private receiptSequence = 0;

  findByIdempotencyKey(key: string): Promise<PaymentRecord | null> {
    return Promise.resolve(
      this.payments.find((paiement) => paiement.idempotencyKey === key) ?? null,
    );
  }

  findById(paymentId: string): Promise<PaymentRecord | null> {
    return Promise.resolve(this.payments.find((paiement) => paiement.id === paymentId) ?? null);
  }

  findByProviderRef(providerName: string, ref: string): Promise<PaymentRecord | null> {
    return Promise.resolve(
      this.payments.find(
        (paiement) => paiement.providerName === providerName && paiement.providerPaymentRef === ref,
      ) ?? null,
    );
  }

  create(input: Parameters<PaymentRepository['create']>[0]): Promise<PaymentRecord> {
    // La contrainte unique est reproduite : deux paiements ne peuvent pas
    // partager une clé d'idempotence.
    if (this.payments.some((paiement) => paiement.idempotencyKey === input.idempotencyKey)) {
      throw new Error('Clé d’idempotence déjà utilisée');
    }

    this.sequence += 1;
    const paiement: PaymentRecord = {
      id: `pay-${this.sequence}`,
      userId: input.userId,
      subscriptionId: input.subscriptionId,
      planId: input.planId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: 'PENDING',
      methodType: input.methodType,
      providerName: input.providerName,
      providerPaymentRef: input.providerPaymentRef,
      methodLabel: input.methodLabel,
      idempotencyKey: input.idempotencyKey,
      refundedAmountMinor: 0,
      receiptNumber: null,
      paidAt: null,
      createdAt: input.now,
    };
    this.payments.push(paiement);
    return Promise.resolve(paiement);
  }

  transition(input: Parameters<PaymentRepository['transition']>[0]): Promise<boolean> {
    const paiement = this.payments.find((candidat) => candidat.id === input.paymentId);

    // Le point crucial : la transition n'est appliquée que si l'état courant est
    // celui attendu. C'est ce qui rend le rejeu inoffensif.
    const applicable = paiement !== undefined && input.expectedFrom.includes(paiement.status);
    this.transitions.push({ paymentId: input.paymentId, to: input.to, applied: applicable });

    if (!applicable || paiement === undefined) return Promise.resolve(false);

    paiement.status = input.to;
    if (input.providerPaymentRef !== undefined) {
      paiement.providerPaymentRef = input.providerPaymentRef;
    }
    if (input.receiptNumber !== undefined) paiement.receiptNumber = input.receiptNumber;
    if (input.paidAt !== undefined) paiement.paidAt = input.paidAt;

    return Promise.resolve(true);
  }

  recordRefund(input: Parameters<PaymentRepository['recordRefund']>[0]): Promise<void> {
    const paiement = this.payments.find((candidat) => candidat.id === input.paymentId);
    if (paiement !== undefined) {
      paiement.refundedAmountMinor = input.totalRefundedMinor;
      paiement.status = input.status;
    }
    return Promise.resolve();
  }

  listByUser(
    input: Parameters<PaymentRepository['listByUser']>[0],
  ): ReturnType<PaymentRepository['listByUser']> {
    const items = this.payments
      .filter((paiement) => paiement.userId === input.userId)
      .slice(0, input.limit);
    return Promise.resolve({ items, nextCursor: null, hasMore: false });
  }

  nextReceiptSequence(): Promise<number> {
    this.receiptSequence += 1;
    return Promise.resolve(this.receiptSequence);
  }
}

export class FakeWebhookRepository implements WebhookRepository {
  events: { id: string; provider: string; providerEventId: string; status: string }[] = [];
  private sequence = 0;

  recordIfNew(
    input: Parameters<WebhookRepository['recordIfNew']>[0],
  ): Promise<{ id: string; isNew: boolean }> {
    // Reproduit la contrainte unique `(provider, providerEventId)` : c'est elle
    // qui rend le rejeu inoffensif, pas une lecture préalable.
    const existant = this.events.find(
      (evenement) =>
        evenement.provider === input.provider &&
        evenement.providerEventId === input.providerEventId,
    );
    if (existant !== undefined) return Promise.resolve({ id: existant.id, isNew: false });

    this.sequence += 1;
    const id = `hook-${this.sequence}`;
    this.events.push({
      id,
      provider: input.provider,
      providerEventId: input.providerEventId,
      status: 'RECEIVED',
    });
    return Promise.resolve({ id, isNew: true });
  }

  markProcessed(id: string): Promise<void> {
    const evenement = this.events.find((candidat) => candidat.id === id);
    if (evenement !== undefined) evenement.status = 'PROCESSED';
    return Promise.resolve();
  }

  markFailed(id: string): Promise<void> {
    const evenement = this.events.find((candidat) => candidat.id === id);
    if (evenement !== undefined) evenement.status = 'FAILED';
    return Promise.resolve();
  }
}

export class FakeBoostRepository implements BoostRepository {
  boosts: { id: string; userId: string; paymentId: string | null }[] = [];

  create(input: Parameters<BoostRepository['create']>[0]): Promise<{ id: string }> {
    const id = `boost-${this.boosts.length + 1}`;
    this.boosts.push({ id, userId: input.userId, paymentId: input.paymentId });
    return Promise.resolve({ id });
  }

  listForUser(): ReturnType<BoostRepository['listForUser']> {
    return Promise.resolve([]);
  }
}

export class FakeBillingNotifier implements BillingNotifier {
  renewals: string[] = [];
  failures: string[] = [];
  expirations: string[] = [];

  subscriptionRenewed(userId: string): Promise<void> {
    this.renewals.push(userId);
    return Promise.resolve();
  }

  paymentFailed(userId: string): Promise<void> {
    this.failures.push(userId);
    return Promise.resolve();
  }

  subscriptionExpiring(userId: string): Promise<void> {
    this.expirations.push(userId);
    return Promise.resolve();
  }
}

/**
 * Fournisseur de paiement de test.
 *
 * `signatureValid` est réglable, contrairement au fournisseur simulé réel qui
 * renvoie toujours `false` : c'est le seul moyen d'éprouver le chemin nominal du
 * traitement de webhook.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'FakePaymentProvider';
  readonly simulated = true;

  signatureValid = true;
  refunds: { ref: string; amountMinor: number }[] = [];
  private counter = 0;

  createCheckout(
    input: Parameters<PaymentProvider['createCheckout']>[0],
  ): Promise<CheckoutInstruction> {
    this.counter += 1;
    return Promise.resolve({
      paymentId: input.idempotencyKey,
      providerPaymentRef: `fake_ref_${this.counter}`,
      status: 'PENDING',
      instruction: { testMode: true },
    });
  }

  refund(providerPaymentRef: string, amountMinor: number): Promise<void> {
    this.refunds.push({ ref: providerPaymentRef, amountMinor });
    return Promise.resolve();
  }

  verifyWebhookSignature(): boolean {
    return this.signatureValid;
  }

  parseWebhook(rawBody: Buffer): { providerEventId: string; eventType: string } {
    const parsed: unknown = JSON.parse(rawBody.toString('utf8'));
    const source = parsed as { id?: string; type?: string };
    return { providerEventId: source.id ?? 'inconnu', eventType: source.type ?? 'unknown' };
  }
}

/** Horloge figée : aucun test ne dépend de l'heure réelle. */
export class FixedClock {
  constructor(private instant: Date) {}

  advanceDays(days: number): void {
    this.instant = new Date(this.instant.getTime() + days * 86_400_000);
  }

  now(): Date {
    return new Date(this.instant.getTime());
  }
}
