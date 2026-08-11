import { describe, expect, it } from '@jest/globals';
import {
  buildReceiptNumber,
  canTransition,
  checkRefund,
  decideWebhook,
  formatAmount,
  isTerminal,
  maskPaymentMethod,
  statusAfterRefund,
  verifyAmount,
  type PaymentStatus,
  type RefundRequest,
} from './payment-policy';

const remboursement = (surcharge: Partial<RefundRequest> = {}): RefundRequest => ({
  paymentStatus: 'SUCCEEDED',
  paidAmountMinor: 5000,
  alreadyRefundedMinor: 0,
  requestedAmountMinor: 5000,
  requestedByUserId: 'admin-1',
  approvedByUserId: 'admin-2',
  reason: 'Double prélèvement constaté',
  ...surcharge,
});

describe('transitions d’un paiement', () => {
  it('mène un paiement du départ au succès', () => {
    expect(canTransition('PENDING', 'PROCESSING')).toBe(true);
    expect(canTransition('PROCESSING', 'SUCCEEDED')).toBe(true);
  });

  it('n’autorise JAMAIS un paiement échoué à devenir réussi', () => {
    // Le cas qui compte : un webhook tardif ou rejoué ne doit pas ressusciter
    // un paiement déjà refusé.
    expect(canTransition('FAILED', 'SUCCEEDED')).toBe(false);
    expect(canTransition('CANCELLED', 'SUCCEEDED')).toBe(false);
    expect(canTransition('REFUNDED', 'SUCCEEDED')).toBe(false);
  });

  it('n’autorise pas un paiement réussi à repasser en attente', () => {
    expect(canTransition('SUCCEEDED', 'PENDING')).toBe(false);
    expect(canTransition('SUCCEEDED', 'PROCESSING')).toBe(false);
    expect(canTransition('SUCCEEDED', 'FAILED')).toBe(false);
  });

  it('n’ouvre depuis un succès que le remboursement', () => {
    expect(canTransition('SUCCEEDED', 'REFUNDED')).toBe(true);
    expect(canTransition('SUCCEEDED', 'PARTIALLY_REFUNDED')).toBe(true);
  });

  it.each([['FAILED'], ['CANCELLED'], ['REFUNDED']])('rend %s terminal', (statut) => {
    expect(isTerminal(statut as PaymentStatus)).toBe(true);
  });

  it('laisse un remboursement partiel évoluer', () => {
    expect(isTerminal('PARTIALLY_REFUNDED')).toBe(false);
    expect(canTransition('PARTIALLY_REFUNDED', 'REFUNDED')).toBe(true);
  });
});

describe('vérification du montant', () => {
  it('accepte un montant et une devise identiques', () => {
    expect(
      verifyAmount({
        expectedAmountMinor: 5000,
        expectedCurrency: 'XAF',
        receivedAmountMinor: 5000,
        receivedCurrency: 'XAF',
      }),
    ).toEqual({ valid: true });
  });

  it('refuse un montant différent de celui du plan', () => {
    // C'est le PLAN qui fait foi, jamais la réponse du fournisseur : sans ce
    // contrôle, un webhook falsifié créditerait pour un montant arbitraire.
    expect(
      verifyAmount({
        expectedAmountMinor: 5000,
        expectedCurrency: 'XAF',
        receivedAmountMinor: 50,
        receivedCurrency: 'XAF',
      }),
    ).toEqual({ valid: false, reason: 'AMOUNT_MISMATCH' });
  });

  it('refuse une devise différente même à montant égal', () => {
    // 5000 XAF et 5000 EUR ne sont pas le même montant, de très loin.
    expect(
      verifyAmount({
        expectedAmountMinor: 5000,
        expectedCurrency: 'XAF',
        receivedAmountMinor: 5000,
        receivedCurrency: 'EUR',
      }),
    ).toEqual({ valid: false, reason: 'CURRENCY_MISMATCH' });
  });

  it('refuse une devise non prise en charge', () => {
    expect(
      verifyAmount({
        expectedAmountMinor: 5000,
        expectedCurrency: 'XAF',
        receivedAmountMinor: 5000,
        receivedCurrency: 'GBP',
      }),
    ).toEqual({ valid: false, reason: 'CURRENCY_UNSUPPORTED' });
  });
});

describe('formatage des montants — le piège du franc CFA', () => {
  /**
   * Le séparateur de milliers produit par `toLocaleString('fr-FR')` est une
   * espace insécable étroite dont le point de code varie selon la version d'ICU.
   * On normalise donc les espaces : le test porte sur les chiffres et les
   * décimales, pas sur un détail d'implémentation d'ICU.
   */
  const normaliser = (valeur: string): string => valeur.replace(/\s/gu, ' ');

  it('n’ajoute AUCUNE décimale au franc CFA', () => {
    // XAF et XOF ont un exposant de 0 (ADR-009). 5 000 F CFA se stocke `5000`.
    // Quelqu'un qui raisonne en centimes facturerait cent fois trop.
    expect(normaliser(formatAmount(5000, 'XAF'))).toBe('5 000 XAF');
    expect(normaliser(formatAmount(5000, 'XOF'))).toBe('5 000 XOF');
    expect(formatAmount(5000, 'XAF')).not.toContain(',');
  });

  it('applique deux décimales à l’euro', () => {
    expect(normaliser(formatAmount(5000, 'EUR'))).toBe('50,00 EUR');
  });

  it('ne confond jamais les deux échelles', () => {
    // Le même entier ne vaut pas la même chose selon la devise : c'est
    // exactement l'erreur que l'exposant explicite empêche.
    expect(formatAmount(1000, 'XAF')).not.toBe(formatAmount(1000, 'EUR'));
  });
});

describe('remboursement — quatre yeux', () => {
  it('accepte un remboursement total validé par une seconde personne', () => {
    expect(checkRefund(remboursement())).toEqual({ allowed: true });
  });

  it('refuse sans second valideur', () => {
    expect(checkRefund(remboursement({ approvedByUserId: null }))).toEqual({
      allowed: false,
      reason: 'SECOND_APPROVER_REQUIRED',
    });
  });

  it('refuse un remboursement auto-validé', () => {
    expect(checkRefund(remboursement({ approvedByUserId: 'admin-1' }))).toEqual({
      allowed: false,
      reason: 'SECOND_APPROVER_MUST_DIFFER',
    });
  });

  it('refuse de rembourser un paiement jamais réussi', () => {
    expect(checkRefund(remboursement({ paymentStatus: 'FAILED' }))).toEqual({
      allowed: false,
      reason: 'NOT_SUCCEEDED',
    });
  });

  it('refuse de rembourser plus que le reste dû', () => {
    const verdict = checkRefund(
      remboursement({ alreadyRefundedMinor: 3000, requestedAmountMinor: 3000 }),
    );
    expect(verdict).toEqual({ allowed: false, reason: 'AMOUNT_EXCEEDS_REMAINDER' });
  });

  it('accepte exactement le reste dû', () => {
    const verdict = checkRefund(
      remboursement({ alreadyRefundedMinor: 3000, requestedAmountMinor: 2000 }),
    );
    expect(verdict).toEqual({ allowed: true });
  });

  it('refuse un montant nul ou négatif', () => {
    expect(checkRefund(remboursement({ requestedAmountMinor: 0 }))).toMatchObject({
      allowed: false,
    });
    expect(checkRefund(remboursement({ requestedAmountMinor: -100 }))).toMatchObject({
      allowed: false,
    });
  });

  it('refuse un motif vide', () => {
    expect(checkRefund(remboursement({ reason: '  ' }))).toEqual({
      allowed: false,
      reason: 'REASON_REQUIRED',
    });
  });

  it('distingue remboursement total et partiel', () => {
    expect(statusAfterRefund(5000, 5000)).toBe('REFUNDED');
    expect(statusAfterRefund(5000, 2000)).toBe('PARTIALLY_REFUNDED');
    expect(statusAfterRefund(5000, 6000)).toBe('REFUNDED');
  });
});

describe('webhook entrant', () => {
  it('rejette une signature invalide sans rien traiter', () => {
    expect(decideWebhook({ signatureValid: false, alreadyProcessed: false })).toEqual({
      action: 'REJECT',
      reason: 'INVALID_SIGNATURE',
    });
  });

  it('rejette une signature invalide même sur un événement inconnu', () => {
    expect(decideWebhook({ signatureValid: false, alreadyProcessed: true })).toMatchObject({
      action: 'REJECT',
    });
  });

  it('ignore un événement déjà traité', () => {
    // Rejouer dix fois le même événement doit produire un seul crédit (ADR-010).
    expect(decideWebhook({ signatureValid: true, alreadyProcessed: true })).toEqual({
      action: 'IGNORE_DUPLICATE',
    });
  });

  it('traite un événement neuf et signé', () => {
    expect(decideWebhook({ signatureValid: true, alreadyProcessed: false })).toEqual({
      action: 'PROCESS',
    });
  });
});

describe('numéro de reçu', () => {
  it('compose un numéro lisible au téléphone', () => {
    expect(buildReceiptNumber(new Date('2026-03-15T10:00:00.000Z'), 42)).toBe(
      'ACUBA-202603-000042',
    );
  });

  it('complète le mois sur deux chiffres', () => {
    expect(buildReceiptNumber(new Date('2026-01-05T10:00:00.000Z'), 1)).toBe('ACUBA-202601-000001');
  });
});

describe('masquage du moyen de paiement', () => {
  it('ne conserve que les quatre derniers chiffres', () => {
    // Le numéro complet n'est JAMAIS stocké.
    const masque = maskPaymentMethod('MOBILE_MONEY', '237699001122');
    expect(masque).toEqual({ label: 'Mobile money ••••1122', last4: '1122' });
    expect(masque.label).not.toContain('237699');
  });

  it('n’invente rien quand l’identifiant manque', () => {
    expect(maskPaymentMethod('CARD', null)).toEqual({ label: 'Carte', last4: null });
  });

  it('refuse de masquer un identifiant trop court plutôt que d’en révéler la totalité', () => {
    expect(maskPaymentMethod('CARD', '12')).toEqual({ label: 'Carte', last4: null });
  });
});
