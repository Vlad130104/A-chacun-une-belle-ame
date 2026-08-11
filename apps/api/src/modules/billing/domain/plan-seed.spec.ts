import { describe, expect, it } from '@jest/globals';
import { PLANS } from '../../../../../../prisma/seed/referentiels';
import { FREE_ENTITLEMENTS, readEntitlements } from './subscription-policy';

/**
 * Correspondance entre les plans du seed et le type `Entitlements`.
 *
 * La lecture des droits est volontairement défensive : une clé inconnue retombe
 * sur la valeur gratuite. C'est le bon comportement face à une donnée corrompue,
 * mais cela rend une **faute de frappe silencieuse** : le plan se vend, se paie,
 * et n'ouvre aucun droit. Ce test transforme ce silence en échec de CI.
 */
describe('plans du seed et droits déclarés', () => {
  const CLES_ATTENDUES = Object.keys(FREE_ENTITLEMENTS).sort();

  it('n’utilise dans le seed que des clés reconnues par le domaine', () => {
    const inconnues = new Set<string>();

    for (const plan of PLANS) {
      for (const cle of Object.keys(plan.entitlements)) {
        if (!CLES_ATTENDUES.includes(cle)) inconnues.add(`${plan.code}.${cle}`);
      }
    }

    expect([...inconnues]).toEqual([]);
  });

  it('ouvre réellement des droits sur chaque plan Premium', () => {
    // Le test qui compte : un plan payant dont la lecture rend exactement les
    // droits gratuits est un plan qui ne sert à rien, et le membre l'a payé.
    const premium = PLANS.filter((plan) => plan.interval !== 'ONE_TIME');
    expect(premium.length).toBeGreaterThanOrEqual(3);

    for (const plan of premium) {
      const droits = readEntitlements(plan.entitlements);
      expect({
        code: plan.code,
        identique: JSON.stringify(droits) === JSON.stringify(FREE_ENTITLEMENTS),
      }).toEqual({ code: plan.code, identique: false });
    }
  });

  it('donne accès aux expéditeurs d’intérêts sur les plans Premium', () => {
    for (const plan of PLANS.filter((candidat) => candidat.code.startsWith('premium_'))) {
      expect({
        code: plan.code,
        voit: readEntitlements(plan.entitlements).seeInterestSenders,
      }).toEqual({ code: plan.code, voit: true });
    }
  });

  it('n’attache aucun droit d’abonnement à un boost', () => {
    // Un boost est un achat unique : lui attacher des droits les rendrait
    // permanents, puisque rien n'en surveille l'échéance côté abonnement.
    const boost = PLANS.find((plan) => plan.interval === 'ONE_TIME');
    expect(boost).toBeDefined();
    expect(readEntitlements(boost?.entitlements)).toEqual(FREE_ENTITLEMENTS);
  });

  it('libelle chaque prix en unité minimale entière', () => {
    for (const plan of PLANS) {
      expect({ code: plan.code, entier: Number.isInteger(plan.priceMinor) }).toEqual({
        code: plan.code,
        entier: true,
      });
      expect(plan.priceMinor).toBeGreaterThan(0);
    }
  });

  it('n’utilise que des devises sans sous-unité sur les marchés visés', () => {
    // XAF et XOF ont un exposant de 0 (ADR-009). Un prix de 5 000 F CFA se
    // stocke `5000` ; le même nombre lu en centimes facturerait cent fois trop.
    for (const plan of PLANS) {
      expect(['XAF', 'XOF']).toContain(plan.currency);
    }
  });
});
