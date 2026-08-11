import { createHmac } from 'node:crypto';
import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import type { ClockProvider } from '../../../providers/ports';
import {
  checkInvite,
  checkPromoEligibility,
  computeFunnel,
  promoPeriodEnd,
  type FunnelRate,
} from '../domain/campaign-policy';
import { validateEvent, type EventName } from '../domain/event-schema';
import type {
  AnalyticsRepository,
  AnalyticsTracker,
  CampaignRepository,
  InviteResolver,
} from './ports';

export interface AnalyticsConfig {
  /** Secret du pseudonyme. Distinct du sel de hachage général. */
  hmacSecret: string;
  retentionMonths: number;
}

/**
 * Pseudonyme stable d'un membre (story D10-05, ADR-021).
 *
 * HMAC-SHA256 avec un secret **serveur**, pas un simple hachage. La différence
 * compte : un hachage nu de `userId` se recalcule par quiconque connaît un
 * identifiant, ce qui permettrait de retrouver quelqu'un dans un export
 * analytique. Avec un HMAC, il faut le secret — qui ne quitte jamais le serveur
 * et n'est pas dans les données analytiques.
 *
 * Les cohortes restent calculables (même membre → même pseudonyme), la
 * ré-identification depuis les seules données analytiques ne l'est pas.
 */
export function subjectHash(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(userId).digest('hex');
}

export class TrackEventUseCase {
  constructor(
    private readonly analytics: AnalyticsRepository,
    private readonly clock: ClockProvider,
    private readonly config: AnalyticsConfig,
  ) {}

  async execute(input: {
    userId: string | null;
    name: EventName;
    campaignCode?: string | null;
    properties?: Record<string, unknown>;
  }): Promise<{ recorded: boolean }> {
    const validation = validateEvent(input.name, input.properties ?? {});

    if (!validation.valid) {
      // Un événement mal formé est REFUSÉ, jamais nettoyé en silence : accepter
      // une version amputée masquerait l'erreur d'appel, et c'est précisément
      // par ce genre d'appel qu'une donnée nominative entrerait un jour.
      throw BusinessError.badRequest(ErrorCode.VALIDATION_FAILED, {
        event: input.name,
        failure: validation.failure,
      });
    }

    const now = this.clock.now();
    const purge = new Date(now.getTime());
    purge.setUTCMonth(purge.getUTCMonth() + this.config.retentionMonths);

    await this.analytics.record({
      // Un événement anonyme (clic sur un lien avant inscription) porte un
      // pseudonyme dérivé du code de campagne : les cohortes restent
      // mesurables sans qu'aucun visiteur soit identifié.
      subjectHash:
        input.userId === null
          ? subjectHash(`anon:${input.campaignCode ?? 'direct'}`, this.config.hmacSecret)
          : subjectHash(input.userId, this.config.hmacSecret),
      userId: input.userId,
      name: input.name,
      campaignCode: input.campaignCode ?? null,
      properties: validation.properties,
      occurredAt: now,
      purgeAt: purge,
    });

    return { recorded: true };
  }
}

/**
 * Traceur utilisé par les autres modules (`auth`, `verification`, `profiles`).
 *
 * Il enveloppe `TrackEventUseCase` d'une seule garantie, qui est toute sa raison
 * d'être : **il ne rejette pas**. Une inscription ne doit pas échouer parce que
 * la table d'analytique est pleine ou lente. L'échec part dans le puits fourni
 * par le module — il est visible en exploitation, il n'est pas propagé au membre.
 *
 * L'absorption est sans danger ici parce que le nom d'événement est typé : le
 * seul rejet possible de `TrackEventUseCase` serait une propriété mal formée,
 * et les appelants passent des littéraux relus en revue.
 */
export class SafeAnalyticsTracker implements AnalyticsTracker {
  constructor(
    private readonly trackEvent: TrackEventUseCase,
    private readonly onFailure: (name: EventName, error: unknown) => void,
  ) {}

  async track(input: {
    userId: string | null;
    name: EventName;
    campaignCode?: string | null;
    properties?: Record<string, string | number | boolean>;
  }): Promise<void> {
    try {
      await this.trackEvent.execute(input);
    } catch (error) {
      this.onFailure(input.name, error);
    }
  }
}

/**
 * Résolution d'un code à l'inscription (story D10-02).
 *
 * Distincte de `ResolveInviteUseCase` : celle-ci rend l'identifiant interne du
 * lien, ce que la route publique ne fait jamais. Elle ne consomme pas le quota —
 * l'inscription ne fait que RATTACHER le compte au lien. L'offre promotionnelle
 * est accordée après vérification d'identité (story D10-08) : la promettre à un
 * compte non vérifié contredirait la règle du produit.
 */
export class ResolveInviteForSignupUseCase implements InviteResolver {
  constructor(
    private readonly campaigns: CampaignRepository,
    private readonly clock: ClockProvider,
  ) {}

  async resolveForSignup(
    code: string,
  ): Promise<{ inviteId: string; campaignCode: string | null } | null> {
    const invitation = await this.campaigns.findInviteByCode(code);
    if (invitation === null) return null;

    const campagne =
      invitation.campaignId === null
        ? null
        : await this.campaigns.findCampaignById(invitation.campaignId);

    if (!checkInvite(invitation, campagne, this.clock.now()).valid) return null;

    return { inviteId: invitation.id, campaignCode: campagne?.code ?? null };
  }
}

/**
 * Ouverture d'un lien d'invitation — route PUBLIQUE (story D10-01).
 *
 * Elle ne révèle **jamais** l'identité de l'invitant : un code de parrainage
 * circule par capture d'écran, et savoir qui l'a émis exposerait cette personne.
 * Elle ne révèle pas non plus pourquoi un code est refusé.
 */
export class ResolveInviteUseCase {
  constructor(
    private readonly campaigns: CampaignRepository,
    private readonly track: TrackEventUseCase,
    private readonly clock: ClockProvider,
  ) {}

  async execute(code: string): Promise<{
    valid: boolean;
    campaignName: string | null;
    promoFreeDays: number;
  }> {
    const now = this.clock.now();
    const invitation = await this.campaigns.findInviteByCode(code);
    const campagne =
      invitation?.campaignId == null
        ? null
        : await this.campaigns.findCampaignById(invitation.campaignId);

    const verdict = checkInvite(invitation, campagne, now);

    if (invitation !== null) {
      await this.campaigns.countClick(invitation.id);
      await this.track.execute({
        userId: null,
        name: 'invite.clicked',
        campaignCode: campagne?.code ?? null,
        properties: {
          campaignCode: campagne?.code ?? 'direct',
          source: campagne?.source ?? 'referral',
        },
      });
    }

    if (!verdict.valid) {
      // Réponse identique quelle que soit la cause : ni l'existence du code, ni
      // l'état de la campagne ne sont révélés.
      return { valid: false, campaignName: null, promoFreeDays: 0 };
    }

    return {
      valid: true,
      campaignName: campagne?.name ?? null,
      promoFreeDays: campagne?.promoFreeDays ?? 0,
    };
  }
}

/**
 * Consommation d'un code à l'inscription (stories D10-02, D10-03).
 *
 * Appelée par le module `auth` au moment de créer le compte. Deux garanties :
 *
 *  - le quota est consommé **en transaction conditionnelle** — deux inscriptions
 *    simultanées ne peuvent pas dépasser `maxUses` ;
 *  - l'offre est refusée si le numéro **ou** l'empreinte de pièce a déjà
 *    bénéficié. Le numéro seul se change ; la pièce, non.
 */
export class ConsumeInviteUseCase {
  constructor(
    private readonly campaigns: CampaignRepository,
    private readonly clock: ClockProvider,
  ) {}

  async execute(input: {
    code: string;
    phoneHash: string;
    documentNumberHash: string | null;
    accountStatus: string;
  }): Promise<{ granted: boolean; promoPlanCode: string | null; promoEndsAt: Date | null }> {
    const now = this.clock.now();
    const invitation = await this.campaigns.findInviteByCode(input.code);
    const campagne =
      invitation?.campaignId == null
        ? null
        : await this.campaigns.findCampaignById(invitation.campaignId);

    if (!checkInvite(invitation, campagne, now).valid || invitation === null) {
      return { granted: false, promoPlanCode: null, promoEndsAt: null };
    }

    const deja = await this.campaigns.promoAlreadyGranted({
      phoneHash: input.phoneHash,
      documentNumberHash: input.documentNumberHash,
    });

    const eligible = checkPromoEligibility({
      phoneAlreadyBenefited: deja.byPhone,
      documentAlreadyBenefited: deja.byDocument,
      accountStatus: input.accountStatus,
    });

    if (!eligible.valid) return { granted: false, promoPlanCode: null, promoEndsAt: null };

    // La base arbitre : si le quota vient d'être atteint par une inscription
    // concurrente, la consommation échoue et aucune offre n'est accordée.
    const consomme = await this.campaigns.consumeUse(invitation.id);
    if (!consomme) return { granted: false, promoPlanCode: null, promoEndsAt: null };

    if (campagne === null || campagne.promoFreeDays === 0) {
      // Code de parrainage sans offre : la traçabilité fonctionne, il n'y a
      // simplement rien à offrir.
      return { granted: true, promoPlanCode: null, promoEndsAt: null };
    }

    return {
      granted: true,
      promoPlanCode: campagne.promoPlanCode,
      promoEndsAt: promoPeriodEnd(now, campagne.promoFreeDays),
    };
  }
}

/** Tunnel de migration (story D10-04). */
export class GetFunnelUseCase {
  constructor(
    private readonly analytics: AnalyticsRepository,
    private readonly clock: ClockProvider,
  ) {}

  async execute(input: { campaignCode?: string; days: number }): Promise<{ steps: FunnelRate[] }> {
    const since = new Date(this.clock.now().getTime() - input.days * 86_400_000);
    const comptages = await this.analytics.funnelCounts({
      ...(input.campaignCode === undefined ? {} : { campaignCode: input.campaignCode }),
      since,
    });

    return { steps: computeFunnel(comptages) };
  }
}

/** Les 13 indicateurs du cahier des charges (story D10-06). */
export class GetKeyIndicatorsUseCase {
  constructor(
    private readonly analytics: AnalyticsRepository,
    private readonly clock: ClockProvider,
  ) {}

  async execute(): Promise<Record<string, number>> {
    return this.analytics.keyIndicators(this.clock.now());
  }
}

export class ListCampaignsUseCase {
  constructor(private readonly campaigns: CampaignRepository) {}

  async execute(limit: number): Promise<unknown> {
    return { items: await this.campaigns.listCampaigns(limit) };
  }
}

/**
 * Code de parrainage personnel (story D10-07).
 *
 * Les statistiques rendues sont des COMPTES, jamais des identités : un
 * parrain apprend combien de personnes se sont inscrites par son lien, jamais
 * lesquelles. Le lien de parrainage ne crée pas de droit de regard sur les
 * autres.
 */
export class MyReferralUseCase {
  constructor(
    private readonly campaigns: CampaignRepository,
    private readonly clock: ClockProvider,
  ) {}

  async execute(userId: string): Promise<{
    code: string;
    clicks: number;
    signups: number;
  }> {
    const invitation = await this.campaigns.ensurePersonalInvite(userId, this.clock.now());
    const stats = await this.campaigns.referralStats(userId);

    return { code: invitation.code, clicks: stats.clicks, signups: stats.signups };
  }
}
