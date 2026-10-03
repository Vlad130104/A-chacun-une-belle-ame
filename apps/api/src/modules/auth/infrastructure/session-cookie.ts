import { ErrorCode } from '@acuba/contracts';
import type { CookieOptions, Request, Response } from 'express';
import { BusinessError } from '../../../common/errors/business.error';
import type { Env } from '../../../config/env.schema';

/**
 * Transport du jeton de rafraîchissement en cookie `httpOnly` (story F-02).
 *
 * **Pourquoi.** Jusqu'ici, l'API rendait le jeton de rafraîchissement dans le
 * corps de la réponse, et le navigateur devait le ranger dans un emplacement
 * lisible par JavaScript. Un script injecté (faille XSS, extension malveillante)
 * pouvait alors l'exfiltrer et ouvrir des sessions pendant trente jours depuis
 * n'importe quelle machine. Un cookie `httpOnly` n'est lisible par AUCUN script :
 * le navigateur le présente, il ne le montre pas.
 *
 * **Ce que cela ne résout pas, dit franchement.** Un script injecté peut toujours
 * AGIR depuis la page tant qu'elle est ouverte — appeler l'API avec le jeton
 * d'accès en mémoire, ou déclencher un rafraîchissement. Ce qu'il ne peut plus,
 * c'est EMPORTER le jeton de longue durée. La défense contre l'injection
 * elle-même reste la politique de sécurité du contenu et l'échappement.
 *
 * **Trois restrictions, chacune pour une raison.**
 *  - `Path` limité aux routes d'authentification : le jeton n'accompagne pas
 *    chaque requête de messagerie ou de photo, et n'apparaît donc dans aucun
 *    journal d'accès de ces routes.
 *  - `SameSite` configurable, `Strict` par défaut. Voir la réserve
 *    d'hébergement dans `docs/15-hebergement.md` : `Strict` suppose que le site
 *    et l'API partagent un domaine enregistrable.
 *  - Préfixe `__Secure-` dès que `Secure` est actif : le navigateur refuse
 *    alors qu'un sous-domaine compromis ou une page en HTTP écrase le cookie.
 *
 * **Protection CSRF.** Toute route qui POSE ou LIT ce cookie exige un en-tête
 * `Origin` présent et déclaré dans `CORS_ALLOWED_ORIGINS`. Un navigateur envoie
 * toujours `Origin` sur un `POST` ; un site tiers ne peut pas le falsifier. Les
 * autres routes de l'API n'ont pas besoin de cette protection : elles exigent
 * l'en-tête `Authorization`, qu'un site tiers ne peut pas faire ajouter.
 *
 * Le transport par corps reste disponible pour l'application mobile, qui range
 * le jeton dans le trousseau chiffré du système et n'a pas de cookies.
 */

export interface SessionCookieConfig {
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  /** `null` : cookie attaché au seul hôte de l'API — le plus restrictif. */
  domain: string | null;
  /** Chemin des routes d'authentification, préfixe global compris. */
  path: string;
  maxAgeSeconds: number;
  allowedOrigins: readonly string[];
}

export const SESSION_COOKIE_BASE_NAME = 'acuba_rt';

type EnvCookie = Pick<
  Env,
  | 'API_GLOBAL_PREFIX'
  | 'CORS_ALLOWED_ORIGINS'
  | 'REFRESH_TOKEN_TTL_DAYS'
  | 'SESSION_COOKIE_SAMESITE'
  | 'SESSION_COOKIE_SECURE'
  | 'SESSION_COOKIE_DOMAIN'
>;

export function sessionCookieConfigFrom(env: EnvCookie): SessionCookieConfig {
  const prefixe = env.API_GLOBAL_PREFIX.replace(/^\/+|\/+$/g, '');
  return {
    secure: env.SESSION_COOKIE_SECURE,
    sameSite: env.SESSION_COOKIE_SAMESITE,
    domain: env.SESSION_COOKIE_DOMAIN.trim() === '' ? null : env.SESSION_COOKIE_DOMAIN.trim(),
    path: prefixe === '' ? '/auth' : `/${prefixe}/auth`,
    maxAgeSeconds: env.REFRESH_TOKEN_TTL_DAYS * 86_400,
    allowedOrigins: parseOrigins(env.CORS_ALLOWED_ORIGINS),
  };
}

export function parseOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export class SessionCookie {
  readonly name: string;

  constructor(private readonly config: SessionCookieConfig) {
    this.name = config.secure ? `__Secure-${SESSION_COOKIE_BASE_NAME}` : SESSION_COOKIE_BASE_NAME;
  }

  poser(response: Response, refreshToken: string): void {
    response.cookie(this.name, refreshToken, {
      ...this.attributs(),
      // `maxAge` en millisecondes côté Express ; il pose aussi `Expires` pour
      // les navigateurs anciens.
      maxAge: this.config.maxAgeSeconds * 1000,
    });
  }

  /**
   * Efface le cookie. Les attributs doivent être IDENTIQUES à ceux de la pose :
   * un `Path` ou un `Domain` différent viserait un autre cookie, et celui-ci
   * resterait en place sans qu'aucune erreur ne le signale.
   */
  effacer(response: Response): void {
    response.clearCookie(this.name, this.attributs());
  }

  lire(request: Request): string | null {
    const brut = request.headers.cookie;
    if (typeof brut !== 'string' || brut.length === 0) return null;

    for (const morceau of brut.split(';')) {
      const separateur = morceau.indexOf('=');
      if (separateur === -1) continue;
      if (morceau.slice(0, separateur).trim() !== this.name) continue;

      const valeur = morceau.slice(separateur + 1).trim();
      try {
        const decodee = decodeURIComponent(valeur);
        return decodee.length > 0 ? decodee : null;
      } catch {
        // Encodage invalide : on traite comme absent plutôt que de lever une
        // erreur interne — le résultat pour la personne est le même.
        return null;
      }
    }
    return null;
  }

  /**
   * Refuse une requête dont l'origine n'est pas déclarée.
   *
   * L'absence d'`Origin` est un refus, pas une tolérance : un navigateur
   * l'envoie toujours sur un `POST`, donc seule une requête hors navigateur en
   * est dépourvue — et celle-ci doit utiliser le transport par corps.
   */
  exigerOrigineAutorisee(request: Request): void {
    const origine = request.headers.origin;
    if (typeof origine !== 'string' || !this.config.allowedOrigins.includes(origine)) {
      throw BusinessError.forbidden(ErrorCode.AUTH_FORBIDDEN);
    }
  }

  private attributs(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.secure,
      sameSite: this.config.sameSite,
      path: this.config.path,
      ...(this.config.domain === null ? {} : { domain: this.config.domain }),
    };
  }
}
