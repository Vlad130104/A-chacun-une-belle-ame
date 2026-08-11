import { beforeEach, describe, expect, it } from '@jest/globals';
import { BusinessError } from '../../../common/errors/business.error';
import type { FunnelCounts } from '../domain/campaign-policy';
import type { EventName } from '../domain/event-schema';
import {
  ConsumeInviteUseCase,
  GetFunnelUseCase,
  MyReferralUseCase,
  ResolveInviteForSignupUseCase,
  ResolveInviteUseCase,
  SafeAnalyticsTracker,
  TrackEventUseCase,
  subjectHash,
  type AnalyticsConfig,
} from './analytics.use-cases';
import type {
  AnalyticsRepository,
  CampaignRecord,
  CampaignRepository,
  InviteRecord,
} from './ports';

const MAINTENANT = new Date('2026-03-15T12:00:00.000Z');

const config: AnalyticsConfig = { hmacSecret: 'secret-serveur-de-test', retentionMonths: 14 };

class FakeAnalytics implements AnalyticsRepository {
  events: Parameters<AnalyticsRepository['record']>[0][] = [];
  counts: FunnelCounts[] = [];

  record(input: Parameters<AnalyticsRepository['record']>[0]): Promise<void> {
    this.events.push(input);
    return Promise.resolve();
  }

  funnelCounts(): Promise<FunnelCounts[]> {
    return Promise.resolve(this.counts);
  }

  keyIndicators(): Promise<Record<string, number>> {
    return Promise.resolve({});
  }
}

class FakeCampaigns implements CampaignRepository {
  invites: InviteRecord[] = [];
  campaigns: CampaignRecord[] = [];
  clicks: string[] = [];
  consumed: string[] = [];
  quotaEpuise = false;
  promoDeja = { byPhone: false, byDocument: false };

  findInviteByCode(code: string): Promise<InviteRecord | null> {
    return Promise.resolve(this.invites.find((invite) => invite.code === code) ?? null);
  }

  findCampaignById(campaignId: string): Promise<CampaignRecord | null> {
    return Promise.resolve(this.campaigns.find((campagne) => campagne.id === campaignId) ?? null);
  }

  countClick(inviteId: string): Promise<void> {
    this.clicks.push(inviteId);
    return Promise.resolve();
  }

  consumeUse(inviteId: string): Promise<boolean> {
    if (this.quotaEpuise) return Promise.resolve(false);
    this.consumed.push(inviteId);
    return Promise.resolve(true);
  }

  promoAlreadyGranted(): Promise<{ byPhone: boolean; byDocument: boolean }> {
    return Promise.resolve(this.promoDeja);
  }

  listCampaigns(): Promise<(CampaignRecord & { clickCount: number })[]> {
    return Promise.resolve([]);
  }

  ensurePersonalInvite(userId: string): Promise<InviteRecord> {
    return Promise.resolve({
      id: `invite-${userId}`,
      code: `PARRAIN-${userId.toUpperCase()}`,
      campaignId: null,
      inviterId: userId,
      maxUses: 100,
      useCount: 3,
      expiresAt: null,
      revokedAt: null,
    });
  }

  referralStats(): Promise<{ clicks: number; signups: number }> {
    return Promise.resolve({ clicks: 12, signups: 3 });
  }
}

class FixedClock {
  now(): Date {
    return new Date(MAINTENANT.getTime());
  }
}

let analytics: FakeAnalytics;
let campaigns: FakeCampaigns;
let clock: FixedClock;

beforeEach(() => {
  analytics = new FakeAnalytics();
  campaigns = new FakeCampaigns();
  clock = new FixedClock();
});

const suivre = () => new TrackEventUseCase(analytics, clock, config);

const attendreErreur = async (promesse: Promise<unknown>): Promise<BusinessError> => {
  try {
    await promesse;
  } catch (erreur) {
    if (erreur instanceof BusinessError) return erreur;
    throw erreur;
  }
  throw new Error('Une BusinessError était attendue.');
};

describe('pseudonymisation', () => {
  it('produit un pseudonyme stable pour un même membre', () => {
    // Les cohortes restent calculables : même membre, même pseudonyme.
    expect(subjectHash('membre-1', 'secret')).toBe(subjectHash('membre-1', 'secret'));
  });

  it('distingue deux membres', () => {
    expect(subjectHash('membre-1', 'secret')).not.toBe(subjectHash('membre-2', 'secret'));
  });

  it('dépend du SECRET, pas seulement de l’identifiant', () => {
    // C'est toute la différence avec un hachage nu : sans le secret, on ne
    // recalcule pas le pseudonyme, donc on ne retrouve personne dans un export.
    expect(subjectHash('membre-1', 'secret-a')).not.toBe(subjectHash('membre-1', 'secret-b'));
  });

  it('ne laisse pas l’identifiant apparaître dans le pseudonyme', () => {
    expect(subjectHash('membre-1', 'secret')).not.toContain('membre-1');
  });
});

describe('enregistrement d’un événement', () => {
  it('enregistre un événement déclaré', async () => {
    await suivre().execute({
      userId: 'membre-1',
      name: 'match.created',
      properties: { score: 0.8 },
    });

    expect(analytics.events[0]).toMatchObject({
      name: 'match.created',
      properties: { score: 0.8 },
      userId: 'membre-1',
    });
  });

  it('REFUSE un événement mal formé au lieu de le nettoyer', async () => {
    // Accepter une version amputée masquerait l'erreur d'appel — et c'est
    // précisément par ce genre d'appel qu'une donnée nominative entrerait.
    const erreur = await attendreErreur(
      suivre().execute({
        userId: 'membre-1',
        name: 'match.created',
        properties: { score: 0.8, phone: '+237699001122' },
      }),
    );

    expect(erreur.code).toBe('VALIDATION_FAILED');
    expect(analytics.events).toHaveLength(0);
  });

  it('refuse un événement non déclaré', async () => {
    // Le nom est typé (`EventName`) : un appelant du dépôt ne PEUT PAS écrire
    // cet appel, il ne compilerait pas. La conversion force ici le chemin
    // d'exécution, pour vérifier que la barrière tient aussi à l'exécution —
    // par exemple face à un nom venu d'une désérialisation.
    await attendreErreur(
      suivre().execute({
        userId: 'membre-1',
        name: 'evenement.invente' as EventName,
      }),
    );
    expect(analytics.events).toHaveLength(0);
  });

  it('pseudonymise un visiteur anonyme sans l’identifier', async () => {
    await suivre().execute({
      userId: null,
      name: 'invite.clicked',
      campaignCode: 'whatsapp-01',
      properties: { campaignCode: 'whatsapp-01', source: 'whatsapp_group' },
    });

    expect(analytics.events[0]?.userId).toBeNull();
    expect(analytics.events[0]?.subjectHash).toHaveLength(64);
  });

  it('calcule une date de purge conforme à la rétention', async () => {
    await suivre().execute({ userId: 'membre-1', name: 'signup.started' });
    expect(analytics.events[0]?.purgeAt.toISOString()).toBe('2027-05-15T12:00:00.000Z');
  });
});

describe('ouverture d’un lien d’invitation', () => {
  const resoudre = () => new ResolveInviteUseCase(campaigns, suivre(), clock);

  const invitationValide = (): InviteRecord => ({
    id: 'invite-1',
    code: 'WHATSAPP01',
    campaignId: 'camp-1',
    inviterId: null,
    maxUses: 500,
    useCount: 10,
    expiresAt: null,
    revokedAt: null,
  });

  const campagneActive = (): CampaignRecord => ({
    id: 'camp-1',
    code: 'whatsapp-01',
    name: 'Groupe WhatsApp historique',
    source: 'whatsapp_group',
    promoPlanCode: 'premium_monthly',
    promoFreeDays: 30,
    active: true,
    startsAt: new Date('2026-03-01T00:00:00.000Z'),
    endsAt: null,
  });

  it('renvoie l’offre d’une campagne valide', async () => {
    campaigns.invites = [invitationValide()];
    campaigns.campaigns = [campagneActive()];

    const resultat = await resoudre().execute('WHATSAPP01');

    expect(resultat).toEqual({
      valid: true,
      campaignName: 'Groupe WhatsApp historique',
      promoFreeDays: 30,
    });
  });

  it('ne révèle JAMAIS l’identité de l’invitant', async () => {
    // Un code de parrainage circule par capture d'écran : savoir qui l'a émis
    // exposerait cette personne.
    campaigns.invites = [{ ...invitationValide(), campaignId: null, inviterId: 'membre-9' }];

    const resultat = await resoudre().execute('WHATSAPP01');
    expect(JSON.stringify(resultat)).not.toContain('membre-9');
  });

  it('répond de façon identique pour un code inconnu et un code saturé', async () => {
    campaigns.invites = [{ ...invitationValide(), maxUses: 10, useCount: 10 }];
    const sature = await resoudre().execute('WHATSAPP01');

    campaigns.invites = [];
    const inconnu = await resoudre().execute('AUTRE');

    expect(sature).toEqual(inconnu);
  });

  it('compte le clic et enregistre l’événement', async () => {
    campaigns.invites = [invitationValide()];
    campaigns.campaigns = [campagneActive()];

    await resoudre().execute('WHATSAPP01');

    expect(campaigns.clicks).toEqual(['invite-1']);
    expect(analytics.events[0]?.name).toBe('invite.clicked');
  });

  it('ne compte aucun clic sur un code inexistant', async () => {
    await resoudre().execute('INEXISTANT');
    expect(campaigns.clicks).toEqual([]);
  });
});

describe('consommation d’un code à l’inscription', () => {
  const consommer = () => new ConsumeInviteUseCase(campaigns, clock);

  const preparer = (): void => {
    campaigns.invites = [
      {
        id: 'invite-1',
        code: 'WHATSAPP01',
        campaignId: 'camp-1',
        inviterId: null,
        maxUses: 500,
        useCount: 10,
        expiresAt: null,
        revokedAt: null,
      },
    ];
    campaigns.campaigns = [
      {
        id: 'camp-1',
        code: 'whatsapp-01',
        name: 'Groupe WhatsApp',
        source: 'whatsapp_group',
        promoPlanCode: 'premium_monthly',
        promoFreeDays: 30,
        active: true,
        startsAt: new Date('2026-03-01T00:00:00.000Z'),
        endsAt: null,
      },
    ];
  };

  const demande = {
    code: 'WHATSAPP01',
    phoneHash: 'hash-numero',
    documentNumberHash: 'hash-piece',
    accountStatus: 'ACTIVE',
  };

  it('accorde l’offre et consomme une utilisation', async () => {
    preparer();
    const resultat = await consommer().execute(demande);

    expect(resultat).toEqual({
      granted: true,
      promoPlanCode: 'premium_monthly',
      promoEndsAt: new Date('2026-04-14T12:00:00.000Z'),
    });
    expect(campaigns.consumed).toEqual(['invite-1']);
  });

  it('refuse si le NUMÉRO a déjà bénéficié', async () => {
    preparer();
    campaigns.promoDeja = { byPhone: true, byDocument: false };

    const resultat = await consommer().execute(demande);

    expect(resultat.granted).toBe(false);
    // Rien n'est consommé : le quota de la campagne n'est pas entamé par un
    // refus.
    expect(campaigns.consumed).toEqual([]);
  });

  it('refuse si la PIÈCE D’IDENTITÉ a déjà bénéficié', async () => {
    preparer();
    campaigns.promoDeja = { byPhone: false, byDocument: true };

    expect((await consommer().execute(demande)).granted).toBe(false);
  });

  it('refuse un compte banni', async () => {
    preparer();
    const resultat = await consommer().execute({ ...demande, accountStatus: 'BANNED' });
    expect(resultat.granted).toBe(false);
  });

  it('laisse la BASE arbitrer le quota en cas de concurrence', async () => {
    // Deux inscriptions simultanées ne peuvent pas dépasser `maxUses` : c'est
    // la consommation conditionnelle qui tranche, pas une lecture préalable.
    preparer();
    campaigns.quotaEpuise = true;

    const resultat = await consommer().execute(demande);

    expect(resultat.granted).toBe(false);
    expect(resultat.promoPlanCode).toBeNull();
  });

  it('trace un parrainage sans offre', async () => {
    campaigns.invites = [
      {
        id: 'invite-perso',
        code: 'PARRAIN-X',
        campaignId: null,
        inviterId: 'membre-9',
        maxUses: 100,
        useCount: 0,
        expiresAt: null,
        revokedAt: null,
      },
    ];

    const resultat = await consommer().execute({ ...demande, code: 'PARRAIN-X' });

    expect(resultat).toEqual({ granted: true, promoPlanCode: null, promoEndsAt: null });
    expect(campaigns.consumed).toEqual(['invite-perso']);
  });
});

describe('tunnel et parrainage', () => {
  it('calcule le tunnel sur la fenêtre demandée', async () => {
    analytics.counts = [
      { step: 'invite.clicked', count: 200 },
      { step: 'signup.started', count: 100 },
    ];

    const resultat = await new GetFunnelUseCase(analytics, clock).execute({ days: 30 });

    expect(resultat.steps).toHaveLength(6);
    expect(resultat.steps[1]).toMatchObject({ count: 100, fromPrevious: 50 });
  });

  it('rend des COMPTES de parrainage, jamais des identités', async () => {
    // Un parrain apprend combien de personnes se sont inscrites par son lien,
    // jamais lesquelles.
    const resultat = await new MyReferralUseCase(campaigns, clock).execute('membre-1');

    expect(resultat).toEqual({ code: 'PARRAIN-MEMBRE-1', clicks: 12, signups: 3 });
    expect(Object.keys(resultat)).toEqual(['code', 'clicks', 'signups']);
  });
});

describe('traceur tolérant aux pannes', () => {
  class DepotEnPanne implements AnalyticsRepository {
    record(): Promise<void> {
      return Promise.reject(new Error('table analytique indisponible'));
    }
    funnelCounts(): Promise<FunnelCounts[]> {
      return Promise.resolve([]);
    }
    keyIndicators(): Promise<Record<string, number>> {
      return Promise.resolve({});
    }
  }

  it('n’INTERROMPT PAS l’appelant quand l’écriture échoue', async () => {
    // La garantie qui justifie l'existence de cette classe : une inscription ne
    // doit pas échouer parce que la table d'analytique est indisponible. La
    // mesure n'est pas le service.
    const echecs: string[] = [];
    const traceur = new SafeAnalyticsTracker(
      new TrackEventUseCase(new DepotEnPanne(), clock, config),
      (nom) => echecs.push(nom),
    );

    await expect(
      traceur.track({ userId: 'membre-1', name: 'signup.started' }),
    ).resolves.toBeUndefined();
    expect(echecs).toEqual(['signup.started']);
  });

  it('signale l’échec plutôt que de l’avaler en silence', async () => {
    const causes: unknown[] = [];
    const traceur = new SafeAnalyticsTracker(
      new TrackEventUseCase(new DepotEnPanne(), clock, config),
      (_nom, erreur) => causes.push(erreur),
    );

    await traceur.track({ userId: null, name: 'invite.clicked' });

    expect(causes).toHaveLength(1);
    expect(causes[0]).toBeInstanceOf(Error);
  });

  it('transmet l’événement au cas d’usage quand tout va bien', async () => {
    const traceur = new SafeAnalyticsTracker(suivre(), () => {
      throw new Error('aucun échec n’était attendu');
    });

    await traceur.track({
      userId: 'membre-1',
      name: 'profile.completed',
      properties: { completionRate: 80, photoCount: 3 },
    });

    expect(analytics.events).toHaveLength(1);
    expect(analytics.events[0]?.name).toBe('profile.completed');
  });
});

describe('résolution d’un code à l’inscription', () => {
  const resoudre = () => new ResolveInviteForSignupUseCase(campaigns, clock);

  beforeEach(() => {
    campaigns.invites = [
      {
        id: 'invite-1',
        code: 'WHATSAPP01',
        campaignId: 'camp-1',
        inviterId: null,
        maxUses: 500,
        useCount: 10,
        expiresAt: null,
        revokedAt: null,
      },
    ];
    campaigns.campaigns = [
      {
        id: 'camp-1',
        code: 'whatsapp-01',
        name: 'Groupe WhatsApp historique',
        source: 'whatsapp_group',
        promoPlanCode: 'premium_monthly',
        promoFreeDays: 30,
        active: true,
        startsAt: new Date('2026-03-01T00:00:00.000Z'),
        endsAt: null,
      },
    ];
  });

  it('rend l’identifiant interne du lien et le code de campagne', async () => {
    // Ce que la route publique ne rend JAMAIS : l'identifiant interne. Il ne
    // sert qu'à rattacher le compte au lien, côté serveur.
    expect(await resoudre().resolveForSignup('WHATSAPP01')).toEqual({
      inviteId: 'invite-1',
      campaignCode: 'whatsapp-01',
    });
  });

  it('ne CONSOMME pas le quota', async () => {
    // L'inscription rattache le compte au lien ; l'offre est accordée après
    // vérification d'identité (story D10-08). Consommer ici retirerait une
    // place à quelqu'un qui n'ira peut-être jamais au bout du parcours.
    await resoudre().resolveForSignup('WHATSAPP01');

    expect(campaigns.consumed).toEqual([]);
  });

  it('rend null sur un code inexistant, sans rien faire échouer', async () => {
    expect(await resoudre().resolveForSignup('CODE-INEXISTANT')).toBeNull();
  });

  it('rend null quand la campagne est terminée', async () => {
    campaigns.campaigns = [
      { ...campaigns.campaigns[0]!, endsAt: new Date('2026-01-01T00:00:00.000Z') },
    ];

    expect(await resoudre().resolveForSignup('WHATSAPP01')).toBeNull();
  });

  it('accepte un parrainage individuel, qui n’a pas de campagne', async () => {
    campaigns.invites = [
      {
        id: 'invite-perso',
        code: 'PARRAINX',
        campaignId: null,
        inviterId: 'membre-9',
        maxUses: 100,
        useCount: 0,
        expiresAt: null,
        revokedAt: null,
      },
    ];

    expect(await resoudre().resolveForSignup('PARRAINX')).toEqual({
      inviteId: 'invite-perso',
      campaignCode: null,
    });
  });
});
