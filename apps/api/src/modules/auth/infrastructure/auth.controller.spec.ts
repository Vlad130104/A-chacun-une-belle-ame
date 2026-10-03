import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ErrorCode } from '@acuba/contracts';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { BusinessError } from '../../../common/errors/business.error';
import { GlobalExceptionFilter } from '../../../common/errors/global-exception.filter';
import { RefreshTokenUseCase, type RefreshCommand } from '../application/refresh-token.use-case';
import { RegisterUseCase } from '../application/register.use-case';
import {
  ListSessionsUseCase,
  LogoutAllUseCase,
  LogoutUseCase,
  RevokeSessionUseCase,
} from '../application/session.use-cases';
import {
  VerifyOtpUseCase,
  type AuthTokens,
  type VerifyOtpCommand,
} from '../application/verify-otp.use-case';
import { AuthController } from './auth.controller';
import { SessionCookie } from './session-cookie';

/**
 * Transport de session par cookie, à travers le VRAI Express — story F-02.
 *
 * Les cas d'usage sont simulés ; le contrôleur, le cookie, l'analyse du corps
 * et le filtre d'erreurs sont réels. C'est la seule façon de vérifier ce qui
 * compte ici : les en-têtes `Set-Cookie` effectivement émis, et l'absence du
 * jeton dans le corps. Un test qui appellerait la méthode du contrôleur
 * directement ne verrait ni l'un ni l'autre.
 */

const ORIGINE = 'https://app.exemple.cm';
const NOM = '__Secure-acuba_rt';
const CHALLENGE_ID = 'cjld2cjxh0000qzrmn831i7rn';

function jetons(refreshToken: string): AuthTokens {
  return {
    accessToken: 'acces',
    refreshToken,
    expiresIn: 900,
    userId: 'u1',
    accountStatus: 'ACTIVE',
    verificationStatus: 'NOT_STARTED',
  };
}

class FauxVerifyOtp {
  appels: VerifyOtpCommand[] = [];
  execute(commande: VerifyOtpCommand): Promise<AuthTokens> {
    this.appels.push(commande);
    return Promise.resolve(jetons('rt-initial-'.padEnd(48, 'x')));
  }
}

class FauxRefresh {
  appels: RefreshCommand[] = [];
  erreur: Error | null = null;
  execute(commande: RefreshCommand): Promise<AuthTokens> {
    this.appels.push(commande);
    if (this.erreur !== null) return Promise.reject(this.erreur);
    return Promise.resolve(jetons('rt-pivote-'.padEnd(48, 'y')));
  }
}

class FauxLogout {
  appels: string[] = [];
  echoue = false;
  execute(sessionId: string): Promise<void> {
    this.appels.push(sessionId);
    return this.echoue ? Promise.reject(new Error('base injoignable')) : Promise.resolve();
  }
}

const inutilise = { execute: () => Promise.reject(new Error('non utilisé dans ce test')) };

function setCookies(reponse: request.Response): string[] {
  const brut = reponse.headers['set-cookie'] as unknown;
  if (Array.isArray(brut)) return brut as string[];
  return typeof brut === 'string' ? [brut] : [];
}

describe('AuthController — session web en cookie httpOnly (F-02)', () => {
  let app: INestApplication;
  const verifyOtp = new FauxVerifyOtp();
  const refresh = new FauxRefresh();
  const logout = new FauxLogout();

  const serveur = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: RegisterUseCase, useValue: inutilise },
        { provide: VerifyOtpUseCase, useValue: verifyOtp },
        { provide: RefreshTokenUseCase, useValue: refresh },
        { provide: LogoutUseCase, useValue: logout },
        { provide: LogoutAllUseCase, useValue: { execute: () => Promise.resolve({ revoked: 3 }) } },
        { provide: ListSessionsUseCase, useValue: inutilise },
        { provide: RevokeSessionUseCase, useValue: inutilise },
        {
          provide: SessionCookie,
          useValue: new SessionCookie({
            secure: true,
            sameSite: 'strict',
            domain: null,
            path: '/api/v1/auth',
            maxAgeSeconds: 30 * 86_400,
            allowedOrigins: [ORIGINE],
          }),
        },
      ],
    }).compile();

    app = module.createNestApplication();
    // Le garde global n'est pas monté ici : on simule une personne authentifiée
    // pour les routes de déconnexion, dont seul l'effet sur le cookie est testé.
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = {
        id: 'u1',
        sessionId: 's1',
        accountStatus: 'ACTIVE',
        verificationStatus: 'NOT_STARTED',
        roles: [],
        permissions: [],
      };
      next();
    });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    verifyOtp.appels = [];
    refresh.appels = [];
    refresh.erreur = null;
    logout.appels = [];
    logout.echoue = false;
  });

  describe('POST /auth/otp/verify', () => {
    it('navigateur : jeton en cookie httpOnly, ABSENT du corps', async () => {
      const reponse = await request(serveur())
        .post('/api/v1/auth/otp/verify')
        .set('Origin', ORIGINE)
        .send({ challengeId: CHALLENGE_ID, code: '123456', device: { type: 'WEB' } })
        .expect(201);

      expect(reponse.body).not.toHaveProperty('refreshToken');
      expect(reponse.body).toMatchObject({ accessToken: 'acces', userId: 'u1' });

      const [cookie] = setCookies(reponse);
      expect(cookie).toMatch(new RegExp(`^${NOM}=rt-initial-`));
      expect(cookie).toMatch(/; HttpOnly/);
      expect(cookie).toMatch(/; Secure/);
      expect(cookie).toMatch(/; SameSite=Strict/);
      expect(cookie).toMatch(/; Path=\/api\/v1\/auth/);
      expect(cookie).toMatch(/; Max-Age=2592000/);
    });

    it("navigateur d'une origine tierce : refusé AVANT de consommer le code", async () => {
      const reponse = await request(serveur())
        .post('/api/v1/auth/otp/verify')
        .set('Origin', 'https://piege.exemple.com')
        .send({ challengeId: CHALLENGE_ID, code: '123456', device: { type: 'WEB' } })
        .expect(403);

      expect(reponse.body.error.code).toBe(ErrorCode.AUTH_FORBIDDEN);
      // Le code n'a pas été soumis : il reste utilisable par la vraie personne.
      expect(verifyOtp.appels).toHaveLength(0);
      expect(setCookies(reponse)).toEqual([]);
    });

    it('application mobile : jeton dans le corps, aucun cookie', async () => {
      const reponse = await request(serveur())
        .post('/api/v1/auth/otp/verify')
        .send({
          challengeId: CHALLENGE_ID,
          code: '123456',
          device: { type: 'ANDROID' },
        })
        .expect(201);

      expect(reponse.body.refreshToken).toMatch(/^rt-initial-/);
      expect(setCookies(reponse)).toEqual([]);
    });
  });

  describe('POST /auth/refresh', () => {
    it('navigateur : lit le cookie, le fait pivoter, ne rend pas le jeton', async () => {
      const reponse = await request(serveur())
        .post('/api/v1/auth/refresh')
        .set('Origin', ORIGINE)
        .set('Cookie', `${NOM}=rt-ancien`)
        .send({})
        .expect(201);

      expect(refresh.appels[0]?.refreshToken).toBe('rt-ancien');
      expect(reponse.body).not.toHaveProperty('refreshToken');
      expect(reponse.body.accessToken).toBe('acces');
      expect(setCookies(reponse)[0]).toMatch(new RegExp(`^${NOM}=rt-pivote-`));
    });

    it('navigateur sans cookie : 401, sans appeler le cas d’usage', async () => {
      const reponse = await request(serveur())
        .post('/api/v1/auth/refresh')
        .set('Origin', ORIGINE)
        .send({})
        .expect(401);

      expect(reponse.body.error.code).toBe(ErrorCode.AUTH_TOKEN_EXPIRED);
      expect(refresh.appels).toHaveLength(0);
    });

    it('origine tierce : 403 même avec un cookie valide — protection CSRF', async () => {
      await request(serveur())
        .post('/api/v1/auth/refresh')
        .set('Origin', 'https://piege.exemple.com')
        .set('Cookie', `${NOM}=rt-ancien`)
        .send({})
        .expect(403);

      expect(refresh.appels).toHaveLength(0);
    });

    it('sans origine ni jeton dans le corps : 403', async () => {
      await request(serveur())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `${NOM}=rt-ancien`)
        .send({})
        .expect(403);
    });

    it('jeton réutilisé : erreur transmise ET cookie effacé', async () => {
      refresh.erreur = BusinessError.unauthorized(ErrorCode.AUTH_TOKEN_REUSED);

      const reponse = await request(serveur())
        .post('/api/v1/auth/refresh')
        .set('Origin', ORIGINE)
        .set('Cookie', `${NOM}=rt-vole`)
        .send({})
        .expect(401);

      expect(reponse.body.error.code).toBe(ErrorCode.AUTH_TOKEN_REUSED);
      const [efface] = setCookies(reponse);
      expect(efface).toMatch(new RegExp(`^${NOM}=;`));
      expect(efface).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect(efface).toMatch(/; Path=\/api\/v1\/auth/);
    });

    it('panne passagère : erreur 500, cookie CONSERVÉ', async () => {
      // La base injoignable ne dit rien du jeton : l'effacer déconnecterait la
      // personne pour un incident qui n'est pas le sien.
      refresh.erreur = new Error('base injoignable');

      const reponse = await request(serveur())
        .post('/api/v1/auth/refresh')
        .set('Origin', ORIGINE)
        .set('Cookie', `${NOM}=rt-ancien`)
        .send({})
        .expect(500);

      expect(setCookies(reponse)).toEqual([]);
    });

    it('application mobile : jeton dans le corps, rendu dans le corps, aucun cookie', async () => {
      const reponse = await request(serveur())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'r'.repeat(64) })
        .expect(201);

      expect(refresh.appels[0]?.refreshToken).toBe('r'.repeat(64));
      expect(reponse.body.refreshToken).toMatch(/^rt-pivote-/);
      expect(setCookies(reponse)).toEqual([]);
    });
  });

  describe('déconnexion', () => {
    it('POST /auth/logout révoque puis efface le cookie', async () => {
      const reponse = await request(serveur()).post('/api/v1/auth/logout').expect(204);

      expect(logout.appels).toEqual(['s1']);
      expect(setCookies(reponse)[0]).toMatch(new RegExp(`^${NOM}=;`));
    });

    it("si la révocation échoue, le cookie reste : pas d'illusion de déconnexion", async () => {
      logout.echoue = true;
      const reponse = await request(serveur()).post('/api/v1/auth/logout').expect(500);

      expect(setCookies(reponse)).toEqual([]);
    });

    it('POST /auth/logout-all efface aussi le cookie', async () => {
      const reponse = await request(serveur()).post('/api/v1/auth/logout-all').expect(200);

      expect(reponse.body).toEqual({ revoked: 3 });
      expect(setCookies(reponse)[0]).toMatch(new RegExp(`^${NOM}=;`));
    });
  });
});
