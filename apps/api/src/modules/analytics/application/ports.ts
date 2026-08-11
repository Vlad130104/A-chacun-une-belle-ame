import type { FunnelCounts } from '../domain/campaign-policy';
import type { EventName } from '../domain/event-schema';

export const ANALYTICS_REPOSITORY = Symbol('AnalyticsRepository');
export const CAMPAIGN_REPOSITORY = Symbol('CampaignRepository');

/**
 * Ports **publiés** par ce module, consommés par `auth`, `verification` et
 * `profiles`.
 *
 * La convention du projet veut qu'un port soit déclaré par son consommateur.
 * Elle ne s'applique pas ici : trois modules consomment le même contrat, et le
 * déclarer chez l'un d'eux serait arbitraire — les deux autres importeraient
 * alors un fichier d'un domaine qui ne les concerne pas. Le module producteur
 * publie donc son contrat, comme le fait déjà `AuditModule` avec `AUDIT_WRITER`.
 */
export const ANALYTICS_TRACKER = Symbol('AnalyticsTracker');
export const INVITE_RESOLVER = Symbol('InviteResolver');

/**
 * Émission d'un événement produit depuis un autre module.
 *
 * Deux propriétés voulues :
 *
 *  - le nom est typé (`EventName`) : un événement non déclaré ne compile pas ;
 *  - `track` **ne rejette jamais**. Une écriture analytique qui échoue ne doit
 *    pas faire échouer une inscription. C'est la seule place du projet où une
 *    erreur est absorbée, et elle l'est parce que la mesure n'est pas le
 *    service : l'échec est journalisé, il n'est pas propagé.
 */
export interface AnalyticsTracker {
  track(input: {
    userId: string | null;
    name: EventName;
    campaignCode?: string | null;
    properties?: Record<string, string | number | boolean>;
  }): Promise<void>;
}

/**
 * Résolution d'un code d'invitation au moment de l'inscription.
 *
 * Rend l'identifiant interne du lien — que la route publique, elle, ne rend
 * jamais. Elle ne CONSOMME pas le quota : la consommation et l'offre
 * promotionnelle sont accordées après vérification d'identité (story D10-08).
 */
export interface InviteResolver {
  resolveForSignup(code: string): Promise<{ inviteId: string; campaignCode: string | null } | null>;
}

export interface AnalyticsRepository {
  record(input: {
    subjectHash: string;
    userId: string | null;
    name: string;
    campaignCode: string | null;
    properties: Record<string, string | number | boolean>;
    occurredAt: Date;
    purgeAt: Date;
  }): Promise<void>;

  /** Comptages du tunnel, par étape, éventuellement filtrés par campagne. */
  funnelCounts(input: { campaignCode?: string; since: Date }): Promise<FunnelCounts[]>;

  /** Les 13 indicateurs du cahier des charges (story D10-06). */
  keyIndicators(now: Date): Promise<Record<string, number>>;
}

export interface InviteRecord {
  id: string;
  code: string;
  campaignId: string | null;
  inviterId: string | null;
  maxUses: number;
  useCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface CampaignRecord {
  id: string;
  code: string;
  name: string;
  source: string;
  promoPlanCode: string | null;
  promoFreeDays: number;
  active: boolean;
  startsAt: Date;
  endsAt: Date | null;
}

export interface CampaignRepository {
  findInviteByCode(code: string): Promise<InviteRecord | null>;
  findCampaignById(campaignId: string): Promise<CampaignRecord | null>;

  /** Incrémente le compteur de clics — mesure sans identifier le visiteur. */
  countClick(inviteId: string): Promise<void>;

  /**
   * Consomme une utilisation **en transaction conditionnelle**.
   *
   * Renvoie `false` si le quota était déjà atteint. C'est la base qui arbitre :
   * deux inscriptions simultanées ne peuvent pas dépasser `maxUses`, quelle que
   * soit leur concurrence (story D10-03).
   */
  consumeUse(inviteId: string): Promise<boolean>;

  /** Le numéro ou la pièce ont-ils déjà donné lieu à une offre promotionnelle ? */
  promoAlreadyGranted(input: {
    phoneHash: string;
    documentNumberHash: string | null;
  }): Promise<{ byPhone: boolean; byDocument: boolean }>;

  listCampaigns(limit: number): Promise<(CampaignRecord & { clickCount: number })[]>;

  /** Code de parrainage personnel d'un membre, créé au besoin. */
  ensurePersonalInvite(userId: string, now: Date): Promise<InviteRecord>;

  referralStats(userId: string): Promise<{ clicks: number; signups: number }>;
}
