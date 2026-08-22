'use client';

/**
 * Conservation de la session côté navigateur (tranche F1).
 *
 * **Réserve de sécurité, énoncée franchement.** Le jeton de rafraîchissement est
 * rendu par l'API dans le corps de la réponse, et doit bien être conservé
 * quelque part côté client. Tout emplacement accessible au JavaScript — dont
 * `sessionStorage` — est lisible par un script injecté en cas de faille XSS.
 *
 * Deux choix limitent la portée du problème sans le résoudre :
 *
 *  - le jeton d'ACCÈS ne quitte jamais la mémoire du module. Il n'est écrit
 *    dans aucun stockage, donc il disparaît à la fermeture de l'onglet et ne se
 *    retrouve pas dans une sauvegarde de navigateur ;
 *  - le jeton de RAFRAÎCHISSEMENT va dans `sessionStorage`, pas dans
 *    `localStorage` : il meurt avec l'onglet au lieu de survivre des semaines
 *    sur un téléphone partagé — situation courante dans les pays visés.
 *
 * La vraie correction est un cookie `httpOnly` posé par l'API, inaccessible au
 * JavaScript. Elle suppose une modification côté serveur et une protection
 * CSRF ; elle n'est donc pas dans cette tranche.
 *
 * TODO(F-02) : émettre la session en cookie `httpOnly` + `SameSite=Strict`.
 */

const CLE_RAFRAICHISSEMENT = 'acuba.refresh';

/** En mémoire seulement : rien ne l'écrit sur disque. */
let jetonAcces: string | null = null;

export interface Session {
  accessToken: string;
  refreshToken: string;
  userId: string;
  accountStatus: string;
  verificationStatus: string;
}

export function ouvrirSession(session: Session): void {
  jetonAcces = session.accessToken;
  ecrire(CLE_RAFRAICHISSEMENT, session.refreshToken);
}

export function jetonDAcces(): string | null {
  return jetonAcces;
}

export function jetonDeRafraichissement(): string | null {
  return lire(CLE_RAFRAICHISSEMENT);
}

/**
 * Ferme la session localement.
 *
 * Elle n'appelle pas l'API : la révocation côté serveur est une action
 * distincte, qui doit réussir ou échouer visiblement. Effacer le jeton ici
 * pendant qu'il reste valide en base donnerait l'illusion d'une déconnexion.
 */
export function fermerSession(): void {
  jetonAcces = null;
  effacer(CLE_RAFRAICHISSEMENT);
}

// ── Accès au stockage, tolérants ────────────────────────────────────────────
//
// `sessionStorage` lève une exception en navigation privée sur certains
// navigateurs, et n'existe pas pendant le rendu serveur. Un accès non protégé
// ferait planter la page entière pour une commodité.

function ecrire(cle: string, valeur: string): void {
  try {
    window.sessionStorage.setItem(cle, valeur);
  } catch {
    // Sans stockage, la session vit le temps de la page. C'est dégradé, pas cassé.
  }
}

function lire(cle: string): string | null {
  try {
    return window.sessionStorage.getItem(cle);
  } catch {
    return null;
  }
}

function effacer(cle: string): void {
  try {
    window.sessionStorage.removeItem(cle);
  } catch {
    // Rien à faire : il n'y avait rien à effacer.
  }
}
