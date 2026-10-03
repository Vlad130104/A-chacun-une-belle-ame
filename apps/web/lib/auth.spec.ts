import type { ApiError } from './api-client';
import type * as Auth from './auth';
import type * as SessionModule from './session';

/**
 * Session web en cookie `httpOnly` — story F-02.
 *
 * Le faux serveur ci-dessous reproduit la règle qui rend ce code délicat : le
 * jeton de rafraîchissement est À USAGE UNIQUE, et le présenter une seconde
 * fois révoque toute la session (ADR-005). Le « cookie » vit dans une boîte
 * partagée, comme le magasin de cookies du navigateur l'est entre onglets ; la
 * page n'y a jamais accès, seul le faux `fetch` le lit et le remplace.
 */

type Module = typeof Auth & typeof SessionModule;

/** Charge une copie isolée des modules : un onglet distinct. */
function ouvrirOnglet(): Module {
  let charge: Module | undefined;
  jest.isolateModules(() => {
    const auth: typeof Auth = jest.requireActual('./auth');
    const session: typeof SessionModule = jest.requireActual('./session');
    charge = { ...auth, ...session };
  });
  return charge!;
}

const reponse = (statut: number, corps: unknown): Response =>
  ({
    ok: statut >= 200 && statut < 300,
    status: statut,
    text: () => Promise.resolve(corps === undefined ? '' : JSON.stringify(corps)),
  }) as Response;

const erreur = (statut: number, code: string): Response =>
  reponse(statut, { error: { code, message: code, requestId: 't', timestamp: 't' } });

interface Appel {
  url: string;
  init: RequestInit;
}

class FauxServeur {
  /** Magasin de cookies du navigateur, partagé entre onglets. */
  cookie: string | null = 'rt-0';
  private dejaServis = new Set<string>();
  private compteur = 0;
  appels: Appel[] = [];
  /** Jeton d'accès accepté par les routes protégées. */
  jetonValide: string | null = null;
  reponseDeconnexion: Response | null = null;

  fetch = jest.fn(async (url: string, init: RequestInit): Promise<Response> => {
    this.appels.push({ url, init });
    // Le navigateur joint le cookie AU MOMENT de l'envoi, et seulement si
    // l'appel le demande.
    const envoye = init.credentials === 'include' ? this.cookie : null;
    // Latence réseau : c'est elle qui ouvre la course entre deux onglets.
    await new Promise((resoudre) => setTimeout(resoudre, 5));

    if (url.endsWith('/auth/refresh')) return this.rafraichir(envoye);
    if (url.endsWith('/auth/otp/verify')) {
      this.cookie = 'rt-0';
      return reponse(201, this.session('acces-0'));
    }

    const entetes = init.headers as Record<string, string>;
    if (entetes.Authorization !== `Bearer ${this.jetonValide}`) {
      return erreur(401, 'AUTH_TOKEN_EXPIRED');
    }
    if (url.endsWith('/auth/logout')) {
      if (this.reponseDeconnexion !== null) return this.reponseDeconnexion;
      this.cookie = null;
      return reponse(204, undefined);
    }
    return reponse(200, { ok: true });
  });

  private rafraichir(envoye: string | null): Response {
    if (envoye === null) return erreur(401, 'AUTH_TOKEN_EXPIRED');
    if (this.dejaServis.has(envoye)) {
      // Réutilisation : toute la famille est révoquée, le cookie effacé.
      this.cookie = null;
      return erreur(401, 'AUTH_TOKEN_REUSED');
    }
    this.dejaServis.add(envoye);
    this.compteur += 1;
    this.cookie = `rt-${this.compteur}`;
    this.jetonValide = `acces-${this.compteur}`;
    return reponse(201, this.session(this.jetonValide));
  }

  private session(accessToken: string): Record<string, unknown> {
    return {
      accessToken,
      expiresIn: 900,
      userId: 'u1',
      accountStatus: 'ACTIVE',
      verificationStatus: 'NOT_STARTED',
    };
  }

  appelsVers(fin: string): Appel[] {
    return this.appels.filter((appel) => appel.url.endsWith(fin));
  }
}

/** Verrou du navigateur, partagé entre onglets : une file d'attente par nom. */
function installerVerrous(): void {
  const files = new Map<string, Promise<unknown>>();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (nom: string, travail: () => Promise<unknown>) => {
        const precedent = files.get(nom) ?? Promise.resolve();
        const suivant = precedent.then(travail, travail);
        files.set(
          nom,
          suivant.catch(() => undefined),
        );
        return suivant;
      },
    },
  });
}

function retirerVerrous(): void {
  Reflect.deleteProperty(navigator, 'locks');
}

let serveur: FauxServeur;

beforeEach(() => {
  serveur = new FauxServeur();
  global.fetch = serveur.fetch as unknown as typeof fetch;
  retirerVerrous();
});

describe('validerCode', () => {
  it('demande les cookies, sinon le navigateur ignorerait le Set-Cookie', async () => {
    const onglet = ouvrirOnglet();
    const session = await onglet.validerCode('defi-1', '123456');

    expect(serveur.appelsVers('/auth/otp/verify')[0]?.init.credentials).toBe('include');
    expect(session.accessToken).toBe('acces-0');
    expect(onglet.jetonDAcces()).toBe('acces-0');
  });
});

describe('restaurerSession', () => {
  it('obtient un jeton d’accès neuf à partir du seul cookie', async () => {
    const onglet = ouvrirOnglet();
    const session = await onglet.restaurerSession();

    expect(session?.accessToken).toBe('acces-1');
    expect(onglet.jetonDAcces()).toBe('acces-1');
    const [appel] = serveur.appelsVers('/auth/refresh');
    expect(appel?.init.credentials).toBe('include');
    // Corps JSON vide : impose le contrôle CORS préalable.
    expect(appel?.init.body).toBe('{}');
  });

  it('rend null, sans lever, quand il n’y a pas de session', async () => {
    serveur.cookie = null;
    expect(await ouvrirOnglet().restaurerSession()).toBeNull();
  });

  it('dans un onglet, des appels simultanés ne partent qu’UNE fois', async () => {
    // Le mode strict de React exécute deux fois les effets : sans ce partage,
    // le second appel présenterait un jeton déjà servi.
    const onglet = ouvrirOnglet();
    const [a, b] = await Promise.all([onglet.restaurerSession(), onglet.restaurerSession()]);

    expect(serveur.appelsVers('/auth/refresh')).toHaveLength(1);
    expect(a).toEqual(b);
  });

  it('entre deux onglets, le verrou du navigateur évite la révocation', async () => {
    installerVerrous();
    const [premier, second] = [ouvrirOnglet(), ouvrirOnglet()];

    const [a, b] = await Promise.all([premier.restaurerSession(), second.restaurerSession()]);

    // Le second onglet a attendu le NOUVEAU cookie : aucun jeton resservi.
    expect(a?.accessToken).toBe('acces-1');
    expect(b?.accessToken).toBe('acces-2');
    expect(serveur.cookie).toBe('rt-2');
  });

  it('sans verrou du navigateur, la course révoque la session — limite connue', async () => {
    // Ce test documente la réserve énoncée dans lib/auth.ts : il échouerait le
    // jour où un autre mécanisme couvrirait les navigateurs anciens.
    const [premier, second] = [ouvrirOnglet(), ouvrirOnglet()];

    const resultats = await Promise.allSettled([
      premier.restaurerSession(),
      second.restaurerSession(),
    ]);

    const refus = resultats.find(
      (resultat): resultat is PromiseRejectedResult => resultat.status === 'rejected',
    );
    expect(refus?.reason).toMatchObject({
      code: 'AUTH_TOKEN_REUSED',
    });
  });

  it('jeton réutilisé : ferme la session et transmet le motif à l’écran', async () => {
    const onglet = ouvrirOnglet();
    onglet.ouvrirSession({
      accessToken: 'ancien',
      expiresIn: 900,
      userId: 'u1',
      accountStatus: 'ACTIVE',
      verificationStatus: 'NOT_STARTED',
    });
    serveur.fetch.mockImplementationOnce(() => Promise.resolve(erreur(401, 'AUTH_TOKEN_REUSED')));

    await expect(onglet.restaurerSession()).rejects.toMatchObject({ code: 'AUTH_TOKEN_REUSED' });
    expect(onglet.jetonDAcces()).toBeNull();
  });

  it('réseau coupé : NE ferme PAS la session, qui est peut-être intacte', async () => {
    const onglet = ouvrirOnglet();
    onglet.ouvrirSession({
      accessToken: 'courant',
      expiresIn: 900,
      userId: 'u1',
      accountStatus: 'ACTIVE',
      verificationStatus: 'NOT_STARTED',
    });
    serveur.fetch.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));

    const echec = (await onglet.restaurerSession().catch((cause: unknown) => cause)) as ApiError;
    expect(echec.injoignable).toBe(true);
    expect(onglet.jetonDAcces()).toBe('courant');
  });

  it('panne serveur (500) : NE ferme PAS la session non plus', async () => {
    const onglet = ouvrirOnglet();
    onglet.ouvrirSession({
      accessToken: 'courant',
      expiresIn: 900,
      userId: 'u1',
      accountStatus: 'ACTIVE',
      verificationStatus: 'NOT_STARTED',
    });
    serveur.fetch.mockImplementationOnce(() => Promise.resolve(erreur(500, 'INTERNAL_ERROR')));

    await expect(onglet.restaurerSession()).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(onglet.jetonDAcces()).toBe('courant');
  });
});

describe('appelerAuthentifie', () => {
  it('page rechargée : restaure la session puis appelle', async () => {
    const onglet = ouvrirOnglet();
    expect(await onglet.appelerAuthentifie('/auth/me')).toEqual({ ok: true });

    const appel = serveur.appelsVers('/auth/me')[0];
    expect((appel?.init.headers as Record<string, string>).Authorization).toBe('Bearer acces-1');
    // Les routes métier ne reçoivent jamais le cookie.
    expect(appel?.init.credentials).toBe('omit');
  });

  it('jeton d’accès expiré : rafraîchit et rejoue UNE fois', async () => {
    const onglet = ouvrirOnglet();
    onglet.ouvrirSession({
      accessToken: 'perime',
      expiresIn: 900,
      userId: 'u1',
      accountStatus: 'ACTIVE',
      verificationStatus: 'NOT_STARTED',
    });

    expect(await onglet.appelerAuthentifie('/auth/me')).toEqual({ ok: true });
    expect(serveur.appelsVers('/auth/me')).toHaveLength(2);
    expect(serveur.appelsVers('/auth/refresh')).toHaveLength(1);
  });

  it('sans session du tout : AUTH_TOKEN_EXPIRED, sans appeler la route', async () => {
    serveur.cookie = null;
    await expect(ouvrirOnglet().appelerAuthentifie('/auth/me')).rejects.toMatchObject({
      code: 'AUTH_TOKEN_EXPIRED',
    });
    expect(serveur.appelsVers('/auth/me')).toHaveLength(0);
  });
});

describe('deconnecter', () => {
  it('révoque côté serveur, avec les cookies pour que l’effacement soit appliqué', async () => {
    const onglet = ouvrirOnglet();
    await onglet.restaurerSession();
    await onglet.deconnecter();

    expect(serveur.appelsVers('/auth/logout')[0]?.init.credentials).toBe('include');
    expect(serveur.cookie).toBeNull();
    expect(onglet.jetonDAcces()).toBeNull();
  });

  it('si la révocation échoue, la session reste ouverte et l’erreur remonte', async () => {
    const onglet = ouvrirOnglet();
    await onglet.restaurerSession();
    serveur.reponseDeconnexion = erreur(500, 'INTERNAL_ERROR');

    await expect(onglet.deconnecter()).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(onglet.jetonDAcces()).toBe('acces-1');
  });

  it('sans session, ne lève rien : le résultat voulu est déjà atteint', async () => {
    serveur.cookie = null;
    await expect(ouvrirOnglet().deconnecter()).resolves.toBeUndefined();
  });
});
