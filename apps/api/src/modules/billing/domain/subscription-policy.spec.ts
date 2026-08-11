import { describe, expect, it } from '@jest/globals';
import {
  activateAfterPayment,
  addPeriod,
  applyPaymentFailure,
  checkCancel,
  checkSubscribe,
  expireAfterGrace,
  FREE_ENTITLEMENTS,
  hasActiveEntitlements,
  monthsFor,
  readEntitlements,
  type PlanAvailability,
  type SubscriptionState,
} from './subscription-policy';

const MAINTENANT = new Date('2026-03-15T12:00:00.000Z');

const etat = (surcharge: Partial<SubscriptionState> = {}): SubscriptionState => ({
  status: 'ACTIVE',
  currentPeriodEnd: new Date('2026-04-15T12:00:00.000Z'),
  cancelAtPeriodEnd: false,
  gracePeriodEnd: null,
  ...surcharge,
});

const plan = (surcharge: Partial<PlanAvailability> = {}): PlanAvailability => ({
  active: true,
  countryCode: null,
  interval: 'MONTHLY',
  ...surcharge,
});

describe('durée d’une période', () => {
  it.each([
    ['MONTHLY', 1],
    ['QUARTERLY', 3],
    ['YEARLY', 12],
    ['ONE_TIME', 0],
  ])('associe %s à %i mois', (intervalle, mois) => {
    expect(monthsFor(intervalle as PlanAvailability['interval'])).toBe(mois);
  });

  it('ajoute un mois sans déborder sur le mois suivant', () => {
    // Le piège : 31 janvier + 1 mois donnerait le 3 mars avec un simple
    // setUTCMonth. Un abonné du 31 doit être facturé le 28 février.
    expect(addPeriod(new Date('2026-01-31T12:00:00.000Z'), 'MONTHLY').toISOString()).toBe(
      '2026-02-28T12:00:00.000Z',
    );
  });

  it('gère l’année bissextile', () => {
    expect(addPeriod(new Date('2028-01-31T12:00:00.000Z'), 'MONTHLY').toISOString()).toBe(
      '2028-02-29T12:00:00.000Z',
    );
  });

  it('franchit l’année sur un abonnement annuel', () => {
    expect(addPeriod(new Date('2026-03-15T12:00:00.000Z'), 'YEARLY').toISOString()).toBe(
      '2027-03-15T12:00:00.000Z',
    );
  });

  it('ne déplace rien pour un achat unique', () => {
    const depart = new Date('2026-03-15T12:00:00.000Z');
    expect(addPeriod(depart, 'ONE_TIME').toISOString()).toBe(depart.toISOString());
  });
});

describe('droits ouverts', () => {
  it('ouvre les droits d’un abonnement actif non échu', () => {
    expect(hasActiveEntitlements(etat(), MAINTENANT)).toBe(true);
  });

  it('ferme les droits d’un abonnement échu', () => {
    expect(
      hasActiveEntitlements(
        etat({ currentPeriodEnd: new Date('2026-03-01T12:00:00.000Z') }),
        MAINTENANT,
      ),
    ).toBe(false);
  });

  it('laisse les droits ouverts après une annulation, jusqu’à l’échéance', () => {
    // Le membre a payé sa période : il la garde. L'annulation porte sur le
    // renouvellement, pas sur la période en cours.
    expect(
      hasActiveEntitlements(etat({ status: 'CANCELLED', cancelAtPeriodEnd: true }), MAINTENANT),
    ).toBe(true);
  });

  it('laisse les droits ouverts pendant la période de grâce', () => {
    // Un prélèvement échoue le plus souvent pour un solde momentanément vide.
    const enGrace = etat({
      status: 'PAST_DUE',
      gracePeriodEnd: new Date('2026-03-20T12:00:00.000Z'),
    });
    expect(hasActiveEntitlements(enGrace, MAINTENANT)).toBe(true);
  });

  it('ferme les droits à la fin de la grâce', () => {
    const graceFinie = etat({
      status: 'PAST_DUE',
      gracePeriodEnd: new Date('2026-03-10T12:00:00.000Z'),
    });
    expect(hasActiveEntitlements(graceFinie, MAINTENANT)).toBe(false);
  });

  it.each([['PENDING_PAYMENT'], ['EXPIRED'], ['REFUNDED']])(
    'n’ouvre aucun droit sur un abonnement %s',
    (statut) => {
      expect(
        hasActiveEntitlements(etat({ status: statut as SubscriptionState['status'] }), MAINTENANT),
      ).toBe(false);
    },
  );
});

describe('souscription', () => {
  it('accepte un plan actif pour un membre sans abonnement', () => {
    expect(checkSubscribe(plan(), 'CM', null, MAINTENANT)).toEqual({ allowed: true });
  });

  it('refuse un plan inactif', () => {
    expect(checkSubscribe(plan({ active: false }), 'CM', null, MAINTENANT)).toEqual({
      allowed: false,
      reason: 'PLAN_UNAVAILABLE',
    });
  });

  it('refuse un plan ciblé sur un autre pays', () => {
    // Les prix et les devises diffèrent d'un pays à l'autre.
    expect(checkSubscribe(plan({ countryCode: 'BJ' }), 'CM', null, MAINTENANT)).toEqual({
      allowed: false,
      reason: 'PLAN_UNAVAILABLE',
    });
  });

  it('accepte un plan ciblé sur le pays du membre', () => {
    expect(checkSubscribe(plan({ countryCode: 'CM' }), 'CM', null, MAINTENANT)).toEqual({
      allowed: true,
    });
  });

  it('refuse de souscrire un boost comme un abonnement', () => {
    expect(checkSubscribe(plan({ interval: 'ONE_TIME' }), 'CM', null, MAINTENANT)).toEqual({
      allowed: false,
      reason: 'PLAN_UNAVAILABLE',
    });
  });

  it('refuse une seconde souscription tant qu’un abonnement est actif', () => {
    expect(checkSubscribe(plan(), 'CM', etat(), MAINTENANT)).toEqual({
      allowed: false,
      reason: 'ALREADY_ACTIVE',
    });
  });

  it('accepte une nouvelle souscription après expiration', () => {
    expect(checkSubscribe(plan(), 'CM', etat({ status: 'EXPIRED' }), MAINTENANT)).toEqual({
      allowed: true,
    });
  });

  it('refuse un plan inexistant', () => {
    expect(checkSubscribe(null, 'CM', null, MAINTENANT)).toEqual({
      allowed: false,
      reason: 'PLAN_UNAVAILABLE',
    });
  });
});

describe('activation après paiement', () => {
  it('ouvre une période depuis maintenant pour un premier abonnement', () => {
    const resultat = activateAfterPayment(null, 'MONTHLY', MAINTENANT);
    expect(resultat.status).toBe('ACTIVE');
    expect(resultat.currentPeriodEnd.toISOString()).toBe('2026-04-15T12:00:00.000Z');
  });

  it('empile la nouvelle période sur le reliquat en cas de renouvellement anticipé', () => {
    // Un membre qui renouvelle en avance ne perd pas ses jours restants.
    const resultat = activateAfterPayment(etat(), 'MONTHLY', MAINTENANT);
    expect(resultat.currentPeriodEnd.toISOString()).toBe('2026-05-15T12:00:00.000Z');
  });

  it('repart de maintenant si l’ancienne période est déjà échue', () => {
    const echu = etat({ currentPeriodEnd: new Date('2026-01-15T12:00:00.000Z') });
    const resultat = activateAfterPayment(echu, 'MONTHLY', MAINTENANT);
    expect(resultat.currentPeriodEnd.toISOString()).toBe('2026-04-15T12:00:00.000Z');
  });
});

describe('échec de paiement et grâce', () => {
  it('bascule en PAST_DUE avec une échéance de grâce', () => {
    const resultat = applyPaymentFailure(MAINTENANT, 7);
    expect(resultat.status).toBe('PAST_DUE');
    expect(resultat.gracePeriodEnd.toISOString()).toBe('2026-03-22T12:00:00.000Z');
  });

  it('expire à la fin de la grâce', () => {
    const graceFinie = etat({
      status: 'PAST_DUE',
      gracePeriodEnd: new Date('2026-03-10T12:00:00.000Z'),
    });
    expect(expireAfterGrace(graceFinie, MAINTENANT)).toBe('EXPIRED');
  });

  it('n’expire pas pendant la grâce', () => {
    const enGrace = etat({
      status: 'PAST_DUE',
      gracePeriodEnd: new Date('2026-03-20T12:00:00.000Z'),
    });
    expect(expireAfterGrace(enGrace, MAINTENANT)).toBeNull();
  });

  it('ne touche pas à un abonnement qui n’est pas en défaut', () => {
    expect(expireAfterGrace(etat(), MAINTENANT)).toBeNull();
  });
});

describe('annulation', () => {
  it('accepte l’annulation d’un abonnement actif', () => {
    expect(checkCancel(etat())).toEqual({ allowed: true });
  });

  it('accepte l’annulation d’un abonnement en défaut', () => {
    expect(checkCancel(etat({ status: 'PAST_DUE' }))).toEqual({ allowed: true });
  });

  it('refuse une seconde annulation', () => {
    expect(checkCancel(etat({ cancelAtPeriodEnd: true }))).toEqual({
      allowed: false,
      reason: 'ALREADY_CANCELLED',
    });
  });

  it('refuse d’annuler ce qui n’existe pas', () => {
    expect(checkCancel(null)).toEqual({ allowed: false, reason: 'NOT_ACTIVE' });
  });
});

describe('droits d’un plan — aucune porte de sécurité ne s’achète', () => {
  it('ne comporte AUCUN droit touchant à la sécurité', () => {
    // Principe non négociable : la vérification d'identité, la modération, le
    // consentement et le blocage ne sont pas des options payantes. Ce test
    // échoue si quelqu'un ajoute un droit de ce genre au type.
    const cles = Object.keys(FREE_ENTITLEMENTS).map((cle) => cle.toLowerCase());
    const interdits = ['verification', 'kyc', 'moderation', 'consent', 'block', 'report', 'ban'];

    for (const interdit of interdits) {
      expect(cles.filter((cle) => cle.includes(interdit))).toEqual([]);
    }
  });

  it('lit les droits déclarés par un plan', () => {
    expect(
      readEntitlements({
        dailySuggestions: 30,
        dailyLikes: 50,
        seeInterestSenders: true,
        advancedFilters: true,
        includedBoosts: 1,
        readReceipts: true,
      }),
    ).toEqual({
      dailySuggestions: 30,
      dailyLikes: 50,
      seeInterestSenders: true,
      advancedFilters: true,
      includedBoosts: 1,
      readReceipts: true,
    });
  });

  it('retombe sur les droits gratuits si la donnée est absente', () => {
    expect(readEntitlements(null)).toEqual(FREE_ENTITLEMENTS);
    expect(readEntitlements('nawak')).toEqual(FREE_ENTITLEMENTS);
  });

  it('retombe sur le gratuit, jamais sur le permissif, quand un champ est corrompu', () => {
    // Une donnée abîmée ne doit pas offrir un accès payant, et surtout pas
    // illimité.
    const droits = readEntitlements({
      dailySuggestions: 'illimité',
      dailyLikes: -1,
      seeInterestSenders: 'oui',
      includedBoosts: 2.5,
    });

    expect(droits.dailySuggestions).toBe(FREE_ENTITLEMENTS.dailySuggestions);
    expect(droits.dailyLikes).toBe(FREE_ENTITLEMENTS.dailyLikes);
    expect(droits.seeInterestSenders).toBe(false);
    expect(droits.includedBoosts).toBe(FREE_ENTITLEMENTS.includedBoosts);
  });
});
