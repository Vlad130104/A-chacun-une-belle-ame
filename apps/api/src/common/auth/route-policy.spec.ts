import 'reflect-metadata';
import { describe, expect, it } from '@jest/globals';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { HealthController } from '../../modules/health/health.controller';
import { AuthController } from '../../modules/auth/infrastructure/auth.controller';
import { AUTH_POLICY_KEY, type AuthPolicy } from './auth.decorator';

/**
 * Test d'inventaire des routes — docs/09-plan-de-tests.md §2.
 *
 * Deux garanties, qui attrapent la classe de bugs la plus dangereuse du projet :
 * une route sensible livrée sans garde.
 *
 *   1. Aucune route ne peut exister sans politique d'autorisation déclarée.
 *   2. Toute route publique doit figurer dans la liste de référence ci-dessous :
 *      ajouter une route publique exige une décision consciente en revue de code.
 *
 * L'inventaire lit les métadonnées directement sur les classes, sans conteneur
 * d'injection : ajouter un contrôleur ne demande donc pas de câbler ses dépendances
 * ici, seulement de l'ajouter à la liste.
 */

/** Tous les contrôleurs de l'application. Un contrôleur absent n'est pas couvert. */
const CONTROLLERS = [HealthController, AuthController];

/**
 * Liste de référence des routes publiques. Toute addition doit être justifiée :
 * une route publique est une surface d'attaque exposée sans authentification.
 */
const ALLOWED_PUBLIC_ROUTES = new Set([
  'GET /health/live',
  'GET /health/ready',
  // Inscription, validation OTP et rotation de token : par nature accessibles sans
  // session, chacune protégée par une limitation de débit dédiée.
  'POST /auth/register',
  'POST /auth/otp/verify',
  'POST /auth/refresh',
]);

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];

interface DiscoveredRoute {
  signature: string;
  policy: AuthPolicy | undefined;
}

function inventory(): DiscoveredRoute[] {
  const routes: DiscoveredRoute[] = [];

  for (const controller of CONTROLLERS) {
    const controllerPath = (Reflect.getMetadata(PATH_METADATA, controller) as string) ?? '';
    const prototype = controller.prototype as unknown as Record<string, unknown>;

    for (const methodName of Object.getOwnPropertyNames(prototype)) {
      if (methodName === 'constructor') continue;

      const handler = prototype[methodName];
      if (typeof handler !== 'function') continue;

      const methodPath = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      if (methodPath === undefined) continue;

      const verbIndex = (Reflect.getMetadata(METHOD_METADATA, handler) as number) ?? 0;
      const verb = HTTP_METHODS[verbIndex] ?? 'GET';
      const path = `/${[controllerPath, methodPath].filter((part) => part && part !== '/').join('/')}`;

      routes.push({
        signature: `${verb} ${path}`,
        policy: Reflect.getMetadata(AUTH_POLICY_KEY, handler) as AuthPolicy | undefined,
      });
    }
  }

  return routes;
}

describe('inventaire des routes', () => {
  const routes = inventory();

  it('découvre les routes de tous les contrôleurs déclarés', () => {
    expect(routes.length).toBeGreaterThanOrEqual(10);
  });

  it('exige une politique d’autorisation sur chaque route', () => {
    const withoutPolicy = routes.filter((route) => route.policy === undefined);
    expect(withoutPolicy.map((route) => route.signature)).toEqual([]);
  });

  it('n’autorise que les routes publiques explicitement référencées', () => {
    const publicRoutes = routes
      .filter((route) => route.policy?.level === 'public')
      .map((route) => route.signature);

    const unexpected = publicRoutes.filter((route) => !ALLOWED_PUBLIC_ROUTES.has(route));
    expect(unexpected).toEqual([]);
  });

  it('protège la route d’état des intégrations par une permission back-office', () => {
    const providersRoute = routes.find((route) => route.signature === 'GET /health/providers');
    expect(providersRoute?.policy?.permissions).toContain('system.read');
  });

  it('n’expose aucune route d’authentification sensible en accès libre', () => {
    const sensibles = ['POST /auth/logout-all', 'GET /auth/sessions', 'GET /auth/me'];
    for (const signature of sensibles) {
      const route = routes.find((candidate) => candidate.signature === signature);
      expect(route?.policy?.level).not.toBe('public');
    }
  });
});
