import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  CLOCK_PROVIDER,
  PAYMENT_PROVIDER,
  type ClockProvider,
  type PaymentProvider,
} from '../../providers/ports';
import {
  BILLING_NOTIFIER,
  BOOST_REPOSITORY,
  PAYMENT_REPOSITORY,
  PLAN_REPOSITORY,
  SUBSCRIPTION_REPOSITORY,
  WEBHOOK_REPOSITORY,
  type BillingNotifier,
  type BoostRepository,
  type PaymentRepository,
  type PlanRepository,
  type SubscriptionRepository,
  type WebhookRepository,
} from './application/ports';
import {
  CancelSubscriptionUseCase,
  ConfirmPaymentUseCase,
  ExpireGracePeriodsUseCase,
  FailPaymentUseCase,
  GetEntitlementsUseCase,
  HandleWebhookUseCase,
  ListBoostsUseCase,
  ListPaymentsUseCase,
  ListPlansUseCase,
  RefundPaymentUseCase,
  SubscribeUseCase,
  type BillingConfig,
} from './application/billing.use-cases';
import {
  AdminBillingController,
  BillingController,
  PaymentWebhookController,
} from './infrastructure/billing.controller';
import { PrismaBillingNotifier } from './infrastructure/billing.notifier';
import {
  PrismaBoostRepository,
  PrismaPaymentRepository,
  PrismaPlanRepository,
  PrismaSubscriptionRepository,
  PrismaWebhookRepository,
} from './infrastructure/prisma.repositories';

/**
 * `simulated` est lu depuis la configuration et **non depuis le fournisseur**,
 * pour que le drapeau `testMode` reste vrai même si quelqu'un branchait une
 * implémentation qui se déclarerait à tort comme réelle.
 */
const buildConfig = (config: ConfigService<Env, true>): BillingConfig => ({
  gracePeriodDays: config.get('PAYMENT_GRACE_PERIOD_DAYS', { infer: true }),
  webhookRetentionDays: config.get('WEBHOOK_RETENTION_DAYS', { infer: true }),
  boostDurationHours: config.get('BOOST_DURATION_HOURS', { infer: true }),
  boostMultiplier: config.get('BOOST_MULTIPLIER', { infer: true }),
  simulated: config.get('PAYMENT_PROVIDER', { infer: true }) === 'mock',
});

/**
 * Module de facturation (tranche D7).
 *
 * Propriétaire des tables `SubscriptionPlan`, `Subscription`, `Payment`,
 * `PaymentWebhookEvent` et `Boost`.
 *
 * `GET_ENTITLEMENTS` est exporté : c'est la source unique des droits ouverts.
 * La découverte et la messagerie la consultent au lieu de relire elles-mêmes une
 * table d'abonnement — sinon la règle « un droit expire à une date » serait
 * réimplémentée à trois endroits, donc fausse à deux.
 */
@Module({
  controllers: [BillingController, PaymentWebhookController, AdminBillingController],
  providers: [
    {
      provide: PLAN_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaPlanRepository(prisma),
    },
    {
      provide: SUBSCRIPTION_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaSubscriptionRepository(prisma),
    },
    {
      provide: PAYMENT_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaPaymentRepository(prisma),
    },
    {
      provide: WEBHOOK_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaWebhookRepository(prisma),
    },
    {
      provide: BOOST_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaBoostRepository(prisma),
    },
    {
      provide: BILLING_NOTIFIER,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaBillingNotifier(prisma),
    },

    {
      provide: ListPlansUseCase,
      inject: [PLAN_REPOSITORY, ConfigService],
      useFactory: (plans: PlanRepository, config: ConfigService<Env, true>) =>
        new ListPlansUseCase(plans, buildConfig(config)),
    },
    {
      provide: GetEntitlementsUseCase,
      inject: [SUBSCRIPTION_REPOSITORY, PLAN_REPOSITORY, CLOCK_PROVIDER],
      useFactory: (
        subscriptions: SubscriptionRepository,
        plans: PlanRepository,
        clock: ClockProvider,
      ) => new GetEntitlementsUseCase(subscriptions, plans, clock),
    },
    {
      provide: SubscribeUseCase,
      inject: [
        PLAN_REPOSITORY,
        SUBSCRIPTION_REPOSITORY,
        PAYMENT_REPOSITORY,
        PAYMENT_PROVIDER,
        CLOCK_PROVIDER,
        ConfigService,
      ],
      useFactory: (
        plans: PlanRepository,
        subscriptions: SubscriptionRepository,
        payments: PaymentRepository,
        provider: PaymentProvider,
        clock: ClockProvider,
        config: ConfigService<Env, true>,
      ) =>
        new SubscribeUseCase(plans, subscriptions, payments, provider, clock, buildConfig(config)),
    },
    {
      provide: CancelSubscriptionUseCase,
      inject: [SUBSCRIPTION_REPOSITORY, CLOCK_PROVIDER],
      useFactory: (subscriptions: SubscriptionRepository, clock: ClockProvider) =>
        new CancelSubscriptionUseCase(subscriptions, clock),
    },
    {
      provide: ListPaymentsUseCase,
      inject: [PAYMENT_REPOSITORY],
      useFactory: (payments: PaymentRepository) => new ListPaymentsUseCase(payments),
    },
    {
      provide: ListBoostsUseCase,
      inject: [BOOST_REPOSITORY],
      useFactory: (boosts: BoostRepository) => new ListBoostsUseCase(boosts),
    },
    {
      provide: ConfirmPaymentUseCase,
      inject: [
        PAYMENT_REPOSITORY,
        SUBSCRIPTION_REPOSITORY,
        PLAN_REPOSITORY,
        BOOST_REPOSITORY,
        BILLING_NOTIFIER,
        CLOCK_PROVIDER,
        ConfigService,
      ],
      useFactory: (
        payments: PaymentRepository,
        subscriptions: SubscriptionRepository,
        plans: PlanRepository,
        boosts: BoostRepository,
        notifier: BillingNotifier,
        clock: ClockProvider,
        config: ConfigService<Env, true>,
      ) =>
        new ConfirmPaymentUseCase(
          payments,
          subscriptions,
          plans,
          boosts,
          notifier,
          clock,
          buildConfig(config),
        ),
    },
    {
      provide: FailPaymentUseCase,
      inject: [
        PAYMENT_REPOSITORY,
        SUBSCRIPTION_REPOSITORY,
        BILLING_NOTIFIER,
        CLOCK_PROVIDER,
        ConfigService,
      ],
      useFactory: (
        payments: PaymentRepository,
        subscriptions: SubscriptionRepository,
        notifier: BillingNotifier,
        clock: ClockProvider,
        config: ConfigService<Env, true>,
      ) => new FailPaymentUseCase(payments, subscriptions, notifier, clock, buildConfig(config)),
    },
    {
      provide: HandleWebhookUseCase,
      inject: [
        WEBHOOK_REPOSITORY,
        PAYMENT_REPOSITORY,
        ConfirmPaymentUseCase,
        FailPaymentUseCase,
        PAYMENT_PROVIDER,
        CLOCK_PROVIDER,
        ConfigService,
      ],
      useFactory: (
        webhooks: WebhookRepository,
        payments: PaymentRepository,
        confirm: ConfirmPaymentUseCase,
        fail: FailPaymentUseCase,
        provider: PaymentProvider,
        clock: ClockProvider,
        config: ConfigService<Env, true>,
      ) =>
        new HandleWebhookUseCase(
          webhooks,
          payments,
          confirm,
          fail,
          provider,
          clock,
          buildConfig(config),
        ),
    },
    {
      provide: RefundPaymentUseCase,
      inject: [PAYMENT_REPOSITORY, PAYMENT_PROVIDER, CLOCK_PROVIDER],
      useFactory: (payments: PaymentRepository, provider: PaymentProvider, clock: ClockProvider) =>
        new RefundPaymentUseCase(payments, provider, clock),
    },
    {
      provide: ExpireGracePeriodsUseCase,
      inject: [SUBSCRIPTION_REPOSITORY, CLOCK_PROVIDER],
      useFactory: (subscriptions: SubscriptionRepository, clock: ClockProvider) =>
        new ExpireGracePeriodsUseCase(subscriptions, clock),
    },
  ],
  exports: [GetEntitlementsUseCase],
})
export class BillingModule {}
