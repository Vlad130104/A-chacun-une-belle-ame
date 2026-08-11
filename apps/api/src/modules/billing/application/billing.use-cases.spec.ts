import { beforeEach, describe, expect, it } from '@jest/globals';
import { BusinessError } from '../../../common/errors/business.error';
import {
  CancelSubscriptionUseCase,
  ConfirmPaymentUseCase,
  ExpireGracePeriodsUseCase,
  FailPaymentUseCase,
  GetEntitlementsUseCase,
  HandleWebhookUseCase,
  ListPlansUseCase,
  RefundPaymentUseCase,
  SubscribeUseCase,
  extractPaymentEvent,
  type BillingConfig,
} from './billing.use-cases';
import {
  FakeBillingNotifier,
  FakeBoostRepository,
  FakePaymentProvider,
  FakePaymentRepository,
  FakePlanRepository,
  FakeSubscriptionRepository,
  FakeWebhookRepository,
  FixedClock,
} from './test-doubles';

const MAINTENANT = new Date('2026-03-15T12:00:00.000Z');

const config: BillingConfig = {
  gracePeriodDays: 7,
  webhookRetentionDays: 90,
  boostDurationHours: 24,
  boostMultiplier: 2,
  simulated: true,
};

let plans: FakePlanRepository;
let subscriptions: FakeSubscriptionRepository;
let payments: FakePaymentRepository;
let webhooks: FakeWebhookRepository;
let boosts: FakeBoostRepository;
let notifier: FakeBillingNotifier;
let provider: FakePaymentProvider;
let clock: FixedClock;

beforeEach(() => {
  plans = new FakePlanRepository();
  subscriptions = new FakeSubscriptionRepository();
  payments = new FakePaymentRepository();
  webhooks = new FakeWebhookRepository();
  boosts = new FakeBoostRepository();
  notifier = new FakeBillingNotifier();
  provider = new FakePaymentProvider();
  clock = new FixedClock(MAINTENANT);
});

const souscrire = () =>
  new SubscribeUseCase(plans, subscriptions, payments, provider, clock, config);

const confirmer = () =>
  new ConfirmPaymentUseCase(payments, subscriptions, plans, boosts, notifier, clock, config);

const echouer = () => new FailPaymentUseCase(payments, subscriptions, notifier, clock, config);

const traiterWebhook = () =>
  new HandleWebhookUseCase(webhooks, payments, confirmer(), echouer(), provider, clock, config);

const attendreErreur = async (promesse: Promise<unknown>): Promise<BusinessError> => {
  try {
    await promesse;
  } catch (erreur) {
    if (erreur instanceof BusinessError) return erreur;
    throw erreur;
  }
  throw new Error('Une BusinessError était attendue.');
};

const souscription = (planId: string) => ({
  userId: 'membre-1',
  userCountryCode: 'CM',
  planId,
  methodType: 'MOBILE_MONEY' as const,
  msisdn: '237699001122',
  idempotencyKey: 'cle-souscription-1',
});

describe('catalogue de plans', () => {
  it('marque testMode tant que le fournisseur est simulé', async () => {
    // Le drapeau est émis par le SERVEUR : le client ne peut pas le retirer.
    plans.seed();
    const resultat = await new ListPlansUseCase(plans, config).execute('CM');
    expect(resultat.testMode).toBe(true);
  });

  it('formate le prix sans décimale en franc CFA', async () => {
    plans.seed({ priceMinor: 5000, currency: 'XAF' });
    const resultat = await new ListPlansUseCase(plans, config).execute('CM');
    expect(resultat.items[0]?.priceLabel).not.toContain(',');
    expect(resultat.items[0]?.minorUnitExponent).toBe(0);
  });

  it('n’expose que les plans ouverts dans le pays du membre', async () => {
    plans.seed({ countryCode: 'CM', code: 'cm' });
    plans.seed({ countryCode: 'BJ', code: 'bj' });
    plans.seed({ countryCode: null, code: 'monde' });

    const resultat = await new ListPlansUseCase(plans, config).execute('CM');
    expect(resultat.items.map((plan) => plan.code).sort()).toEqual(['cm', 'monde']);
  });
});

describe('souscription', () => {
  it('crée un abonnement en attente et un paiement', async () => {
    const plan = plans.seed();
    const resultat = await souscrire().execute(souscription(plan.id));

    expect(payments.payments).toHaveLength(1);
    expect(subscriptions.subscriptions[0]?.status).toBe('PENDING_PAYMENT');
    expect(resultat.testMode).toBe(true);
  });

  it('ne conserve du moyen de paiement que les quatre derniers chiffres', async () => {
    const plan = plans.seed();
    await souscrire().execute(souscription(plan.id));

    const etiquette = payments.payments[0]?.methodLabel ?? '';
    expect(etiquette).toContain('1122');
    expect(etiquette).not.toContain('237699');
  });

  it('ne crée qu’un seul paiement quand le client rejoue sa requête', async () => {
    // Réseau instable : la requête part deux fois. Un second prélèvement serait
    // un incident financier direct.
    const plan = plans.seed();
    const cas = souscrire();

    const premier = await cas.execute(souscription(plan.id));
    const second = await cas.execute(souscription(plan.id));

    expect(second.paymentId).toBe(premier.paymentId);
    expect(payments.payments).toHaveLength(1);
  });

  it('refuse une seconde souscription tant qu’un abonnement est actif', async () => {
    const plan = plans.seed();
    subscriptions.seed({ userId: 'membre-1', planId: plan.id });

    const erreur = await attendreErreur(souscrire().execute(souscription(plan.id)));
    expect(erreur.code).toBe('SUB_ALREADY_ACTIVE');
  });

  it('refuse un plan d’un autre pays', async () => {
    const plan = plans.seed({ countryCode: 'BJ' });
    const erreur = await attendreErreur(souscrire().execute(souscription(plan.id)));
    expect(erreur.code).toBe('SUB_PLAN_UNAVAILABLE');
  });

  it('facture le prix du PLAN, jamais un montant fourni par le client', async () => {
    const plan = plans.seed({ priceMinor: 5000 });
    await souscrire().execute(souscription(plan.id));
    expect(payments.payments[0]?.amountMinor).toBe(5000);
  });
});

describe('confirmation de paiement — idempotence', () => {
  const preparer = async () => {
    const plan = plans.seed();
    await souscrire().execute(souscription(plan.id));
    const paiement = payments.payments[0];
    if (paiement === undefined) throw new Error('paiement attendu');
    return { plan, paiement };
  };

  it('crédite l’abonnement et émet un reçu', async () => {
    const { paiement } = await preparer();

    const resultat = await confirmer().execute({
      paymentId: paiement.id,
      receivedAmountMinor: 5000,
      receivedCurrency: 'XAF',
      providerPaymentRef: paiement.providerPaymentRef,
    });

    expect(resultat.credited).toBe(true);
    expect(subscriptions.subscriptions[0]?.status).toBe('ACTIVE');
    expect(payments.payments[0]?.receiptNumber).toMatch(/^ACUBA-202603-\d{6}$/);
  });

  it('ne crédite QU’UNE FOIS même rejoué dix fois', async () => {
    // Le test E2E n° 14 du plan de tests, exprimé au niveau du cas d'usage.
    const { paiement } = await preparer();
    const cas = confirmer();

    const resultats = [];
    for (let essai = 0; essai < 10; essai += 1) {
      resultats.push(
        await cas.execute({
          paymentId: paiement.id,
          receivedAmountMinor: 5000,
          receivedCurrency: 'XAF',
          providerPaymentRef: paiement.providerPaymentRef,
        }),
      );
    }

    expect(resultats.filter((resultat) => resultat.credited)).toHaveLength(1);
    expect(notifier.renewals).toHaveLength(1);
    // Et surtout : la période n'a pas été prolongée dix fois.
    expect(subscriptions.subscriptions[0]?.currentPeriodEnd?.toISOString()).toBe(
      '2026-04-15T12:00:00.000Z',
    );
  });

  it('refuse un montant qui ne correspond pas au plan', async () => {
    // Sans ce contrôle, un webhook falsifié créditerait pour un montant arbitraire.
    const { paiement } = await preparer();

    const erreur = await attendreErreur(
      confirmer().execute({
        paymentId: paiement.id,
        receivedAmountMinor: 50,
        receivedCurrency: 'XAF',
        providerPaymentRef: null,
      }),
    );

    expect(erreur.code).toBe('PAY_AMOUNT_MISMATCH');
    expect(subscriptions.subscriptions[0]?.status).toBe('PENDING_PAYMENT');
  });

  it('refuse une devise différente à montant égal', async () => {
    const { paiement } = await preparer();

    const erreur = await attendreErreur(
      confirmer().execute({
        paymentId: paiement.id,
        receivedAmountMinor: 5000,
        receivedCurrency: 'EUR',
        providerPaymentRef: null,
      }),
    );

    expect(erreur.code).toBe('PAY_AMOUNT_MISMATCH');
  });

  it('ne ressuscite pas un paiement déjà échoué', async () => {
    const { paiement } = await preparer();
    await echouer().execute({
      paymentId: paiement.id,
      failureCode: 'INSUFFICIENT_FUNDS',
      failureReason: 'Solde insuffisant',
    });

    const resultat = await confirmer().execute({
      paymentId: paiement.id,
      receivedAmountMinor: 5000,
      receivedCurrency: 'XAF',
      providerPaymentRef: null,
    });

    expect(resultat).toEqual({ credited: false, reason: 'ALREADY_SETTLED' });
    expect(payments.payments[0]?.status).toBe('FAILED');
  });

  it('crée un boost plutôt qu’un abonnement pour un achat unique', async () => {
    const boost = plans.seed({ code: 'boost_single', interval: 'ONE_TIME', priceMinor: 1000 });
    const paiement = await payments.create({
      userId: 'membre-1',
      subscriptionId: null,
      planId: boost.id,
      amountMinor: 1000,
      currency: 'XAF',
      minorUnitExponent: 0,
      methodType: 'MOBILE_MONEY',
      providerName: provider.name,
      providerPaymentRef: 'ref-boost',
      methodLabel: null,
      methodLast4: null,
      idempotencyKey: 'cle-boost',
      now: MAINTENANT,
    });

    await confirmer().execute({
      paymentId: paiement.id,
      receivedAmountMinor: 1000,
      receivedCurrency: 'XAF',
      providerPaymentRef: 'ref-boost',
    });

    expect(boosts.boosts).toHaveLength(1);
  });
});

describe('échec de paiement et période de grâce', () => {
  it('maintient les droits pendant la grâce', async () => {
    const plan = plans.seed();
    await souscrire().execute(souscription(plan.id));
    const paiement = payments.payments[0];
    if (paiement === undefined) throw new Error('paiement attendu');

    subscriptions.subscriptions[0]!.status = 'ACTIVE';
    subscriptions.subscriptions[0]!.currentPeriodEnd = new Date('2026-03-16T12:00:00.000Z');

    await echouer().execute({
      paymentId: paiement.id,
      failureCode: 'INSUFFICIENT_FUNDS',
      failureReason: 'Solde insuffisant',
    });

    expect(subscriptions.subscriptions[0]?.status).toBe('PAST_DUE');
    expect(subscriptions.subscriptions[0]?.gracePeriodEnd?.toISOString()).toBe(
      '2026-03-22T12:00:00.000Z',
    );

    // Les droits restent ouverts : un prélèvement raté n'est pas une fraude.
    const droits = await new GetEntitlementsUseCase(subscriptions, plans, clock).execute(
      'membre-1',
    );
    expect(droits.isPremium).toBe(true);
  });

  it('ferme les droits une fois la grâce écoulée', async () => {
    const plan = plans.seed();
    subscriptions.seed({
      userId: 'membre-1',
      planId: plan.id,
      status: 'PAST_DUE',
      gracePeriodEnd: new Date('2026-03-10T12:00:00.000Z'),
    });

    const resultat = await new ExpireGracePeriodsUseCase(subscriptions, clock).execute();

    expect(resultat.expired).toBe(1);
    expect(subscriptions.subscriptions[0]?.status).toBe('EXPIRED');
  });

  it('n’expire pas un abonnement encore en grâce', async () => {
    const plan = plans.seed();
    subscriptions.seed({
      userId: 'membre-1',
      planId: plan.id,
      status: 'PAST_DUE',
      gracePeriodEnd: new Date('2026-03-20T12:00:00.000Z'),
    });

    expect(await new ExpireGracePeriodsUseCase(subscriptions, clock).execute()).toEqual({
      expired: 0,
    });
  });
});

describe('droits ouverts', () => {
  it('retombe sur le gratuit sans abonnement', async () => {
    const droits = await new GetEntitlementsUseCase(subscriptions, plans, clock).execute('inconnu');
    expect(droits.isPremium).toBe(false);
    expect(droits.entitlements.seeInterestSenders).toBe(false);
  });

  it('retombe sur le gratuit quand la période est échue, malgré la ligne en base', async () => {
    // La date fait foi, jamais le statut stocké seul.
    const plan = plans.seed();
    subscriptions.seed({
      userId: 'membre-1',
      planId: plan.id,
      status: 'ACTIVE',
      currentPeriodEnd: new Date('2026-01-01T12:00:00.000Z'),
    });

    const droits = await new GetEntitlementsUseCase(subscriptions, plans, clock).execute(
      'membre-1',
    );
    expect(droits.isPremium).toBe(false);
    expect(droits.entitlements.seeInterestSenders).toBe(false);
  });

  it('ouvre les droits du plan pendant la période payée', async () => {
    const plan = plans.seed();
    subscriptions.seed({ userId: 'membre-1', planId: plan.id });

    const droits = await new GetEntitlementsUseCase(subscriptions, plans, clock).execute(
      'membre-1',
    );
    expect(droits.isPremium).toBe(true);
    expect(droits.entitlements.seeInterestSenders).toBe(true);
  });
});

describe('annulation', () => {
  it('laisse les droits jusqu’à l’échéance', async () => {
    const plan = plans.seed();
    subscriptions.seed({ userId: 'membre-1', planId: plan.id });

    const resultat = await new CancelSubscriptionUseCase(subscriptions, clock).execute('membre-1');

    expect(resultat.cancelAtPeriodEnd).toBe(true);
    expect(resultat.effectiveUntil).toBe('2026-04-01T12:00:00.000Z');

    const droits = await new GetEntitlementsUseCase(subscriptions, plans, clock).execute(
      'membre-1',
    );
    expect(droits.isPremium).toBe(true);
  });
});

describe('webhook', () => {
  const corps = (id: string, type: string, ref: string, montant = 5000): Buffer =>
    Buffer.from(
      JSON.stringify({
        id,
        type,
        data: { paymentRef: ref, amountMinor: montant, currency: 'XAF' },
      }),
    );

  const preparerPaiement = async () => {
    const plan = plans.seed();
    await souscrire().execute(souscription(plan.id));
    const paiement = payments.payments[0];
    if (paiement === undefined) throw new Error('paiement attendu');
    return paiement;
  };

  it('rejette une signature invalide sans rien écrire', async () => {
    provider.signatureValid = false;

    const erreur = await attendreErreur(
      traiterWebhook().execute({
        rawBody: corps('evt-1', 'payment.succeeded', 'x'),
        signature: 'x',
      }),
    );

    expect(erreur.httpStatus).toBe(401);
    // Aucune trace métier : un corps non authentifié ne décide de rien.
    expect(webhooks.events).toHaveLength(0);
  });

  it('crédite l’abonnement sur un événement signé', async () => {
    const paiement = await preparerPaiement();
    const ref = paiement.providerPaymentRef ?? '';

    await traiterWebhook().execute({
      rawBody: corps('evt-1', 'payment.succeeded', ref),
      signature: 'signature-valide',
    });

    expect(payments.payments[0]?.status).toBe('SUCCEEDED');
    expect(subscriptions.subscriptions[0]?.status).toBe('ACTIVE');
  });

  it('rejoué DIX FOIS, produit exactement un crédit', async () => {
    // Test E2E n° 14 du plan de tests (docs/09-plan-de-tests.md).
    const paiement = await preparerPaiement();
    const ref = paiement.providerPaymentRef ?? '';
    const cas = traiterWebhook();

    for (let essai = 0; essai < 10; essai += 1) {
      await cas.execute({
        rawBody: corps('evt-identique', 'payment.succeeded', ref),
        signature: 'signature-valide',
      });
    }

    expect(webhooks.events).toHaveLength(1);
    expect(notifier.renewals).toHaveLength(1);
    expect(subscriptions.subscriptions[0]?.currentPeriodEnd?.toISOString()).toBe(
      '2026-04-15T12:00:00.000Z',
    );
  });

  it('bascule en grâce sur un événement d’échec', async () => {
    const paiement = await preparerPaiement();
    const ref = paiement.providerPaymentRef ?? '';

    await traiterWebhook().execute({
      rawBody: corps('evt-2', 'payment.failed', ref),
      signature: 'signature-valide',
    });

    expect(payments.payments[0]?.status).toBe('FAILED');
    expect(subscriptions.subscriptions[0]?.status).toBe('PAST_DUE');
  });

  it('journalise sans effet métier un événement dont le paiement est inconnu', async () => {
    await traiterWebhook().execute({
      rawBody: corps('evt-3', 'payment.succeeded', 'reference-inconnue'),
      signature: 'signature-valide',
    });

    expect(webhooks.events[0]?.status).toBe('PROCESSED');
    expect(payments.payments).toHaveLength(0);
  });

  it('n’échoue pas sur un corps inattendu', async () => {
    // La charge utile vient d'un tiers : aucun champ n'est supposé présent.
    await expect(
      traiterWebhook().execute({
        rawBody: Buffer.from(JSON.stringify({ id: 'evt-4', type: 'inconnu' })),
        signature: 'signature-valide',
      }),
    ).resolves.toEqual({ received: true });
  });
});

describe('extraction défensive du corps d’un webhook', () => {
  it('lit un corps conforme', () => {
    expect(
      extractPaymentEvent({ data: { paymentRef: 'r1', amountMinor: 5000, currency: 'XAF' } }),
    ).toMatchObject({ providerPaymentRef: 'r1', amountMinor: 5000, currency: 'XAF' });
  });

  it('accepte une charge utile à plat', () => {
    expect(extractPaymentEvent({ reference: 'r2', amount: 1000, currency: 'XOF' })).toMatchObject({
      providerPaymentRef: 'r2',
      amountMinor: 1000,
    });
  });

  it.each([
    [null],
    ['texte'],
    [{}],
    [{ data: { paymentRef: 'r' } }],
    [{ amountMinor: 'beaucoup' }],
  ])('renvoie null sur un corps inexploitable : %p', (corps) => {
    expect(extractPaymentEvent(corps)).toBeNull();
  });
});

describe('remboursement', () => {
  const rembourser = () => new RefundPaymentUseCase(payments, provider, clock);

  const preparerPaye = async () => {
    const plan = plans.seed();
    await souscrire().execute(souscription(plan.id));
    const paiement = payments.payments[0];
    if (paiement === undefined) throw new Error('paiement attendu');
    await confirmer().execute({
      paymentId: paiement.id,
      receivedAmountMinor: 5000,
      receivedCurrency: 'XAF',
      providerPaymentRef: paiement.providerPaymentRef,
    });
    return paiement;
  };

  it('rembourse en totalité avec un second valideur', async () => {
    const paiement = await preparerPaye();

    const resultat = await rembourser().execute({
      paymentId: paiement.id,
      amountMinor: 5000,
      requestedByUserId: 'admin-1',
      approvedByUserId: 'admin-2',
      reason: 'Double prélèvement',
    });

    expect(resultat).toEqual({ refundedMinor: 5000, status: 'REFUNDED' });
    expect(provider.refunds).toHaveLength(1);
  });

  it('refuse un remboursement sans second valideur, sans appeler le fournisseur', async () => {
    const paiement = await preparerPaye();

    const erreur = await attendreErreur(
      rembourser().execute({
        paymentId: paiement.id,
        amountMinor: 5000,
        requestedByUserId: 'admin-1',
        approvedByUserId: null,
        reason: 'Erreur',
      }),
    );

    expect(erreur.code).toBe('MOD_SECOND_APPROVER_REQUIRED');
    expect(provider.refunds).toHaveLength(0);
  });

  it('refuse de rembourser deux fois le même montant', async () => {
    const paiement = await preparerPaye();
    const cas = rembourser();
    const demande = {
      paymentId: paiement.id,
      amountMinor: 5000,
      requestedByUserId: 'admin-1',
      approvedByUserId: 'admin-2',
      reason: 'Double prélèvement',
    };

    await cas.execute(demande);
    const erreur = await attendreErreur(cas.execute(demande));

    expect(erreur.code).toBe('PAY_REFUND_NOT_ALLOWED');
  });

  it('enchaîne deux remboursements partiels jusqu’au total', async () => {
    const paiement = await preparerPaye();
    const cas = rembourser();

    const premier = await cas.execute({
      paymentId: paiement.id,
      amountMinor: 2000,
      requestedByUserId: 'admin-1',
      approvedByUserId: 'admin-2',
      reason: 'Geste commercial',
    });
    expect(premier.status).toBe('PARTIALLY_REFUNDED');

    const second = await cas.execute({
      paymentId: paiement.id,
      amountMinor: 3000,
      requestedByUserId: 'admin-1',
      approvedByUserId: 'admin-2',
      reason: 'Solde',
    });
    expect(second).toEqual({ refundedMinor: 5000, status: 'REFUNDED' });
  });
});
