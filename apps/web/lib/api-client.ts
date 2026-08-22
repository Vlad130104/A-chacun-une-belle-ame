import { ErrorCode, ERROR_MESSAGES_FR } from '@acuba/contracts';

/**
 * Client de l'API — socle de la tranche F1.
 *
 * Trois partis pris, qui viennent tous de la même contrainte : l'application
 * doit rester utilisable sur un réseau lent et un téléphone d'entrée de gamme.
 *
 *  1. `fetch` natif, aucune bibliothèque cliente. Un client HTTP tiers pèse
 *     plusieurs dizaines de kilo-octets pour un service que la plateforme rend
 *     déjà.
 *  2. **Une échéance explicite.** Sans elle, une requête sur un réseau mobile
 *     dégradé reste en attente indéfiniment et l'écran paraît figé — le membre
 *     appuie alors plusieurs fois, ce qui envoie plusieurs inscriptions.
 *  3. Les erreurs métier de l'API sont converties en une erreur typée portant
 *     le **code**, jamais un simple message. C'est le code qui pilote l'écran ;
 *     le message n'est qu'un repli.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

/** Au-delà, on rend la main au membre plutôt que de le laisser devant un écran figé. */
const DELAI_MS = 15_000;

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(messageDe(code));
    this.name = 'ApiError';
  }

  /** Vrai quand le réseau ou le serveur n'a pas répondu — distinct d'un refus métier. */
  get injoignable(): boolean {
    return this.code === 'NETWORK_UNAVAILABLE';
  }
}

function messageDe(code: string): string {
  if (code === 'NETWORK_UNAVAILABLE') {
    return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
  }
  const connus = ERROR_MESSAGES_FR as Record<string, string | undefined>;
  return connus[code] ?? 'Une erreur est survenue. Réessayez dans un instant.';
}

interface ReponseErreur {
  code?: unknown;
  error?: { code?: unknown; details?: unknown };
  details?: unknown;
}

/** Le corps d'erreur vient du réseau : on ne lui fait aucune confiance de forme. */
function extraireCode(corps: unknown, statut: number): string {
  if (typeof corps === 'object' && corps !== null) {
    const reponse = corps as ReponseErreur;
    const direct = reponse.code;
    if (typeof direct === 'string') return direct;

    const imbrique = reponse.error?.code;
    if (typeof imbrique === 'string') return imbrique;
  }

  // Un serveur qui répond hors contrat ne doit pas faire planter l'écran : on
  // retombe sur un code générique cohérent avec le statut HTTP.
  if (statut === 401) return ErrorCode.AUTH_TOKEN_EXPIRED;
  if (statut === 403) return ErrorCode.AUTH_FORBIDDEN;
  if (statut === 404) return ErrorCode.NOT_FOUND;
  if (statut === 429) return ErrorCode.RATE_LIMITED;
  return ErrorCode.INTERNAL_ERROR;
}

function extraireDetails(corps: unknown): Record<string, unknown> | undefined {
  if (typeof corps !== 'object' || corps === null) return undefined;
  const reponse = corps as ReponseErreur;
  const brut = reponse.details ?? reponse.error?.details;
  return typeof brut === 'object' && brut !== null ? (brut as Record<string, unknown>) : undefined;
}

export interface RequeteOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Jeton d'accès. Fourni explicitement : le client ne lit aucun stockage. */
  accessToken?: string | null;
  signal?: AbortSignal;
}

/**
 * Appelle l'API et rend le corps analysé, ou lève une `ApiError`.
 *
 * Le client ne lit **aucun stockage** de lui-même : le jeton lui est passé. Un
 * client qui irait chercher la session tout seul serait impossible à tester
 * sans navigateur, et rendrait invisible le fait qu'une requête est
 * authentifiée.
 */
export async function appelerApi<T>(chemin: string, options: RequeteOptions = {}): Promise<T> {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI_MS);

  // L'échéance interne et l'annulation de l'appelant doivent toutes deux
  // interrompre la requête.
  options.signal?.addEventListener('abort', () => controleur.abort(), { once: true });

  const entetes: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) entetes['Content-Type'] = 'application/json';
  if (options.accessToken) entetes.Authorization = `Bearer ${options.accessToken}`;

  let reponse: Response;
  try {
    reponse = await fetch(`${BASE_URL}${chemin}`, {
      method: options.method ?? 'GET',
      headers: entetes,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: controleur.signal,
      // Aucun cookie : la session passe par l'en-tête Authorization. Envoyer les
      // cookies ouvrirait une surface CSRF sans contrepartie.
      credentials: 'omit',
    });
  } catch {
    // Réseau coupé, DNS, échéance dépassée : indistincts pour le membre, et
    // c'est très bien — l'action à faire est la même, réessayer.
    throw new ApiError('NETWORK_UNAVAILABLE', 0);
  } finally {
    clearTimeout(minuteur);
  }

  const texte = await reponse.text();
  const corps: unknown = texte.length === 0 ? null : sansEchec(texte);

  if (!reponse.ok) {
    throw new ApiError(extraireCode(corps, reponse.status), reponse.status, extraireDetails(corps));
  }

  return corps as T;
}

/** Un corps non analysable ne doit pas masquer le statut HTTP réel. */
function sansEchec(texte: string): unknown {
  try {
    return JSON.parse(texte);
  } catch {
    return null;
  }
}
