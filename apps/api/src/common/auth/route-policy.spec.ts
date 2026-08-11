import 'reflect-metadata';
import { describe, expect, it } from '@jest/globals';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { HealthController } from '../../modules/health/health.controller';
import { AuthController } from '../../modules/auth/infrastructure/auth.controller';
import {
  AdminVerificationController,
  VerificationController,
} from '../../modules/verification/infrastructure/verification.controller';
import {
  AdminPhotoModerationController,
  PhotoController,
  ProfileController,
  ReferentialController,
} from '../../modules/profiles/infrastructure/profiles.controller';
import { DiscoveryController } from '../../modules/discovery/infrastructure/discovery.controller';
import { ConversationsController } from '../../modules/conversations/infrastructure/conversations.controller';
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
const CONTROLLERS = [
  HealthController,
  AuthController,
  VerificationController,
  AdminVerificationController,
  ProfileController,
  PhotoController,
  ReferentialController,
  AdminPhotoModerationController,
  DiscoveryController,
  ConversationsController,
];

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

  it('réserve la file de vérification au rôle disposant de kyc.review', () => {
    const queue = routes.find((route) => route.signature === 'GET /admin/verification/queue');
    expect(queue?.policy?.permissions).toContain('kyc.review');
  });

  it('n’expose aucune route de vérification d’identité en accès libre', () => {
    const kyc = routes.filter((route) => route.signature.includes('verification'));
    expect(kyc.length).toBeGreaterThanOrEqual(5);
    expect(kyc.every((route) => route.policy?.level !== 'public')).toBe(true);
  });

  it('réserve la file de modération photo à la permission moderation.content', () => {
    const queue = routes.find((route) => route.signature === 'GET /admin/moderation/photos');
    expect(queue?.policy?.permissions).toContain('moderation.content');
  });

  it('n’expose aucune route de profil ni de photo en accès libre', () => {
    const profil = routes.filter(
      (route) => route.signature.includes('/profile') || route.signature.includes('/media/photos'),
    );
    expect(profil.length).toBeGreaterThanOrEqual(9);
    expect(profil.every((route) => route.policy?.level !== 'public')).toBe(true);
  });

  it('exige un compte vérifié pour toute la découverte', () => {
    const decouverte = [
      'GET /discovery/suggestions',
      'POST /likes',
      'GET /likes/sent',
      'GET /likes/received',
      'GET /matches',
    ];
    for (const signature of decouverte) {
      const route = routes.find((candidate) => candidate.signature === signature);
      expect(route?.policy?.level).toBe('verified');
    }
  });

  it('laisse le blocage accessible sans vérification d’identité', () => {
    // Le blocage est une fonction de sécurité : la fermer aux comptes non vérifiés
    // priverait de protection ceux qui en ont le plus besoin.
    const block = routes.find((route) => route.signature === 'POST /blocks');
    expect(block?.policy?.level).toBe('auth');
  });

  it('exige l’appartenance à la conversation sur chaque route de messagerie', () => {
    // La règle centrale du produit (story D5-02). Le drapeau est rendu exécutoire
    // par `ConversationMemberGuard` ; sans lui il ne serait qu'une décoration.
    const messagerie = [
      'GET /conversations/:conversationId',
      'GET /conversations/:conversationId/messages',
      'POST /conversations/:conversationId/messages',
      'POST /conversations/:conversationId/attachments',
      'POST /conversations/:conversationId/read',
      'PATCH /conversations/:conversationId/mute',
      'PATCH /conversations/:conversationId/archive',
    ];

    for (const signature of messagerie) {
      const route = routes.find((candidate) => candidate.signature === signature);
      expect(route?.policy).toMatchObject({ level: 'verified', conversationMember: true });
    }
  });

  it('n’expose AUCUNE route permettant d’écrire à un membre par son identifiant', () => {
    // C'est la propriété structurelle qui rend la promesse tenable : l'unique porte
    // d'entrée de la messagerie est une conversation, et une conversation n'existe
    // que par un match. Toute route d'envoi doit donc être ancrée sur
    // `/conversations/:conversationId`.
    const routesEnvoi = routes.filter(
      (route) =>
        route.signature.startsWith('POST ') &&
        (route.signature.includes('message') || route.signature.includes('attachment')),
    );

    expect(routesEnvoi.length).toBeGreaterThanOrEqual(2);
    for (const route of routesEnvoi) {
      expect(route.signature).toContain('/conversations/:conversationId/');
      expect(route.policy?.conversationMember).toBe(true);
    }
  });

  it('exige un compte vérifié pour la liste des conversations', () => {
    const liste = routes.find((route) => route.signature === 'GET /conversations');
    expect(liste?.policy?.level).toBe('verified');
  });

  it('n’expose aucune route de messagerie en accès libre', () => {
    const messagerie = routes.filter(
      (route) =>
        route.signature.includes('/conversations') || route.signature.includes('/messages'),
    );
    expect(messagerie.length).toBeGreaterThanOrEqual(9);
    expect(messagerie.every((route) => route.policy?.level !== 'public')).toBe(true);
  });

  it('n’expose aucune route d’authentification sensible en accès libre', () => {
    const sensibles = ['POST /auth/logout-all', 'GET /auth/sessions', 'GET /auth/me'];
    for (const signature of sensibles) {
      const route = routes.find((candidate) => candidate.signature === signature);
      expect(route?.policy?.level).not.toBe('public');
    }
  });
});
