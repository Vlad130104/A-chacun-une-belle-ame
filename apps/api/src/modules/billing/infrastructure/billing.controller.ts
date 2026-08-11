import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { Auth, Public } from '../../../common/auth/auth.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../../common/auth/auth.guard';
import { ZodBody } from '../../../common/validation/zod.pipe';
import {
  CancelSubscriptionUseCase,
  ConfirmPaymentUseCase,
  ExpireGracePeriodsUseCase,
  GetEntitlementsUseCase,
  HandleWebhookUseCase,
  ListBoostsUseCase,
  ListPaymentsUseCase,
  ListPlansUseCase,
  RefundPaymentUseCase,
  SubscribeUseCase,
  type CheckoutView,
  type EntitlementsView,
} from '../application/billing.use-cases';

const subscribeSchema = z
  .object({
    planId: z.string().min(10).max(40),
    methodType: z.enum(['MOBILE_MONEY', 'CARD']),
    /** Numéro mobile money. Jamais journalisé, jamais stocké en entier. */
    msisdn: z.string().min(8).max(20).nullable().default(null),
  })
  .strict();

const refundSchema = z
  .object({
    amountMinor: z.number().int().positive(),
    approvedByUserId: z.string().min(10).max(40).nullable(),
    reason: z.string().min(1).max(300),
  })
  .strict();

const confirmSchema = z
  .object({
    receivedAmountMinor: z.number().int().nonnegative(),
    receivedCurrency: z.string().length(3),
    providerPaymentRef: z.string().max(120).nullable().default(null),
  })
  .strict();

const limite = (valeur: string | undefined, defaut: number, max: number): number =>
  Math.min(Number(valeur ?? defaut) || defaut, max);

function requireIdempotencyKey(header: string | undefined): string {
  if (header === undefined || header.trim().length < 8 || header.length > 100) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'En-tête Idempotency-Key requis (8 à 100 caractères).',
    });
  }
  return header.trim();
}

/**
 * Abonnements et paiements côté membre (tranche D7).
 *
 * Toutes les réponses portent `testMode` tant que `PAYMENT_PROVIDER=mock`. Le
 * drapeau est produit par le serveur : le client ne peut pas le désactiver.
 */
@ApiTags('billing')
@Controller()
export class BillingController {
  constructor(
    private readonly plans: ListPlansUseCase,
    private readonly entitlements: GetEntitlementsUseCase,
    private readonly subscribe: SubscribeUseCase,
    private readonly cancel: CancelSubscriptionUseCase,
    private readonly paymentHistory: ListPaymentsUseCase,
    private readonly boosts: ListBoostsUseCase,
  ) {}

  @Auth()
  @Get('subscriptions/plans')
  @ApiOperation({ summary: 'Plans ouverts dans mon pays, prix formaté et droits inclus' })
  async listPlans(@Query('country') country?: string): Promise<unknown> {
    // Le pays vient d'un paramètre au MVP ; TODO(D9-04): le reprendre du profil
    // vérifié une fois le référentiel pays branché sur l'identité.
    return this.plans.execute((country ?? 'CM').toUpperCase().slice(0, 2));
  }

  @Auth()
  @Get('subscriptions/me')
  @ApiOperation({ summary: 'Mon abonnement et les droits réellement ouverts' })
  async mySubscription(@CurrentUser() user: AuthenticatedUser): Promise<EntitlementsView> {
    return this.entitlements.execute(user.id);
  }

  @Auth({ level: 'verified', rateLimit: 'billing.subscribe' })
  @Post('subscriptions')
  @ApiOperation({ summary: 'Souscrire — Idempotency-Key obligatoire' })
  async createSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Query('country') country: string | undefined,
    @ZodBody(subscribeSchema) body: unknown,
  ): Promise<CheckoutView> {
    const input = body as z.infer<typeof subscribeSchema>;

    return this.subscribe.execute({
      userId: user.id,
      userCountryCode: (country ?? 'CM').toUpperCase().slice(0, 2),
      planId: input.planId,
      methodType: input.methodType,
      msisdn: input.msisdn,
      idempotencyKey: requireIdempotencyKey(idempotencyKey),
    });
  }

  @Auth({ owner: true })
  @Post('subscriptions/me/cancel')
  @ApiOperation({ summary: 'Annuler le renouvellement — les droits courent jusqu’à l’échéance' })
  async cancelSubscription(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.cancel.execute(user.id);
  }

  @Auth()
  @Get('payments')
  @ApiOperation({ summary: 'Mon historique de paiements' })
  async payments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<unknown> {
    return this.paymentHistory.execute({
      userId: user.id,
      limit: limite(limit, 20, 50),
      cursor,
    });
  }

  @Auth()
  @Get('boosts/me')
  @ApiOperation({ summary: 'Mes boosts actifs et passés' })
  async myBoosts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ): Promise<unknown> {
    return this.boosts.execute(user.id, limite(limit, 20, 50));
  }
}

/**
 * Webhooks de paiement.
 *
 * `@Public()` est ici une nécessité, pas un relâchement : le fournisseur ne
 * possède aucun jeton de session. **L'authentification, c'est la signature**, et
 * elle est vérifiée avant toute lecture exploitable du corps. Cette route figure
 * dans la liste de référence des routes publiques du test d'inventaire, avec
 * cette justification.
 */
@ApiTags('billing-webhooks')
@Controller('payments/webhook')
export class PaymentWebhookController {
  constructor(private readonly handler: HandleWebhookUseCase) {}

  @Public()
  @Post(':provider')
  @ApiOperation({ summary: 'Webhook fournisseur — signature vérifiée avant lecture du corps' })
  async receive(
    @Param('provider') _provider: string,
    @Headers('x-signature') signature: string | undefined,
    @Req() request: Request & { rawBody?: Buffer },
  ): Promise<{ received: true }> {
    // Le corps BRUT est indispensable : une signature porte sur les octets reçus,
    // pas sur le JSON ré-sérialisé, dont l'ordre des clés et les espaces
    // diffèrent. `rawBody` est capté par le middleware d'analyse dans main.ts.
    const rawBody = request.rawBody ?? Buffer.alloc(0);

    return this.handler.execute({ rawBody, signature: signature ?? '' });
  }
}

/**
 * Administration de la facturation.
 *
 * `POST /admin/payments/:id/confirm` existe parce que le fournisseur est encore
 * simulé : sans intégration réelle, aucun webhook n'est authentifiable, donc
 * aucun crédit ne peut arriver de l'extérieur. Cette route est **tracée et à
 * quatre yeux comme les autres opérations sensibles** ; elle disparaîtra ou
 * restera réservée aux régularisations le jour où un prestataire sera branché.
 */
@ApiTags('admin-billing')
@Controller('admin')
export class AdminBillingController {
  constructor(
    private readonly confirm: ConfirmPaymentUseCase,
    private readonly refund: RefundPaymentUseCase,
    private readonly expireGrace: ExpireGracePeriodsUseCase,
  ) {}

  @Auth({ permissions: ['billing.manage'], audit: 'billing.payment.confirmed' })
  @Post('payments/:paymentId/confirm')
  @ApiOperation({ summary: 'Régularisation : confirmer un paiement encaissé hors plateforme' })
  async confirmPayment(
    @Param('paymentId') paymentId: string,
    @ZodBody(confirmSchema) body: unknown,
  ): Promise<unknown> {
    const input = body as z.infer<typeof confirmSchema>;

    return this.confirm.execute({
      paymentId,
      receivedAmountMinor: input.receivedAmountMinor,
      receivedCurrency: input.receivedCurrency,
      providerPaymentRef: input.providerPaymentRef,
    });
  }

  @Auth({ permissions: ['billing.refund'], audit: 'billing.payment.refunded' })
  @Post('payments/:paymentId/refund')
  @ApiOperation({ summary: 'Rembourser — second valideur distinct obligatoire' })
  async refundPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId') paymentId: string,
    @ZodBody(refundSchema) body: unknown,
  ): Promise<unknown> {
    const input = body as z.infer<typeof refundSchema>;

    return this.refund.execute({
      paymentId,
      amountMinor: input.amountMinor,
      requestedByUserId: user.id,
      approvedByUserId: input.approvedByUserId,
      reason: input.reason,
    });
  }

  @Auth({ permissions: ['billing.manage'], audit: 'billing.grace.expired' })
  @Post('subscriptions/expire-grace')
  @ApiOperation({
    summary: 'Clôturer les abonnements dont la grâce est écoulée — automatisé en D8',
  })
  async runExpireGrace(): Promise<unknown> {
    return this.expireGrace.execute();
  }
}
