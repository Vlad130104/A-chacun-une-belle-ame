import { describe, expect, it } from '@jest/globals';
import {
  checkInvite,
  checkPromoEligibility,
  computeFunnel,
  FUNNEL_STEPS,
  promoPeriodEnd,
  type CampaignState,
  type InviteState,
  type PromoEligibility,
} from './campaign-policy';

const MAINTENANT = new Date('2026-03-15T12:00:00.000Z');

const invitation = (surcharge: Partial<InviteState> = {}): InviteState => ({
  maxUses: 100,
  useCount: 0,
  expiresAt: null,
  revokedAt: null,
  ...surcharge,
});

const campagne = (surcharge: Partial<CampaignState> = {}): CampaignState => ({
  active: true,
  startsAt: new Date('2026-03-01T00:00:00.000Z'),
  endsAt: new Date('2026-06-01T00:00:00.000Z'),
  promoFreeDays: 30,
  ...surcharge,
});

const eligibilite = (surcharge: Partial<PromoEligibility> = {}): PromoEligibility => ({
  phoneAlreadyBenefited: false,
  documentAlreadyBenefited: false,
  accountStatus: 'ACTIVE',
  ...surcharge,
});

describe('validité d’un code d’invitation', () => {
  it('accepte un code valide d’une campagne en cours', () => {
    expect(checkInvite(invitation(), campagne(), MAINTENANT)).toEqual({ valid: true });
  });

  it('accepte un code de parrainage individuel, sans campagne', () => {
    expect(checkInvite(invitation({ maxUses: 5 }), null, MAINTENANT)).toEqual({ valid: true });
  });

  it('renvoie le MÊME motif pour toutes les causes d’invalidité', () => {
    // Distinguer « expiré » de « saturé » de « inexistant » révélerait
    // l'existence et l'état d'une campagne à qui essaie des codes au hasard.
    const causes = [
      checkInvite(null, null, MAINTENANT),
      checkInvite(invitation({ revokedAt: MAINTENANT }), null, MAINTENANT),
      checkInvite(
        invitation({ expiresAt: new Date('2026-03-01T00:00:00.000Z') }),
        null,
        MAINTENANT,
      ),
      checkInvite(invitation({ maxUses: 10, useCount: 10 }), null, MAINTENANT),
    ];

    for (const verdict of causes) {
      expect(verdict).toEqual({ valid: false, reason: 'INVALID' });
    }
  });

  it('accepte la dernière utilisation disponible', () => {
    expect(checkInvite(invitation({ maxUses: 10, useCount: 9 }), null, MAINTENANT)).toEqual({
      valid: true,
    });
  });

  it('refuse une campagne pas encore commencée', () => {
    const future = campagne({ startsAt: new Date('2026-04-01T00:00:00.000Z') });
    expect(checkInvite(invitation(), future, MAINTENANT)).toEqual({
      valid: false,
      reason: 'CAMPAIGN_INACTIVE',
    });
  });

  it('refuse une campagne terminée', () => {
    const passee = campagne({ endsAt: new Date('2026-03-01T00:00:00.000Z') });
    expect(checkInvite(invitation(), passee, MAINTENANT)).toEqual({
      valid: false,
      reason: 'CAMPAIGN_INACTIVE',
    });
  });

  it('refuse une campagne désactivée', () => {
    expect(checkInvite(invitation(), campagne({ active: false }), MAINTENANT)).toEqual({
      valid: false,
      reason: 'CAMPAIGN_INACTIVE',
    });
  });

  it('fait primer l’invalidité du code sur l’état de la campagne', () => {
    // Un code révoqué ne doit pas révéler que la campagne, elle, est ouverte.
    const verdict = checkInvite(invitation({ revokedAt: MAINTENANT }), campagne(), MAINTENANT);
    expect(verdict).toEqual({ valid: false, reason: 'INVALID' });
  });
});

describe('offre de lancement — anti-abus', () => {
  it('accorde l’offre à un membre neuf', () => {
    expect(checkPromoEligibility(eligibilite())).toEqual({ valid: true });
  });

  it('refuse si le NUMÉRO a déjà bénéficié', () => {
    expect(checkPromoEligibility(eligibilite({ phoneAlreadyBenefited: true }))).toEqual({
      valid: false,
      reason: 'ALREADY_BENEFITED',
    });
  });

  it('refuse si la PIÈCE D’IDENTITÉ a déjà bénéficié', () => {
    // Le numéro seul se change pour quelques centaines de francs ; la pièce,
    // non. Un contrôle sur le seul numéro rendrait l'offre triviale à
    // multiplier.
    expect(checkPromoEligibility(eligibilite({ documentAlreadyBenefited: true }))).toEqual({
      valid: false,
      reason: 'ALREADY_BENEFITED',
    });
  });

  it('refuse l’offre à un compte banni', () => {
    // Sinon le bannissement se contournerait en revenant avec l'offre.
    expect(checkPromoEligibility(eligibilite({ accountStatus: 'BANNED' }))).toEqual({
      valid: false,
      reason: 'ALREADY_BENEFITED',
    });
  });

  it('refuse l’offre à un compte bloqué pour minorité', () => {
    expect(checkPromoEligibility(eligibilite({ accountStatus: 'BLOCKED_UNDERAGE' }))).toEqual({
      valid: false,
      reason: 'ALREADY_BENEFITED',
    });
  });

  it('calcule la fin de la période offerte', () => {
    expect(promoPeriodEnd(MAINTENANT, 30).toISOString()).toBe('2026-04-14T12:00:00.000Z');
  });
});

describe('tunnel de migration', () => {
  it('suit les six étapes, dans l’ordre', () => {
    expect(FUNNEL_STEPS).toHaveLength(6);
    expect(FUNNEL_STEPS[0]).toBe('invite.clicked');
    expect(FUNNEL_STEPS[5]).toBe('profile.completed');
  });

  it('calcule les deux lectures d’un tunnel complet', () => {
    // `fromStart` mesure le rendement global d'une campagne, `fromPrevious`
    // désigne l'étape qui coince. Ne donner que la première masquerait le point
    // à corriger.
    const resultat = computeFunnel([
      { step: 'invite.clicked', count: 1000 },
      { step: 'signup.started', count: 400 },
      { step: 'signup.completed', count: 300 },
      { step: 'verification.submitted', count: 150 },
      { step: 'verification.approved', count: 120 },
      { step: 'profile.completed', count: 90 },
    ]);

    expect(resultat[3]).toEqual({
      step: 'verification.submitted',
      count: 150,
      fromPrevious: 50,
      fromStart: 15,
    });
    expect(resultat[5]?.fromStart).toBe(9);
  });

  it('désigne l’étape qui perd le plus de monde', () => {
    const resultat = computeFunnel([
      { step: 'invite.clicked', count: 1000 },
      { step: 'signup.started', count: 900 },
      { step: 'signup.completed', count: 850 },
      { step: 'verification.submitted', count: 200 },
      { step: 'verification.approved', count: 190 },
      { step: 'profile.completed', count: 180 },
    ]);

    const pire = resultat.slice(1).reduce((a, b) => (a.fromPrevious <= b.fromPrevious ? a : b));
    expect(pire.step).toBe('verification.submitted');
  });

  it('ne divise jamais par zéro sur une campagne sans clic', () => {
    const resultat = computeFunnel([]);
    expect(resultat.every((etape) => etape.fromStart === 0 && etape.fromPrevious === 0)).toBe(true);
  });

  it('complète les étapes absentes par zéro', () => {
    const resultat = computeFunnel([{ step: 'invite.clicked', count: 50 }]);
    expect(resultat).toHaveLength(6);
    expect(resultat[1]).toMatchObject({ count: 0, fromPrevious: 0 });
  });
});
