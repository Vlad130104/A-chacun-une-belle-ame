'use client';

/**
 * Session côté navigateur (story F-02).
 *
 * **Plus aucun jeton dans un stockage lisible par JavaScript.**
 *
 *  - Le jeton de RAFRAÎCHISSEMENT (30 jours) est posé par l'API dans un cookie
 *    `httpOnly`. Ce module ne le voit jamais, ne le lit jamais, ne l'écrit
 *    jamais : un script injecté ne peut donc pas l'emporter.
 *  - Le jeton d'ACCÈS (15 minutes) vit dans la mémoire du module. Il disparaît
 *    au rechargement de la page ; `restaurerSession()` (lib/auth.ts) en obtient
 *    alors un nouveau grâce au cookie.
 *
 * Ce qui reste vrai, dit franchement : un script injecté qui s'exécute DANS la
 * page peut toujours utiliser le jeton d'accès tant qu'elle est ouverte. Le
 * cookie empêche le vol du jeton de longue durée, pas l'abus en direct. La
 * défense contre l'injection elle-même reste l'échappement et la politique de
 * sécurité du contenu.
 */

/** En mémoire seulement : rien ne l'écrit sur disque. */
let courante: Session | null = null;

/** Ce que l'API rend à un navigateur : jamais de jeton de rafraîchissement. */
export interface Session {
  accessToken: string;
  expiresIn: number;
  userId: string;
  accountStatus: string;
  verificationStatus: string;
}

export function ouvrirSession(session: Session): void {
  courante = session;
}

export function sessionCourante(): Session | null {
  return courante;
}

export function jetonDAcces(): string | null {
  return courante?.accessToken ?? null;
}

/**
 * Oublie la session en mémoire.
 *
 * N'appelle pas l'API : la révocation côté serveur, et l'effacement du cookie
 * qui l'accompagne, passent par `deconnecter()` (lib/auth.ts), qui doit réussir
 * ou échouer visiblement. Oublier le jeton ici pendant que la session reste
 * valide en base donnerait l'illusion d'une déconnexion.
 */
export function fermerSession(): void {
  courante = null;
}
