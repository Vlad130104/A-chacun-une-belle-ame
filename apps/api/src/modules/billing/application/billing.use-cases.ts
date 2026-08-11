import { createHash } from 'node:crypto';
import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import type { ClockProvider, PaymentProvider } from '../../../providers/ports';
import {
  buildReceiptNumber,
  checkRefund,
  decideWebhook,
  formatAmount,
  maskPaymentMethod,
  statusAfterRefund,
  verifyAmount,
  type PaymentMethodType,
} from '../domain/payment-policy';
import {
  activateAfterPayment,
  applyPaymentFailure,
  checkCancel,
  checkSubscribe,
  expireAfterGrace,
  FREE_ENTITLEMENTS,
  hasActiveEntitlements,
  readEntitlements,
  type Entitlements,
} from '../domain/subscription-policy';
import type {
  BillingNotifier,
  BoostRepository,
  PaymentRecord,
  PaymentRepository,
  PlanRecord,
  PlanRepository,
  SubscriptionRepository,
  WebhookRepository,
} from './ports';

export interface BillingConfig {
  gracePeriodDays: number;
  webhookRetentionDays: number;
  boostDurationHours: number;
  boostMultiplier: number;
  /** Vrai tant que `PAYMENT_PROVIDER=mock` : force `testMode` dans les réponses. */
  simulated: boolean;
}

/**
 * Vue d'un plan telle qu'elle sort de l'API.
 *
 * Le prix part en unité minimale **et** sous forme formatée : le client n'a
 * jamais à connaître l'exposant de la devise, donc jamais l'occasion de se
 * tromper d'un facteur cent sur un franc CFA (ADR-009).
 */
export interface PlanView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  interval: string;
  priceMinor: number;
  currency: string;
  minorUnitExponent: number;
  priceLabel: string;
  entitlements: Entitlements;
}

function toPlanView(plan: PlanRecord): PlanView {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    interval: plan.interval,
    priceMinor: plan.priceMinor,
    currency: plan.currency,
    minorUnitExponent: plan.minorUnitExponent,
    priceLabel: formatAmount(plan.priceMinor, plan.currency),
    entitlements: plan.entitlements,
  };
}

export class ListPlansUseCase {
  constructor(
    private readonly plans: PlanRepository,
    private readonly config: BillingConfig,
  ) {}

  async execute(countryCode: string): Promise<{ items: PlanView[]; testMode: boolean }> {
    const plans = await this.plans.listActiveForCountry(countryCode);
    // `testMode` est émis par le SERVEUR : le client ne peut pas le retirer, et
    // l'interface doit afficher le bandeau tant qu'il vaut `true`.
    return { items: plans.map(toPlanView), testMode: this.config.simulated };
  }
}

export interface EntitlementsView {
  isPremium: boolean;
  entitlements: Entitlements;
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    planCode: string | null;
  } | null;
}

/**
 * Droits ouverts d'un membre.
 *
 * C'est la seule source de vérité consultée par les autres modules : la
 * découverte, la messagerie et les quotas passent par ici plutôt que de relire
 * eux-mêmes une table d'abonnement.
 */
export class GetEntitlementsUseCase {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly plans: PlanRepository,
    private readonly clock: ClockProvider,
  ) {}

  async execute(userId: string): Promise<EntitlementsView> {
    const abonnement = await this.subscriptions.findCurrent(userId);
    if (abonnement === null) {
      return { isPremium: false, entitlements: FREE_ENTITLEMENTS, subscription: null };
    }

    const actif = hasActiveEntitlements(abonnement, this.clock.now());
    const plan = await this.plans.findById(abonnement.planId);

    return {
      isPremium: actif,
      // Un abonnement expiré retombe sur les droits gratuits, jamais sur ceux du
      // plan : la date fait foi, pas la ligne en base.
      entitlements: actif && plan !== null ? plan.entitlements : FREE_ENTITLEMENTS,
      subscription: {
        status: abonnement.status,
        currentPeriodEnd: abonnement.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: abonnement.cancelAtPeriodEnd,
        planCode: plan?.code ?? null,
      },
    };
  }
}

export interface CheckoutView {
  paymentId: string;
  subscriptionId: string | null;
  status: string;
  amountMinor: number;
  currency: string;
  amountLabel: string;
  instruction: Record<string, unknown>;
  testMode: boolean;
}

/**
 * Souscrire à un plan (stories D7-02, D7-03).
 *
 * Le paiement est créé **avant** l'appel au fournisseur, avec la clé
 * d'idempotence du client comme contrainte unique. Sur un réseau qui coupe entre
 * l'appel et la réponse, un second envoi retrouve le même paiement au lieu d'en
 * créer un deuxième — et surtout, au lieu de déclencher un second prélèvement.
 */
export class SubscribeUseCase {
  constructor(
    private readonly plans: PlanRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly payments: PaymentRepository,
    private readonly provider: PaymentProvider,
    private readonly clock: ClockProvider,
    private readonly config: BillingConfig,
  ) {}

  async execute(input: {
    userId: string;
    userCountryCode: string;
    planId: string;
    methodType: PaymentMethodType;
    msisdn: string | null;
    idempotencyKey: string;
  }): Promise<CheckoutView> {
    const existant = await this.payments.findByIdempotencyKey(input.idempotencyKey);
    if (existant !== null) return this.replay(existant);

    const now = this.clock.now();
    const plan = await this.plans.findById(input.planId);
    const courant = await this.subscriptions.findCurrent(input.userId);

    const verdict = checkSubscribe(plan, input.userCountryCode, courant, now);
    if (!verdict.allowed) {
      throw verdict.reason === 'ALREADY_ACTIVE'
        ? BusinessError.conflict(ErrorCode.SUB_ALREADY_ACTIVE)
        : BusinessError.badRequest(ErrorCode.SUB_PLAN_UNAVAILABLE);
    }
    // `checkSubscribe` a déjà écarté le plan nul ; ce contrôle rend l'invariant
    // visible au compilateur plutôt que de l'imposer par un `!`.
    if (plan === null) throw BusinessError.badRequest(ErrorCode.SUB_PLAN_UNAVAILABLE);

    const abonnement =
      courant !== null && courant.planId === plan.id && courant.status === 'PENDING_PAYMENT'
        ? courant
        : await this.subscriptions.create({
            userId: input.userId,
            planId: plan.id,
            isPromotional: false,
            now,
          });

    const masque = maskPaymentMethod(input.methodType, input.msisdn);

    const paiement = await this.payments.create({
      userId: input.userId,
      subscriptionId: abonnement.id,
      planId: plan.id,
      amountMinor: plan.priceMinor,
      currency: plan.currency,
      minorUnitExponent: plan.minorUnitExponent,
      methodType: input.methodType,
      providerName: this.provider.name,
      providerPaymentRef: null,
      methodLabel: masque.label,
      methodLast4: masque.last4,
      idempotencyKey: input.idempotencyKey,
      now,
    });

    const instruction = await this.provider.createCheckout({
      idempotencyKey: input.idempotencyKey,
      amountMinor: plan.priceMinor,
      currency: plan.currency,
      methodType: input.methodType === 'MANUAL' ? 'MOBILE_MONEY' : input.methodType,
      ...(input.msisdn === null ? {} : { msisdn: input.msisdn }),
    });

    if (instruction.providerPaymentRef !== null) {
      await this.payments.transition({
        paymentId: paiement.id,
        expectedFrom: ['PENDING'],
        to: 'PROCESSING',
        providerPaymentRef: instruction.providerPaymentRef,
        now,
      });
    }

    return {
      paymentId: paiement.id,
      subscriptionId: abonnement.id,
      status: instruction.providerPaymentRef === null ? 'PENDING' : 'PROCESSING',
      amountMinor: plan.priceMinor,
      currency: plan.currency,
      amountLabel: formatAmount(plan.priceMinor, plan.currency),
      instruction: instruction.instruction,
      testMode: this.config.simulated,
    };
  }

  /** Ré-émission : on rend le paiement existant, sans jamais en créer un second. */
  private replay(paiement: PaymentRecord): CheckoutView {
    return {
      paymentId: paiement.id,
      subscriptionId: paiement.subscriptionId,
      status: paiement.status,
      amountMinor: paiement.amountMinor,
      currency: paiement.currency,
      amountLabel: formatAmount(paiement.amountMinor, paiement.currency),
      instruction: { replayed: true, testMode: this.config.simulated },
      testMode: this.config.simulated,
    };
  }
}

export class CancelSubscriptionUseCase {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly clock: ClockProvider,
  ) {}

  async execute(
    userId: string,
  ): Promise<{ cancelAtPeriodEnd: true; effectiveUntil: string | null }> {
    const abonnement = await this.subscriptions.findCurrent(userId);
    const verdict = checkCancel(abonnement);

    if (!verdict.allowed || abonnement === null) {
      throw BusinessError.conflict(ErrorCode.SUB_ALREADY_ACTIVE, {
        reason: verdict.allowed ? 'NOT_ACTIVE' : verdict.reason,
      });
    }

    await this.subscriptions.markCancelAtPeriodEnd(abonnement.id, this.clock.now());

    // On n'interrompt pas la période payée : le membre garde ses droits jusqu'à
    // l'échéance, et l'API le lui dit explicitement.
    return {
      cancelAtPeriodEnd: true,
      effectiveUntil: abonnement.currentPeriodEnd?.toISOString() ?? null,
    };
  }
}

export class ListPaymentsUseCase {
  constructor(private readonly payments: PaymentRepository) {}

  async execute(input: { userId: string; limit: number; cursor?: string }): Promise<unknown> {
    const page = await this.payments.listByUser(input);

    return {
      items: page.items.map((paiement) => ({
        id: paiement.id,
        amountMinor: paiement.amountMinor,
        currency: paiement.currency,
        amountLabel: formatAmount(paiement.amountMinor, paiement.currency),
        status: paiement.status,
        // Étiquette masquée uniquement : jamais de numéro complet, jamais de PAN.
        method: paiement.methodLabel,
        receiptNumber: paiement.receiptNumber,
        paidAt: paiement.paidAt?.toISOString() ?? null,
        createdAt: paiement.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }
}

/**
 * Confirmation d'un paiement — cœur de l'idempotence (story D7-04).
 *
 * Appelé par le traitement de webhook et par la régularisation administrative.
 * Deux garde-fous se cumulent :
 *
 *  - le montant confirmé est comparé à celui du **plan**, jamais accepté sur
 *    parole du fournisseur ;
 *  - la transition est conditionnée à l'état courant **en base** : si le paiement
 *    n'est plus `PENDING` ou `PROCESSING`, rien ne se passe. Rejouer dix fois le
 *    même événement crédite donc exactement une fois.
 */
export class ConfirmPaymentUseCase {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly plans: PlanRepository,
    private readonly boosts: BoostRepository,
    private readonly notifier: BillingNotifier,
    private readonly clock: ClockProvider,
    private readonly config: BillingConfig,
  ) {}

  async execute(input: {
    paymentId: string;
    receivedAmountMinor: number;
    receivedCurrency: string;
    providerPaymentRef: string | null;
  }): Promise<{ credited: boolean; reason?: string }> {
    const paiement = await this.payments.findById(input.paymentId);
    if (paiement === null) throw BusinessError.notFound();

    const montant = verifyAmount({
      expectedAmountMinor: paiement.amountMinor,
      expectedCurrency: paiement.currency,
      receivedAmountMinor: input.receivedAmountMinor,
      receivedCurrency: input.receivedCurrency,
    });

    if (!montant.valid) {
      throw montant.reason === 'CURRENCY_UNSUPPORTED'
        ? BusinessError.unprocessable(ErrorCode.PAY_CURRENCY_UNSUPPORTED)
        : BusinessError.unprocessable(ErrorCode.PAY_AMOUNT_MISMATCH, { reason: montant.reason });
    }

    const now = this.clock.now();
    const sequence = await this.payments.nextReceiptSequence(now);

    const applique = await this.payments.transition({
      paymentId: paiement.id,
      expectedFrom: ['PENDING', 'PROCESSING'],
      to: 'SUCCEEDED',
      providerPaymentRef: input.providerPaymentRef ?? paiement.providerPaymentRef,
      receiptNumber: buildReceiptNumber(now, sequence),
      paidAt: now,
      now,
    });

    // La base a tranché : le paiement était déjà confirmé (ou refusé). On ne
    // crédite pas, et ce n'est pas une erreur — c'est le rejeu qui fonctionne.
    if (!applique) return { credited: false, reason: 'ALREADY_SETTLED' };

    await this.grantEntitlements(paiement, now);
    return { credited: true };
  }

  private async grantEntitlements(paiement: PaymentRecord, now: Date): Promise<void> {
    if (paiement.planId === null) return;

    const plan = await this.plans.findById(paiement.planId);
    if (plan === null) return;

    if (plan.interval === 'ONE_TIME') {
      await this.boosts.create({
        userId: paiement.userId,
        paymentId: paiement.id,
        startsAt: now,
        endsAt: new Date(now.getTime() + this.config.boostDurationHours * 3_600_000),
        multiplier: this.config.boostMultiplier,
        grantedByPlan: false,
      });
      return;
    }

    if (paiement.subscriptionId === null) return;

    const abonnement = await this.subscriptions.findById(paiement.subscriptionId);
    const activation = activateAfterPayment(abonnement, plan.interval, now);

    await this.subscriptions.activate({
      subscriptionId: paiement.subscriptionId,
      startedAt: activation.startedAt,
      currentPeriodEnd: activation.currentPeriodEnd,
      now,
    });

    await this.notifier.subscriptionRenewed(paiement.userId, activation.currentPeriodEnd, now);
  }
}

/** Échec de paiement : période de grâce, droits maintenus (story D7-07). */
export class FailPaymentUseCase {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly notifier: BillingNotifier,
    private readonly clock: ClockProvider,
    private readonly config: BillingConfig,
  ) {}

  async execute(input: {
    paymentId: string;
    failureCode: string;
    failureReason: string;
  }): Promise<{ applied: boolean }> {
    const paiement = await this.payments.findById(input.paymentId);
    if (paiement === null) throw BusinessError.notFound();

    const now = this.clock.now();
    const applique = await this.payments.transition({
      paymentId: paiement.id,
      expectedFrom: ['PENDING', 'PROCESSING'],
      to: 'FAILED',
      failureCode: input.failureCode,
      failureReason: input.failureReason,
      now,
    });

    if (!applique) return { applied: false };

    if (paiement.subscriptionId !== null) {
      const grace = applyPaymentFailure(now, this.config.gracePeriodDays);
      await this.subscriptions.markPastDue(paiement.subscriptionId, grace.gracePeriodEnd, now);
      await this.notifier.paymentFailed(paiement.userId, grace.gracePeriodEnd, now);
    }

    return { applied: true };
  }
}

/**
 * Traitement d'un webhook (story D7-04).
 *
 * L'ordre est impératif et testé : **signature d'abord**, persistance ensuite,
 * traitement en dernier. Une signature invalide n'entraîne aucune lecture
 * exploitable du corps et aucune écriture métier.
 */
export class HandleWebhookUseCase {
  constructor(
    private readonly webhooks: WebhookRepository,
    private readonly payments: PaymentRepository,
    private readonly confirm: ConfirmPaymentUseCase,
    private readonly fail: FailPaymentUseCase,
    private readonly provider: PaymentProvider,
    private readonly clock: ClockProvider,
    private readonly config: BillingConfig,
  ) {}

  async execute(input: { rawBody: Buffer; signature: string }): Promise<{ received: true }> {
    const signatureValide = this.provider.verifyWebhookSignature(input.rawBody, input.signature);

    const decision = decideWebhook({ signatureValid: signatureValide, alreadyProcessed: false });
    if (decision.action === 'REJECT') {
      // 401 et rien d'autre : pas de journal métier, pas de lecture du corps.
      // Un corps non authentifié ne décide de rien, pas même de sa propre
      // journalisation nominative.
      throw BusinessError.unauthorized(ErrorCode.PAY_PROVIDER_ERROR);
    }

    const now = this.clock.now();
    const entete = this.provider.parseWebhook(input.rawBody);
    const payload: unknown = safeParse(input.rawBody);

    const { id, isNew } = await this.webhooks.recordIfNew({
      provider: this.provider.name,
      providerEventId: entete.providerEventId,
      eventType: entete.eventType,
      signatureValid: true,
      payload,
      payloadHash: createHash('sha256').update(input.rawBody).digest('hex'),
      purgeAt: new Date(now.getTime() + this.config.webhookRetentionDays * 86_400_000),
      now,
    });

    // Rejeu : la contrainte unique a tranché. On répond 200 sans retraiter —
    // c'est exactement ce que le test E2E n° 14 vérifie dix fois de suite.
    if (!isNew) return { received: true };

    try {
      const paiementId = await this.dispatch(payload, entete.eventType);
      await this.webhooks.markProcessed(id, paiementId, now);
    } catch (erreur) {
      // L'événement reste rejouable depuis le back-office, sans effet de bord :
      // le traitement lui-même est idempotent.
      await this.webhooks.markFailed(id, message(erreur), now);
    }

    return { received: true };
  }

  private async dispatch(payload: unknown, eventType: string): Promise<string | null> {
    const donnees = extractPaymentEvent(payload);
    if (donnees === null) return null;

    const paiement = await this.payments.findByProviderRef(
      this.provider.name,
      donnees.providerPaymentRef,
    );
    if (paiement === null) return null;

    if (eventType.includes('succeeded') || eventType.includes('success')) {
      await this.confirm.execute({
        paymentId: paiement.id,
        receivedAmountMinor: donnees.amountMinor,
        receivedCurrency: donnees.currency,
        providerPaymentRef: donnees.providerPaymentRef,
      });
    } else if (eventType.includes('failed') || eventType.includes('failure')) {
      await this.fail.execute({
        paymentId: paiement.id,
        failureCode: donnees.failureCode ?? 'PROVIDER_FAILURE',
        failureReason: donnees.failureReason ?? 'Échec signalé par le fournisseur',
      });
    }

    return paiement.id;
  }
}

/** Remboursement à quatre yeux (story D7-08). */
export class RefundPaymentUseCase {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly provider: PaymentProvider,
    private readonly clock: ClockProvider,
  ) {}

  async execute(input: {
    paymentId: string;
    amountMinor: number;
    requestedByUserId: string;
    approvedByUserId: string | null;
    reason: string;
  }): Promise<{ refundedMinor: number; status: string }> {
    const paiement = await this.payments.findById(input.paymentId);
    if (paiement === null) throw BusinessError.notFound();

    const verdict = checkRefund({
      paymentStatus: paiement.status,
      paidAmountMinor: paiement.amountMinor,
      alreadyRefundedMinor: paiement.refundedAmountMinor,
      requestedAmountMinor: input.amountMinor,
      requestedByUserId: input.requestedByUserId,
      approvedByUserId: input.approvedByUserId,
      reason: input.reason,
    });

    if (!verdict.allowed) {
      throw verdict.reason === 'SECOND_APPROVER_REQUIRED' ||
        verdict.reason === 'SECOND_APPROVER_MUST_DIFFER'
        ? BusinessError.forbidden(ErrorCode.MOD_SECOND_APPROVER_REQUIRED)
        : BusinessError.unprocessable(ErrorCode.PAY_REFUND_NOT_ALLOWED, { reason: verdict.reason });
    }

    if (paiement.providerPaymentRef !== null) {
      await this.provider.refund(paiement.providerPaymentRef, input.amountMinor);
    }

    const total = paiement.refundedAmountMinor + input.amountMinor;
    const statut = statusAfterRefund(paiement.amountMinor, total);

    await this.payments.recordRefund({
      paymentId: paiement.id,
      totalRefundedMinor: total,
      status: statut,
      byUserId: input.requestedByUserId,
      now: this.clock.now(),
    });

    return { refundedMinor: total, status: statut };
  }
}

/**
 * Clôture des abonnements dont la grâce est écoulée.
 *
 * Conçu pour être appelé par une tâche planifiée ; la tâche elle-même arrive en
 * D8. En attendant, la route d'administration permet de le déclencher à la main —
 * et c'est dit tel quel dans docs/MOCKS.md.
 */
export class ExpireGracePeriodsUseCase {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly clock: ClockProvider,
  ) {}

  async execute(limit = 200): Promise<{ expired: number }> {
    const now = this.clock.now();
    const candidats = await this.subscriptions.listGraceExpired(now, limit);

    let expires = 0;
    for (const abonnement of candidats) {
      if (expireAfterGrace(abonnement, now) === null) continue;
      await this.subscriptions.markExpired(abonnement.id, now);
      expires += 1;
    }

    return { expired: expires };
  }
}

export class ListBoostsUseCase {
  constructor(private readonly boosts: BoostRepository) {}

  async execute(userId: string, limit: number): Promise<unknown> {
    return { items: await this.boosts.listForUser(userId, limit) };
  }
}

/** Droits d'un plan, lus défensivement depuis le JSON stocké. */
export function entitlementsOf(plan: { entitlements: unknown }): Entitlements {
  return readEntitlements(plan.entitlements);
}

function safeParse(rawBody: Buffer): unknown {
  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch {
    return { unparseable: true };
  }
}

function message(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message.slice(0, 500) : 'Erreur inconnue';
}

interface PaymentEventData {
  providerPaymentRef: string;
  amountMinor: number;
  currency: string;
  failureCode: string | null;
  failureReason: string | null;
}

/**
 * Extraction défensive du corps d'un webhook.
 *
 * Aucun champ n'est supposé présent ni bien typé : la charge utile vient d'un
 * tiers. Un corps inattendu produit `null`, et l'événement est journalisé sans
 * effet métier plutôt que de faire échouer le traitement sur un accès indéfini.
 */
export function extractPaymentEvent(payload: unknown): PaymentEventData | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const source = payload as Record<string, unknown>;
  const donnees = (
    typeof source.data === 'object' && source.data !== null ? source.data : source
  ) as Record<string, unknown>;

  const ref = donnees.paymentRef ?? donnees.reference ?? donnees.id;
  const montant = donnees.amountMinor ?? donnees.amount;
  const devise = donnees.currency;

  if (typeof ref !== 'string' || typeof montant !== 'number' || typeof devise !== 'string') {
    return null;
  }

  return {
    providerPaymentRef: ref,
    amountMinor: montant,
    currency: devise,
    failureCode: typeof donnees.failureCode === 'string' ? donnees.failureCode : null,
    failureReason: typeof donnees.failureReason === 'string' ? donnees.failureReason : null,
  };
}
