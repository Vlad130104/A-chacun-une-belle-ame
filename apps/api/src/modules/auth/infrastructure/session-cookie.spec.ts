import { describe, expect, it } from '@jest/globals';
import type { Request, Response } from 'express';
import { BusinessError } from '../../../common/errors/business.error';
import { SessionCookie, sessionCookieConfigFrom, type SessionCookieConfig } from './session-cookie';

/**
 * Cookie de session web — story F-02.
 *
 * Les attributs sont vérifiés un par un : un seul qui manque ne produit
 * AUCUNE erreur visible. Sans `httpOnly`, le cookie redevient lisible par un
 * script ; sans le même `Path` à l'effacement, la déconnexion laisse le jeton
 * en place. Rien de cela ne se voit à l'écran.
 */

const CONFIG: SessionCookieConfig = {
  secure: true,
  sameSite: 'strict',
  domain: null,
  path: '/api/v1/auth',
  maxAgeSeconds: 30 * 86_400,
  allowedOrigins: ['https://app.exemple.cm'],
};

function requete(entetes: Record<string, string>): Request {
  return { headers: entetes } as unknown as Request;
}

class FausseReponse {
  poses: Array<{ nom: string; valeur: string; options: Record<string, unknown> }> = [];
  effaces: Array<{ nom: string; options: Record<string, unknown> }> = [];
  cookie(nom: string, valeur: string, options: Record<string, unknown>): this {
    this.poses.push({ nom, valeur, options });
    return this;
  }
  clearCookie(nom: string, options: Record<string, unknown>): this {
    this.effaces.push({ nom, options });
    return this;
  }
}

describe('SessionCookie', () => {
  it('porte le préfixe __Secure- dès que Secure est actif', () => {
    expect(new SessionCookie(CONFIG).name).toBe('__Secure-acuba_rt');
    // Le préfixe exige Secure : le navigateur rejetterait le cookie sinon.
    expect(new SessionCookie({ ...CONFIG, secure: false }).name).toBe('acuba_rt');
  });

  it('pose le jeton en httpOnly, Secure, SameSite et Path restreint', () => {
    const reponse = new FausseReponse();
    new SessionCookie(CONFIG).poser(reponse as unknown as Response, 'jeton');

    expect(reponse.poses).toEqual([
      {
        nom: '__Secure-acuba_rt',
        valeur: 'jeton',
        options: {
          httpOnly: true,
          secure: true,
          sameSite: 'strict',
          path: '/api/v1/auth',
          maxAge: 30 * 86_400 * 1000,
        },
      },
    ]);
  });

  it("n'ajoute Domain que s'il est configuré", () => {
    const reponse = new FausseReponse();
    new SessionCookie({ ...CONFIG, domain: '.exemple.cm' }).poser(
      reponse as unknown as Response,
      'jeton',
    );
    expect(reponse.poses[0]?.options.domain).toBe('.exemple.cm');
  });

  it('efface avec EXACTEMENT les attributs de la pose, sans durée', () => {
    const cookie = new SessionCookie({ ...CONFIG, domain: '.exemple.cm' });
    const reponse = new FausseReponse();
    cookie.poser(reponse as unknown as Response, 'jeton');
    cookie.effacer(reponse as unknown as Response);

    const { maxAge: _duree, ...attributsDePose } = reponse.poses[0]!.options;
    expect(reponse.effaces).toEqual([{ nom: '__Secure-acuba_rt', options: attributsDePose }]);
  });

  describe('lecture', () => {
    const cookie = new SessionCookie(CONFIG);

    it('retrouve le jeton parmi d’autres cookies', () => {
      expect(
        cookie.lire(requete({ cookie: 'autre=1; __Secure-acuba_rt=abc%2Bdef; dernier=2' })),
      ).toBe('abc+def');
    });

    it("ignore un cookie au nom voisin — l'ancien nom sans préfixe ne compte pas", () => {
      expect(cookie.lire(requete({ cookie: 'acuba_rt=abc' }))).toBeNull();
      expect(cookie.lire(requete({ cookie: 'x__Secure-acuba_rt=abc' }))).toBeNull();
    });

    it('rend null sans cookie, avec une valeur vide ou mal encodée', () => {
      expect(cookie.lire(requete({}))).toBeNull();
      expect(cookie.lire(requete({ cookie: '__Secure-acuba_rt=' }))).toBeNull();
      expect(cookie.lire(requete({ cookie: '__Secure-acuba_rt=%E0%A4%A' }))).toBeNull();
    });
  });

  describe('protection CSRF par origine', () => {
    const cookie = new SessionCookie(CONFIG);

    it('accepte une origine déclarée', () => {
      expect(() =>
        cookie.exigerOrigineAutorisee(requete({ origin: 'https://app.exemple.cm' })),
      ).not.toThrow();
    });

    it('refuse une origine tierce', () => {
      expect(() =>
        cookie.exigerOrigineAutorisee(requete({ origin: 'https://piege.exemple.com' })),
      ).toThrow(BusinessError);
    });

    it("refuse l'absence d'origine : un navigateur l'envoie toujours sur un POST", () => {
      expect(() => cookie.exigerOrigineAutorisee(requete({}))).toThrow(BusinessError);
    });

    it("refuse une origine qui n'est qu'un préfixe d'une origine déclarée", () => {
      expect(() =>
        cookie.exigerOrigineAutorisee(requete({ origin: 'https://app.exemple.cm.piege.com' })),
      ).toThrow(BusinessError);
    });
  });
});

describe('sessionCookieConfigFrom', () => {
  const base = {
    API_GLOBAL_PREFIX: 'api/v1',
    CORS_ALLOWED_ORIGINS: ' https://a.cm , https://b.cm ,',
    REFRESH_TOKEN_TTL_DAYS: 30,
    SESSION_COOKIE_SAMESITE: 'strict' as const,
    SESSION_COOKIE_SECURE: true,
    SESSION_COOKIE_DOMAIN: '',
  };

  it('limite le chemin aux routes d’authentification, préfixe global compris', () => {
    expect(sessionCookieConfigFrom(base).path).toBe('/api/v1/auth');
    expect(sessionCookieConfigFrom({ ...base, API_GLOBAL_PREFIX: '/v2/' }).path).toBe('/v2/auth');
    expect(sessionCookieConfigFrom({ ...base, API_GLOBAL_PREFIX: '' }).path).toBe('/auth');
  });

  it('aligne la durée du cookie sur celle du jeton', () => {
    expect(sessionCookieConfigFrom(base).maxAgeSeconds).toBe(30 * 86_400);
  });

  it('nettoie la liste des origines et traite un domaine vide comme absent', () => {
    const config = sessionCookieConfigFrom(base);
    expect(config.allowedOrigins).toEqual(['https://a.cm', 'https://b.cm']);
    expect(config.domain).toBeNull();
  });
});
