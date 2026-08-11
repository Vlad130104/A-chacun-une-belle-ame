import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test, type TestingModule } from '@nestjs/testing';

/**
 * Résolution complète du graphe d'injection.
 *
 * Les tests unitaires vérifient des règles ; ils resteraient tous verts avec un
 * module mal câblé — l'application ne démarrerait simplement pas. Ce test comble
 * exactement ce trou : il construit le conteneur entier et échoue si un jeton
 * n'est pas fourni, si un module oublie d'exporter ce qu'un autre attend, ou si
 * une dépendance circulaire apparaît.
 *
 * `compile()` n'appelle PAS les hooks de cycle de vie : ni PostgreSQL ni Redis ne
 * sont contactés (le client Redis est en `lazyConnect`, la connexion Prisma a lieu
 * dans `onModuleInit`). Le test tourne donc dans la suite unitaire, sans conteneur.
 *
 * Les modules sont chargés dynamiquement APRÈS l'écriture des variables
 * d'environnement : `ConfigModule.forRoot` valide la configuration à l'évaluation
 * du décorateur, donc dès l'import de `app.module.ts`.
 */

const ENV_DE_TEST: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=app',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'x'.repeat(48),
  JWT_REFRESH_SECRET: 'y'.repeat(48),
  HASH_SALT: 'z'.repeat(32),
  S3_MEDIA_BUCKET: 'medias-test',
  S3_KYC_BUCKET: 'identites-test',
};

let moduleRef: TestingModule;
let resolus: { nom: string; instance: unknown; classe: unknown }[] = [];
const sauvegarde = new Map<string, string | undefined>();

beforeAll(async () => {
  for (const [cle, valeur] of Object.entries(ENV_DE_TEST)) {
    sauvegarde.set(cle, process.env[cle]);
    process.env[cle] = valeur;
  }

  const { AppModule } = await import('./app.module');
  const { ConversationsController } =
    await import('./modules/conversations/infrastructure/conversations.controller');
  const { DiscoveryController } =
    await import('./modules/discovery/infrastructure/discovery.controller');
  const { RealtimeGateway } =
    await import('./modules/conversations/infrastructure/realtime.gateway');
  const { ConversationAccessService } =
    await import('./modules/conversations/application/conversation.use-cases');
  const { AdminModerationController, ReportController } =
    await import('./modules/moderation/infrastructure/moderation.controller');

  moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  resolus = [
    {
      nom: 'DiscoveryController',
      classe: DiscoveryController,
      instance: moduleRef.get(DiscoveryController),
    },
    {
      nom: 'ConversationsController',
      classe: ConversationsController,
      instance: moduleRef.get(ConversationsController),
    },
    // Si ces deux-là résolvent, c'est que la route HTTP et le canal Socket.IO
    // partagent bien la même règle d'accès (story D5-02).
    { nom: 'RealtimeGateway', classe: RealtimeGateway, instance: moduleRef.get(RealtimeGateway) },
    {
      nom: 'ConversationAccessService',
      classe: ConversationAccessService,
      instance: moduleRef.get(ConversationAccessService),
    },
    // La modération consomme des ports implémentés par trois autres modules
    // (`auth`, `profiles`, `conversations`) : si l'un oubliait d'exporter le
    // sien, le conteneur ne résoudrait pas et ce test tomberait.
    {
      nom: 'ReportController',
      classe: ReportController,
      instance: moduleRef.get(ReportController),
    },
    {
      nom: 'AdminModerationController',
      classe: AdminModerationController,
      instance: moduleRef.get(AdminModerationController),
    },
  ];
}, 180_000);

afterAll(async () => {
  await moduleRef?.close();
  for (const [cle, valeur] of sauvegarde) {
    if (valeur === undefined) delete process.env[cle];
    else process.env[cle] = valeur;
  }
});

describe('graphe d’injection de l’application', () => {
  it('résout l’intégralité du conteneur', () => {
    expect(moduleRef).toBeDefined();
  });

  it('résout les fournisseurs clés des tranches livrées', () => {
    for (const { nom, classe, instance } of resolus) {
      expect({
        nom,
        ok: instance instanceof (classe as new (...args: never[]) => unknown),
      }).toEqual({ nom, ok: true });
    }
  });
});
