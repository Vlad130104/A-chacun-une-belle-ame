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
import {
  AdminModerationController,
  ReportController,
} from '../../modules/moderation/infrastructure/moderation.controller';
import {
  AdminBillingController,
  BillingController,
  PaymentWebhookController,
} from '../../modules/billing/infrastructure/billing.controller';
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
  ReportController,
  AdminModerationController,
  BillingController,
  PaymentWebhookController,
  AdminBillingController,
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
  // Webhook de paiement : le fournisseur ne possède aucun jeton de session.
  // L'authentification EST la signature, vérifiée avant toute lecture
  // exploitable du corps (ADR-010). Une signature invalide renvoie 401 sans
  // aucune écriture métier — vérifié par un test dédié du module billing.
  'POST /payments/webhook/:provider',
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

  it('laisse le signalement accessible sans vérification d’identité', () => {
    // Signaler est une fonction de sécurité. La réserver aux comptes vérifiés
    // priverait de recours ceux qui viennent d'arriver — les plus exposés.
    const signaler = routes.find((route) => route.signature === 'POST /reports');
    expect(signaler?.policy?.level).toBe('auth');
  });

  it('protège chaque route de modération par une permission back-office', () => {
    const moderation = routes.filter((route) => route.signature.includes('/admin/moderation'));

    expect(moderation.length).toBeGreaterThanOrEqual(7);
    for (const route of moderation) {
      expect({
        signature: route.signature,
        permissions: route.policy?.permissions ?? [],
      }).toMatchObject({ permissions: expect.arrayContaining([expect.any(String)]) });
      expect(route.policy?.level).not.toBe('public');
    }
  });

  it('réserve l’application d’une action à la permission moderation.act', () => {
    const action = routes.find(
      (route) => route.signature === 'POST /admin/moderation/cases/:caseId/action',
    );
    expect(action?.policy?.permissions).toContain('moderation.act');
  });

  it('réserve l’attribution d’un cas à la permission moderation.assign', () => {
    const attribuer = routes.find(
      (route) => route.signature === 'POST /admin/moderation/cases/:caseId/assign',
    );
    expect(attribuer?.policy?.permissions).toContain('moderation.assign');
  });

  it('audite la consultation d’un dossier de modération', () => {
    // Un dossier contient les signalements et l'historique de sanctions d'une
    // personne : ce n'est pas une lecture anodine.
    const dossier = routes.find(
      (route) => route.signature === 'GET /admin/moderation/cases/:caseId',
    );
    expect(dossier?.policy?.audit).toBe('moderation.case.viewed');
  });

  it('n’expose aucune route d’écriture ni de suppression sur le journal d’audit', () => {
    // Le journal est en ajout seul : la seule façon d'y entrer une ligne est une
    // opération sensible réellement effectuée (docs/05-api.md §11).
    const audit = routes.filter((route) => route.signature.includes('/audit-log'));
    const ecritures = audit.filter(
      (route) =>
        route.signature.startsWith('POST ') ||
        route.signature.startsWith('PUT ') ||
        route.signature.startsWith('PATCH ') ||
        route.signature.startsWith('DELETE '),
    );
    expect(ecritures).toEqual([]);
  });

  it('n’expose qu’une seule route de paiement en accès libre : le webhook', () => {
    const paiement = routes.filter(
      (route) => route.signature.includes('/payments') || route.signature.includes('/subscription'),
    );
    const publiques = paiement
      .filter((route) => route.policy?.level === 'public')
      .map((route) => route.signature);

    expect(publiques).toEqual(['POST /payments/webhook/:provider']);
  });

  it('exige un compte vérifié pour souscrire', () => {
    // Payer suppose un compte dont l'identité est établie : sinon un compte
    // jetable pourrait acheter de la visibilité.
    const souscrire = routes.find((route) => route.signature === 'POST /subscriptions');
    expect(souscrire?.policy?.level).toBe('verified');
  });

  it('réserve le remboursement à la permission billing.refund et l’audite', () => {
    const rembourser = routes.find(
      (route) => route.signature === 'POST /admin/payments/:paymentId/refund',
    );
    expect(rembourser?.policy?.permissions).toContain('billing.refund');
    expect(rembourser?.policy?.audit).toBe('billing.payment.refunded');
  });

  it('réserve la confirmation manuelle d’un paiement à billing.manage et l’audite', () => {
    // Route de régularisation : elle crédite un abonnement sans passer par le
    // fournisseur. Elle doit être tracée nominativement.
    const confirmer = routes.find(
      (route) => route.signature === 'POST /admin/payments/:paymentId/confirm',
    );
    expect(confirmer?.policy?.permissions).toContain('billing.manage');
    expect(confirmer?.policy?.audit).toBe('billing.payment.confirmed');
  });

  it('n’expose aucune route d’authentification sensible en accès libre', () => {
    const sensibles = ['POST /auth/logout-all', 'GET /auth/sessions', 'GET /auth/me'];
    for (const signature of sensibles) {
      const route = routes.find((candidate) => candidate.signature === signature);
      expect(route?.policy?.level).not.toBe('public');
    }
  });
});
