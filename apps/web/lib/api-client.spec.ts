import { ApiError, appelerApi } from './api-client';

/**
 * Tests du client API.
 *
 * Ils portent sur la traduction des réponses, pas sur le réseau : ce qui compte
 * est qu'une réponse hors contrat ne fasse jamais planter un écran, et qu'un
 * refus métier reste distinguable d'une panne de réseau.
 */

/** `texteBrut` sert à simuler une réponse hors contrat, non analysable. */
const reponse = (statut: number, corps: unknown, texteBrut?: string): Response =>
  ({
    ok: statut >= 200 && statut < 300,
    status: statut,
    text: () => Promise.resolve(texteBrut ?? (corps === undefined ? '' : JSON.stringify(corps))),
  }) as Response;

const attendreErreur = async (promesse: Promise<unknown>): Promise<ApiError> => {
  try {
    await promesse;
  } catch (cause) {
    if (cause instanceof ApiError) return cause;
    throw cause;
  }
  throw new Error('Une ApiError était attendue.');
};

const appelsFetch: Array<[string, RequestInit]> = [];

function repondre(valeur: Response | Error): void {
  global.fetch = jest.fn((url: string, init: RequestInit) => {
    appelsFetch.push([url, init]);
    return valeur instanceof Error ? Promise.reject(valeur) : Promise.resolve(valeur);
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  appelsFetch.length = 0;
});

describe('réponses en succès', () => {
  it('rend le corps analysé', async () => {
    repondre(reponse(200, { challengeId: 'defi-1' }));
    expect(await appelerApi('/auth/register', { method: 'POST', body: {} })).toEqual({
      challengeId: 'defi-1',
    });
  });

  it('supporte une réponse vide sans échouer', async () => {
    repondre(reponse(204, undefined));
    expect(await appelerApi('/auth/logout', { method: 'POST' })).toBeNull();
  });
});

describe('erreurs métier', () => {
  it('conserve le CODE de l’API, pas seulement le message', async () => {
    // C'est le code qui pilote l'écran ; un message peut changer de formulation
    // sans préavis, un code ne le peut pas (contrat public de l'API).
    repondre(reponse(403, { code: 'AUTH_UNDERAGE' }));
    const erreur = await attendreErreur(appelerApi('/auth/register', { method: 'POST', body: {} }));

    expect(erreur.code).toBe('AUTH_UNDERAGE');
    expect(erreur.httpStatus).toBe(403);
  });

  it('lit aussi un code imbriqué sous « error »', async () => {
    repondre(reponse(409, { error: { code: 'AUTH_PHONE_ALREADY_USED' } }));
    expect((await attendreErreur(appelerApi('/x'))).code).toBe('AUTH_PHONE_ALREADY_USED');
  });

  it('transmet les détails, comme le nombre d’essais restants', async () => {
    repondre(reponse(401, { code: 'AUTH_OTP_INVALID', details: { essaisRestants: 3 } }));
    expect((await attendreErreur(appelerApi('/x'))).details).toEqual({ essaisRestants: 3 });
  });

  it('rend un message FRANÇAIS pour un code connu', async () => {
    repondre(reponse(403, { code: 'AUTH_UNDERAGE' }));
    expect((await attendreErreur(appelerApi('/x'))).message.length).toBeGreaterThan(10);
  });
});

describe('réponses hors contrat', () => {
  it('ne PLANTE pas sur un corps non analysable', async () => {
    // Une passerelle qui renvoie du HTML sur une erreur 502 ne doit pas casser
    // l'écran : le statut reste exploitable.
    // Une passerelle qui répond en HTML là où l'API répondrait en JSON.
    repondre(reponse(502, undefined, '<html>Bad Gateway</html>'));

    expect((await attendreErreur(appelerApi('/x'))).code).toBe('INTERNAL_ERROR');
  });

  it.each([
    [401, 'AUTH_TOKEN_EXPIRED'],
    [403, 'AUTH_FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [429, 'RATE_LIMITED'],
  ])('déduit un code cohérent du statut %s', async (statut, attendu) => {
    repondre(reponse(statut, {}));
    expect((await attendreErreur(appelerApi('/x'))).code).toBe(attendu);
  });
});

describe('réseau indisponible', () => {
  it('DISTINGUE une panne de réseau d’un refus métier', async () => {
    // L'action à proposer n'est pas la même : réessayer, ou corriger sa saisie.
    repondre(new TypeError('Failed to fetch'));
    const erreur = await attendreErreur(appelerApi('/x'));

    expect(erreur.injoignable).toBe(true);
    expect(erreur.message).toMatch(/réseau/i);
  });
});

describe('en-têtes de la requête', () => {
  it('n’envoie AUCUN cookie', async () => {
    // La session passe par l'en-tête Authorization : envoyer les cookies
    // ouvrirait une surface CSRF sans contrepartie.
    repondre(reponse(200, {}));
    await appelerApi('/x');

    expect(appelsFetch[0]?.[1].credentials).toBe('omit');
  });

  it('n’ajoute d’en-tête d’autorisation QUE si un jeton est fourni', async () => {
    repondre(reponse(200, {}));
    await appelerApi('/x');
    expect((appelsFetch[0]?.[1].headers as Record<string, string>).Authorization).toBeUndefined();

    await appelerApi('/x', { accessToken: 'jeton-1' });
    expect((appelsFetch[1]?.[1].headers as Record<string, string>).Authorization).toBe(
      'Bearer jeton-1',
    );
  });

  it('interrompt une requête qui n’aboutit pas', async () => {
    // Sans échéance, l'écran reste figé sur un réseau dégradé et la personne
    // appuie plusieurs fois — ce qui envoie plusieurs inscriptions.
    repondre(reponse(200, {}));
    await appelerApi('/x');

    expect(appelsFetch[0]?.[1].signal).toBeDefined();
  });
});
