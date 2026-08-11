import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isSupportedCurrency, type SupportedCurrency } from '@acuba/contracts';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { buildPage, decodeCursor } from '../../../common/pagination/cursor';
import { readEntitlements } from '../domain/subscription-policy';
import type {
  BoostRepository,
  PaymentRecord,
  PaymentRepository,
  PlanRecord,
  PlanRepository,
  SubscriptionRecord,
  SubscriptionRepository,
  WebhookRepository,
} from '../application/ports';

const UNIQUE_VIOLATION = 'P2002';

/**
 * Devise stockée → devise typée.
 *
 * Une devise inconnue en base est une anomalie de données, pas un cas courant :
 * on échoue bruyamment plutôt que de facturer dans une devise dont on ignore
 * l'exposant (ADR-009).
 */
function toCurrency(value: string): SupportedCurrency {
  if (!isSupportedCurrency(value)) {
    throw new Error(`Devise non prise en charge en base : ${value}.`);
  }
  return value;
}

@Injectable()
export class PrismaPlanRepository implements PlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveForCountry(countryCode: string): Promise<PlanRecord[]> {
    const rows = await this.prisma.subscriptionPlan.findMany({
      // Plans mondiaux et plans ciblés sur ce pays : jamais ceux d'un autre pays,
      // dont le prix et la devise diffèrent.
      where: { active: true, OR: [{ countryCode: null }, { countryCode }] },
      orderBy: [{ sortOrder: 'asc' }, { priceMinor: 'asc' }],
    });

    return rows.map(toPlan);
  }

  async findById(planId: string): Promise<PlanRecord | null> {
    const row = await this.prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    return row === null ? null : toPlan(row);
  }

  async findByCode(code: string): Promise<PlanRecord | null> {
    const row = await this.prisma.subscriptionPlan.findUnique({ where: { code } });
    return row === null ? null : toPlan(row);
  }
}

function toPlan(row: {
  id: string;
  code: string;
  name: string;
  description: string | null;
  interval: string;
  priceMinor: number;
  currency: string;
  minorUnitExponent: number;
  countryCode: string | null;
  entitlements: Prisma.JsonValue;
  active: boolean;
  sortOrder: number;
}): PlanRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    interval: row.interval as PlanRecord['interval'],
    priceMinor: row.priceMinor,
    currency: toCurrency(row.currency),
    minorUnitExponent: row.minorUnitExponent,
    countryCode: row.countryCode,
    // Lecture défensive : un JSON abîmé retombe sur les droits gratuits, jamais
    // sur un accès permissif.
    entitlements: readEntitlements(row.entitlements),
    active: row.active,
    sortOrder: row.sortOrder,
  };
}

const SUBSCRIPTION_SELECT = {
  id: true,
  userId: true,
  planId: true,
  status: true,
  startedAt: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  gracePeriodEnd: true,
  isPromotional: true,
} as const;

@Injectable()
export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCurrent(userId: string): Promise<SubscriptionRecord | null> {
    const row = await this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: SUBSCRIPTION_SELECT,
    });
    return row;
  }

  async findById(subscriptionId: string): Promise<SubscriptionRecord | null> {
    return this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: SUBSCRIPTION_SELECT,
    });
  }

  async create(input: {
    userId: string;
    planId: string;
    isPromotional: boolean;
    now: Date;
  }): Promise<SubscriptionRecord> {
    return this.prisma.subscription.create({
      data: {
        userId: input.userId,
        planId: input.planId,
        status: 'PENDING_PAYMENT',
        isPromotional: input.isPromotional,
        createdAt: input.now,
      },
      select: SUBSCRIPTION_SELECT,
    });
  }

  async activate(input: {
    subscriptionId: string;
    startedAt: Date;
    currentPeriodEnd: Date;
    now: Date;
  }): Promise<void> {
    await this.prisma.subscription.update({
      where: { id: input.subscriptionId },
      data: {
        status: 'ACTIVE',
        startedAt: input.startedAt,
        currentPeriodEnd: input.currentPeriodEnd,
        gracePeriodEnd: null,
        updatedAt: input.now,
      },
    });
  }

  async markPastDue(subscriptionId: string, gracePeriodEnd: Date, now: Date): Promise<void> {
    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'PAST_DUE', gracePeriodEnd, updatedAt: now },
    });
  }

  async markCancelAtPeriodEnd(subscriptionId: string, now: Date): Promise<void> {
    // Drapeau, pas coupure : la période payée reste ouverte jusqu'à son terme.
    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'CANCELLED', cancelAtPeriodEnd: true, cancelledAt: now, updatedAt: now },
    });
  }

  async markExpired(subscriptionId: string, now: Date): Promise<void> {
    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'EXPIRED', updatedAt: now },
    });
  }

  async listGraceExpired(now: Date, limit: number): Promise<SubscriptionRecord[]> {
    return this.prisma.subscription.findMany({
      where: { status: 'PAST_DUE', gracePeriodEnd: { lte: now } },
      orderBy: { gracePeriodEnd: 'asc' },
      take: limit,
      select: SUBSCRIPTION_SELECT,
    });
  }
}

const PAYMENT_SELECT = {
  id: true,
  userId: true,
  subscriptionId: true,
  planId: true,
  amountMinor: true,
  currency: true,
  status: true,
  methodType: true,
  providerName: true,
  providerPaymentRef: true,
  methodLabel: true,
  idempotencyKey: true,
  refundedAmountMinor: true,
  receiptNumber: true,
  paidAt: true,
  createdAt: true,
} as const;

type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

function toPayment(row: PaymentRow): PaymentRecord {
  return { ...row, currency: toCurrency(row.currency) };
}

@Injectable()
export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByIdempotencyKey(key: string): Promise<PaymentRecord | null> {
    const row = await this.prisma.payment.findUnique({
      where: { idempotencyKey: key },
      select: PAYMENT_SELECT,
    });
    return row === null ? null : toPayment(row);
  }

  async findById(paymentId: string): Promise<PaymentRecord | null> {
    const row = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: PAYMENT_SELECT,
    });
    return row === null ? null : toPayment(row);
  }

  async findByProviderRef(providerName: string, ref: string): Promise<PaymentRecord | null> {
    const row = await this.prisma.payment.findFirst({
      where: { providerName, providerPaymentRef: ref },
      select: PAYMENT_SELECT,
    });
    return row === null ? null : toPayment(row);
  }

  async create(input: Parameters<PaymentRepository['create']>[0]): Promise<PaymentRecord> {
    try {
      const row = await this.prisma.payment.create({
        data: {
          userId: input.userId,
          subscriptionId: input.subscriptionId,
          planId: input.planId,
          amountMinor: input.amountMinor,
          currency: input.currency,
          minorUnitExponent: input.minorUnitExponent,
          status: 'PENDING',
          methodType: input.methodType,
          providerName: input.providerName,
          providerPaymentRef: input.providerPaymentRef,
          methodLabel: input.methodLabel,
          methodLast4: input.methodLast4,
          idempotencyKey: input.idempotencyKey,
          createdAt: input.now,
        },
        select: PAYMENT_SELECT,
      });
      return toPayment(row);
    } catch (erreur) {
      // Course entre deux requêtes portant la même clé : la contrainte unique a
      // tranché, on rend le paiement gagnant plutôt que d'en créer un second.
      if (
        erreur instanceof Prisma.PrismaClientKnownRequestError &&
        erreur.code === UNIQUE_VIOLATION
      ) {
        const existant = await this.findByIdempotencyKey(input.idempotencyKey);
        if (existant !== null) return existant;
      }
      throw erreur;
    }
  }

  /**
   * Transition conditionnée à l'état courant, en une seule requête.
   *
   * `updateMany` avec `status: { in: expectedFrom }` fait porter la garantie
   * d'idempotence à la base : deux webhooks concurrents ne peuvent pas créditer
   * deux fois, quelle que soit leur arrivée.
   */
  async transition(input: Parameters<PaymentRepository['transition']>[0]): Promise<boolean> {
    const resultat = await this.prisma.payment.updateMany({
      where: { id: input.paymentId, status: { in: input.expectedFrom } },
      data: {
        status: input.to,
        ...(input.providerPaymentRef === undefined
          ? {}
          : { providerPaymentRef: input.providerPaymentRef }),
        ...(input.receiptNumber === undefined ? {} : { receiptNumber: input.receiptNumber }),
        ...(input.failureCode === undefined ? {} : { failureCode: input.failureCode }),
        ...(input.failureReason === undefined ? {} : { failureReason: input.failureReason }),
        ...(input.paidAt === undefined ? {} : { paidAt: input.paidAt }),
        updatedAt: input.now,
      },
    });

    return resultat.count > 0;
  }

  async recordRefund(input: Parameters<PaymentRepository['recordRefund']>[0]): Promise<void> {
    await this.prisma.payment.update({
      where: { id: input.paymentId },
      data: {
        refundedAmountMinor: input.totalRefundedMinor,
        status: input.status,
        refundedAt: input.now,
        refundedByUserId: input.byUserId,
        updatedAt: input.now,
      },
    });
  }

  async listByUser(input: {
    userId: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: PaymentRecord[]; nextCursor: string | null; hasMore: boolean }> {
    const curseur = input.cursor === undefined ? null : decodeCursor(input.cursor);

    const rows = await this.prisma.payment.findMany({
      where: {
        userId: input.userId,
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
      select: PAYMENT_SELECT,
    });

    const page = buildPage(rows, input.limit);
    return {
      items: page.items.map(toPayment),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  /**
   * Séquence mensuelle des reçus.
   *
   * Comptage sur le mois en cours : le numéro reste court à lire au téléphone.
   * Une collision reste possible sous forte concurrence ; la contrainte unique
   * sur `receiptNumber` la rejetterait, et la transition renverrait `false`
   * plutôt que d'attribuer deux fois le même numéro.
   */
  async nextReceiptSequence(now: Date): Promise<number> {
    const debutDuMois = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const compte = await this.prisma.payment.count({
      where: { receiptNumber: { not: null }, paidAt: { gte: debutDuMois } },
    });

    return compte + 1;
  }
}

@Injectable()
export class PrismaWebhookRepository implements WebhookRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * L'unicité `(provider, providerEventId)` est l'arbitre du rejeu (ADR-010).
   *
   * On tente l'insertion et on interprète le refus, plutôt que de lire d'abord :
   * une lecture préalable laisserait une fenêtre entre le contrôle et l'écriture,
   * dans laquelle deux livraisons simultanées passeraient toutes les deux.
   */
  async recordIfNew(
    input: Parameters<WebhookRepository['recordIfNew']>[0],
  ): Promise<{ id: string; isNew: boolean }> {
    try {
      const cree = await this.prisma.paymentWebhookEvent.create({
        data: {
          provider: input.provider,
          providerEventId: input.providerEventId,
          eventType: input.eventType,
          signatureValid: input.signatureValid,
          payload: input.payload as Prisma.InputJsonValue,
          payloadHash: input.payloadHash,
          status: 'RECEIVED',
          purgeAt: input.purgeAt,
          createdAt: input.now,
        },
        select: { id: true },
      });
      return { id: cree.id, isNew: true };
    } catch (erreur) {
      if (
        erreur instanceof Prisma.PrismaClientKnownRequestError &&
        erreur.code === UNIQUE_VIOLATION
      ) {
        const existant = await this.prisma.paymentWebhookEvent.findUnique({
          where: {
            provider_providerEventId: {
              provider: input.provider,
              providerEventId: input.providerEventId,
            },
          },
          select: { id: true },
        });

        if (existant !== null) {
          await this.prisma.paymentWebhookEvent.update({
            where: { id: existant.id },
            data: { status: 'IGNORED_DUPLICATE', attemptCount: { increment: 1 } },
          });
          return { id: existant.id, isNew: false };
        }
      }
      throw erreur;
    }
  }

  async markProcessed(id: string, relatedPaymentId: string | null, now: Date): Promise<void> {
    await this.prisma.paymentWebhookEvent.update({
      where: { id },
      data: {
        status: 'PROCESSED',
        processedAt: now,
        relatedPaymentId,
        attemptCount: { increment: 1 },
      },
    });
  }

  async markFailed(id: string, error: string, now: Date): Promise<void> {
    await this.prisma.paymentWebhookEvent.update({
      where: { id },
      data: {
        status: 'FAILED',
        lastError: error.slice(0, 500),
        processedAt: now,
        attemptCount: { increment: 1 },
      },
    });
  }
}

@Injectable()
export class PrismaBoostRepository implements BoostRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Parameters<BoostRepository['create']>[0]): Promise<{ id: string }> {
    return this.prisma.boost.create({
      data: {
        userId: input.userId,
        paymentId: input.paymentId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        multiplier: input.multiplier,
        grantedByPlan: input.grantedByPlan,
      },
      select: { id: true },
    });
  }

  async listForUser(
    userId: string,
    limit: number,
  ): Promise<
    { id: string; startsAt: Date; endsAt: Date; multiplier: number; grantedByPlan: boolean }[]
  > {
    return this.prisma.boost.findMany({
      where: { userId },
      orderBy: { endsAt: 'desc' },
      take: limit,
      select: { id: true, startsAt: true, endsAt: true, multiplier: true, grantedByPlan: true },
    });
  }
}
