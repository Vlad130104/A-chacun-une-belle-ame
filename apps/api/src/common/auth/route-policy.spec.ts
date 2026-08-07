import { beforeAll, describe, expect, it } from '@jest/globals';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { HealthController } from '../../modules/health/health.controller';
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
 * Ce test parcourt les contrôleurs par réflexion : il n'a rien à mettre à jour quand
 * une route est ajoutée — il échoue, ce qui est le but.
 */

/**
 * Liste de référence des routes publiques. Toute addition doit être justifiée :
 * une route publique est une surface d'attaque exposée sans authentification.
 */
const ALLOWED_PUBLIC_ROUTES = new Set(['GET /health/live', 'GET /health/ready']);

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];

interface DiscoveredRoute {
  signature: string;
  policy: AuthPolicy | undefined;
}

/**
 * Module de test regroupant tous les contrôleurs de l'application.
 * Chaque nouveau contrôleur doit y être ajouté — omission détectée en revue, car un
 * contrôleur absent d'ici n'est pas couvert par l'inventaire.
 */
@Module({
  imports: [DiscoveryModule],
  controllers: [HealthController],
  // L'inventaire n'instancie aucune dépendance réelle : il ne lit que les métadonnées.
  providers: [{ provide: ConfigService, useValue: { get: () => undefined } }],
})
class RouteInventoryModule {}

describe('inventaire des routes', () => {
  let routes: DiscoveredRoute[];

  beforeAll(async () => {
    // On ne compile que le graphe : aucune connexion réseau ni base n'est ouverte,
    // car `compile()` n'exécute pas les hooks de cycle de vie.
    const moduleRef = await Test.createTestingModule({
      imports: [RouteInventoryModule],
    }).compile();

    const discovery = moduleRef.get(DiscoveryService);
    const scanner = moduleRef.get(MetadataScanner);
    const reflector = moduleRef.get(Reflector);

    routes = [];

    for (const wrapper of discovery.getControllers()) {
      const instance = wrapper.instance as Record<string, unknown> | undefined;
      const metatype = wrapper.metatype;
      if (!instance || !metatype) continue;

      const controllerPath = reflector.get<string>(PATH_METADATA, metatype) ?? '';
      const prototype = Object.getPrototypeOf(instance) as object;

      for (const methodName of scanner.getAllMethodNames(prototype)) {
        const handler = instance[methodName];
        if (typeof handler !== 'function') continue;

        const methodPath = reflector.get<string>(PATH_METADATA, handler);
        if (methodPath === undefined) continue;

        const verbIndex = reflector.get<number>(METHOD_METADATA, handler) ?? 0;
        const verb = HTTP_METHODS[verbIndex] ?? 'GET';
        const path = `/${[controllerPath, methodPath].filter((p) => p && p !== '/').join('/')}`;

        routes.push({
          signature: `${verb} ${path}`,
          policy: reflector.get<AuthPolicy>(AUTH_POLICY_KEY, handler),
        });
      }
    }
  });

  it('découvre au moins une route', () => {
    expect(routes.length).toBeGreaterThan(0);
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
});
