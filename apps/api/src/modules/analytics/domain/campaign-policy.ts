/**
 * Migration WhatsApp : campagnes, codes d'invitation et offre de lancement
 * (stories D10-01 à D10-03).
 *
 * **Principe non négociable rappelé en tête de fichier : aucun import
 * automatique de membres.** Les 9 000 personnes du groupe WhatsApp ne sont pas
 * une base de données à transférer. Chacune s'inscrit elle-même, consent
 * elle-même, vérifie son identité elle-même. Une campagne ne fait que tracer
 * d'où vient une inscription — elle ne crée jamais de compte.
 */

export type InviteRefusal =
  /** Code inexistant, expiré, révoqué ou saturé — indistincts, volontairement. */
  | 'INVALID'
  /** Le membre a déjà bénéficié d'une offre promotionnelle. */
  | 'ALREADY_BENEFITED'
  /** La campagne n'a pas commencé ou est terminée. */
  | 'CAMPAIGN_INACTIVE';

export type InviteVerdict = { valid: true } | { valid: false; reason: InviteRefusal };

export interface InviteState {
  maxUses: number;
  useCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface CampaignState {
  active: boolean;
  startsAt: Date;
  endsAt: Date | null;
  promoFreeDays: number;
}

/**
 * Un code est-il utilisable ?
 *
 * Toutes les causes d'invalidité renvoient **le même motif**. Distinguer
 * « expiré » de « saturé » de « inexistant » révélerait l'existence et l'état
 * d'une campagne à quiconque essaie des codes au hasard — et permettrait de
 * cartographier les campagnes en cours.
 */
export function checkInvite(
  invite: InviteState | null,
  campaign: CampaignState | null,
  now: Date,
): InviteVerdict {
  if (invite === null) return refuse('INVALID');
  if (invite.revokedAt !== null) return refuse('INVALID');
  if (invite.expiresAt !== null && invite.expiresAt.getTime() <= now.getTime()) {
    return refuse('INVALID');
  }
  if (invite.useCount >= invite.maxUses) return refuse('INVALID');

  // Un code de parrainage individuel n'a pas de campagne : c'est légitime.
  if (campaign === null) return { valid: true };

  if (!campaign.active) return refuse('CAMPAIGN_INACTIVE');
  if (campaign.startsAt.getTime() > now.getTime()) return refuse('CAMPAIGN_INACTIVE');
  if (campaign.endsAt !== null && campaign.endsAt.getTime() <= now.getTime()) {
    return refuse('CAMPAIGN_INACTIVE');
  }

  return { valid: true };
}

function refuse(reason: InviteRefusal): InviteVerdict {
  return { valid: false, reason };
}

export interface PromoEligibility {
  /** Le numéro a-t-il déjà donné lieu à une offre ? */
  phoneAlreadyBenefited: boolean;
  /** L'empreinte de pièce d'identité a-t-elle déjà donné lieu à une offre ? */
  documentAlreadyBenefited: boolean;
  accountStatus: string;
}

/**
 * Le bénéfice promotionnel est-il ouvert (story D10-03) ?
 *
 * Deux verrous, et il en faut deux : le numéro **et** l'empreinte de pièce
 * d'identité. Le numéro seul se change pour quelques centaines de francs ; la
 * pièce, non. Un contrôle sur le seul numéro rendrait l'offre triviale à
 * multiplier.
 *
 * Un compte banni perd son bénéfice : sinon le bannissement se contournerait en
 * revenant avec l'offre de lancement.
 */
export function checkPromoEligibility(eligibility: PromoEligibility): InviteVerdict {
  if (eligibility.accountStatus === 'BANNED' || eligibility.accountStatus === 'BLOCKED_UNDERAGE') {
    return refuse('ALREADY_BENEFITED');
  }
  if (eligibility.phoneAlreadyBenefited || eligibility.documentAlreadyBenefited) {
    return refuse('ALREADY_BENEFITED');
  }
  return { valid: true };
}

/** Fin de la période offerte, à partir des jours déclarés par la campagne. */
export function promoPeriodEnd(from: Date, freeDays: number): Date {
  return new Date(from.getTime() + freeDays * 86_400_000);
}

/**
 * Étapes du tunnel de migration (story D10-04).
 *
 * Ordonnées : chaque étape suppose la précédente. Le taux de conversion se lit
 * d'une marche à l'autre, pas en pourcentage du total — c'est la marche où l'on
 * perd le monde qui intéresse.
 */
export const FUNNEL_STEPS = [
  'invite.clicked',
  'signup.started',
  'signup.completed',
  'verification.submitted',
  'verification.approved',
  'profile.completed',
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export interface FunnelCounts {
  step: FunnelStep;
  count: number;
}

export interface FunnelRate {
  step: FunnelStep;
  count: number;
  /** Conversion depuis l'étape PRÉCÉDENTE, en pourcentage. */
  fromPrevious: number;
  /** Conversion depuis la première étape, en pourcentage. */
  fromStart: number;
}

/**
 * Taux de conversion du tunnel.
 *
 * Les deux lectures sont rendues parce qu'elles ne disent pas la même chose :
 * `fromStart` mesure le rendement global d'une campagne, `fromPrevious` désigne
 * l'étape qui coince. Ne donner que la première masquerait le point à corriger.
 */
export function computeFunnel(counts: FunnelCounts[]): FunnelRate[] {
  const parEtape = new Map(counts.map((entree) => [entree.step, entree.count]));
  const depart = parEtape.get(FUNNEL_STEPS[0]) ?? 0;

  return FUNNEL_STEPS.map((step, index) => {
    const compte = parEtape.get(step) ?? 0;
    const precedent = index === 0 ? compte : (parEtape.get(FUNNEL_STEPS[index - 1]!) ?? 0);

    return {
      step,
      count: compte,
      fromPrevious: precedent === 0 ? 0 : Math.round((compte / precedent) * 100),
      fromStart: depart === 0 ? 0 : Math.round((compte / depart) * 100),
    };
  });
}
