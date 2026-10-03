import { ErrorCode } from '@acuba/contracts';
import { ApiError, appelerApi, type RequeteOptions } from './api-client';
import { fermerSession, jetonDAcces, ouvrirSession, type Session } from './session';

/**
 * Appels d'authentification (tranche F1).
 *
 * Aucune règle métier ici : l'âge, l'unicité du numéro et la validité du code
 * sont décidés **par le serveur**. Le client se contente de présenter la
 * réponse. Toute vérification faite ici serait un confort d'affichage, jamais
 * une garantie — un formulaire se contourne avec deux lignes de console.
 */

export interface DemandeInscription {
  phoneE164: string;
  birthDate: string;
  gender: 'FEMALE' | 'MALE';
  inviteCode?: string;
  consents: Array<{ type: string; documentVersion: string; granted: boolean }>;
}

export interface DefiOtp {
  challengeId: string;
  expiresAt: string;
  resendAvailableAt: string;
  /** Vrai tant que l'envoi de SMS est simulé : l'interface DOIT le dire. */
  testMode: boolean;
}

export function inscrire(demande: DemandeInscription): Promise<DefiOtp> {
  return appelerApi<DefiOtp>('/auth/register', {
    method: 'POST',
    body: {
      ...demande,
      device: { type: 'WEB' as const },
    },
  });
}

/**
 * Valide le code et ouvre la session.
 *
 * L'API pose le jeton de rafraîchissement en cookie `httpOnly` et ne rend que
 * le jeton d'accès (story F-02). `avecCookies` est indispensable : sans lui, le
 * navigateur IGNORE le `Set-Cookie` d'une réponse venant d'une autre origine,
 * et la session ne survivrait pas au premier rechargement.
 */
export async function validerCode(challengeId: string, code: string): Promise<Session> {
  const session = await appelerApi<Session>('/auth/otp/verify', {
    method: 'POST',
    body: { challengeId, code, device: { type: 'WEB' as const } },
    avecCookies: true,
  });
  ouvrirSession(session);
  return session;
}

// ── Restauration de la session ───────────────────────────────────────────────

/** Rafraîchissement en cours dans CET onglet : un seul à la fois. */
let enCours: Promise<Session | null> | null = null;

/**
 * Obtient un jeton d'accès neuf à partir du cookie de session.
 *
 * Rend `null` s'il n'y a pas de session (cookie absent ou expiré). Lève une
 * `ApiError` dans les autres cas, pour que l'écran puisse dire POURQUOI :
 * « fermée par sécurité » (jeton réutilisé), « compte suspendu », ou « réseau
 * indisponible » — ce dernier cas, comme une panne serveur, ne ferme PAS la
 * session, qui est peut-être intacte.
 *
 * **Un seul rafraîchissement à la fois, y compris entre onglets.** Le jeton de
 * rafraîchissement est à usage unique, et le serveur révoque TOUTE la famille
 * de sessions s'il le voit resservir (vol présumé, ADR-005). Deux onglets
 * rechargés ensemble enverraient le même cookie : le second serait pris pour
 * un voleur, et la personne déconnectée partout. Le mode strict de React, qui
 * exécute deux fois les effets en développement, produirait la même chose.
 *
 *  - dans un onglet, les appels concurrents partagent la même promesse ;
 *  - entre onglets, le verrou du navigateur (`navigator.locks`) les sérialise :
 *    le second onglet n'envoie sa requête qu'après que le premier a reçu le
 *    NOUVEAU cookie, qu'il présente donc à son tour.
 *
 * Réserve : sans `navigator.locks` (navigateurs antérieurs à 2022), seule la
 * protection dans l'onglet s'applique.
 */
export function restaurerSession(): Promise<Session | null> {
  enCours ??= sousVerrou(rafraichir).finally(() => {
    enCours = null;
  });
  return enCours;
}

async function rafraichir(): Promise<Session | null> {
  try {
    const session = await appelerApi<Session>('/auth/refresh', {
      method: 'POST',
      // Corps JSON vide plutôt qu'absent : il impose une requête de contrôle
      // CORS préalable, qu'un formulaire tiers ne peut pas produire.
      body: {},
      avecCookies: true,
    });
    ouvrirSession(session);
    return session;
  } catch (cause) {
    // Seul un REFUS (401, 403) ferme la session ; le serveur a alors déjà
    // effacé le cookie. Un réseau coupé ou une panne serveur (5xx) ne dit rien
    // de la session, qui est peut-être intacte : on la garde.
    if (cause instanceof ApiError && (cause.httpStatus === 401 || cause.httpStatus === 403)) {
      fermerSession();
      if (cause.code === ErrorCode.AUTH_TOKEN_EXPIRED) return null;
    }
    throw cause;
  }
}

const NOM_DU_VERROU = 'acuba.session.rafraichissement';

function sousVerrou<T>(travail: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) return travail();
  return navigator.locks.request(NOM_DU_VERROU, travail);
}

// ── Appels authentifiés ─────────────────────────────────────────────────────

/**
 * Appelle une route protégée avec le jeton d'accès courant.
 *
 * Si le jeton manque (page rechargée) ou a expiré (15 minutes), la session est
 * restaurée par le cookie et l'appel rejoué UNE fois. Le rejeu est sûr même
 * pour un `POST` : un 401 est rendu par le garde d'authentification, avant
 * toute exécution du cas d'usage.
 */
export async function appelerAuthentifie<T>(
  chemin: string,
  options: Omit<RequeteOptions, 'accessToken'> = {},
): Promise<T> {
  const jeton = jetonDAcces() ?? (await restaurerSession())?.accessToken ?? null;
  if (jeton === null) throw new ApiError(ErrorCode.AUTH_TOKEN_EXPIRED, 401);

  try {
    return await appelerApi<T>(chemin, { ...options, accessToken: jeton });
  } catch (cause) {
    if (!(cause instanceof ApiError) || cause.code !== ErrorCode.AUTH_TOKEN_EXPIRED) throw cause;
  }

  fermerSession();
  const renouvelee = await restaurerSession();
  if (renouvelee === null) throw new ApiError(ErrorCode.AUTH_TOKEN_EXPIRED, 401);
  return appelerApi<T>(chemin, { ...options, accessToken: renouvelee.accessToken });
}

/**
 * Déconnecte cet appareil : révocation en base, PUIS effacement du cookie par
 * le serveur, PUIS oubli local. Si la révocation échoue, l'erreur remonte et la
 * session reste ouverte — mieux vaut un échec visible qu'une fausse
 * déconnexion sur un téléphone partagé.
 */
export async function deconnecter(): Promise<void> {
  try {
    await appelerAuthentifie<null>('/auth/logout', { method: 'POST', avecCookies: true });
  } catch (cause) {
    // Aucune session à fermer : le résultat voulu est déjà atteint.
    if (!(cause instanceof ApiError) || cause.code !== ErrorCode.AUTH_TOKEN_EXPIRED) throw cause;
  }
  fermerSession();
}
