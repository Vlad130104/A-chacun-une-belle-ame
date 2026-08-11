import { beforeEach, describe, expect, it } from '@jest/globals';
import { BusinessError } from '../../../common/errors/business.error';
import type { MessagingContext } from '../domain/messaging-policy';
import {
  ConversationAccessService,
  DeleteMessageUseCase,
  ListMessagesUseCase,
  MarkReadUseCase,
  SendAttachmentUseCase,
  SendMessageUseCase,
  SetConversationFlagsUseCase,
  type MessagingConfig,
} from './conversation.use-cases';
import {
  FakeAttachmentPipeline,
  FakeAttachmentStorage,
  FakeConversationRepository,
  FakeMessageRepository,
  FakeRealtimeNotifier,
  FixedClock,
} from './test-doubles';

const MAINTENANT = new Date('2026-03-15T10:00:00.000Z');

const config: MessagingConfig = {
  unansweredLimit: 20,
  retentionMonths: 24,
  maxAttachmentBytes: 8 * 1024 * 1024,
  signedUrlTtlSeconds: 300,
};

const contexteOuvert = (): MessagingContext => ({
  callerId: 'alice',
  conversationStatus: 'OPEN',
  matchStatus: 'ACTIVE',
  members: [
    { userId: 'alice', accountStatus: 'ACTIVE', verificationStatus: 'VERIFIED' },
    { userId: 'bob', accountStatus: 'ACTIVE', verificationStatus: 'VERIFIED' },
  ],
  blockedEitherWay: false,
});

let conversations: FakeConversationRepository;
let messages: FakeMessageRepository;
let realtime: FakeRealtimeNotifier;
let storage: FakeAttachmentStorage;
let pipeline: FakeAttachmentPipeline;
let access: ConversationAccessService;
let clock: FixedClock;

beforeEach(() => {
  conversations = new FakeConversationRepository();
  messages = new FakeMessageRepository();
  realtime = new FakeRealtimeNotifier();
  storage = new FakeAttachmentStorage();
  pipeline = new FakeAttachmentPipeline();
  clock = new FixedClock(MAINTENANT);
  access = new ConversationAccessService(conversations);

  conversations.contexts.set('conv-1', contexteOuvert());
});

const envoi = () =>
  new SendMessageUseCase(access, conversations, messages, realtime, storage, clock, config);

const attendreErreur = async (promesse: Promise<unknown>): Promise<BusinessError> => {
  try {
    await promesse;
  } catch (erreur) {
    if (erreur instanceof BusinessError) return erreur;
    throw erreur;
  }
  throw new Error('Une BusinessError était attendue.');
};

describe('accès à une conversation — le garde unique', () => {
  it('laisse passer un membre légitime', async () => {
    await expect(access.assertCanRead('alice', 'conv-1')).resolves.toMatchObject({
      callerId: 'alice',
    });
  });

  it('répond 404 sur une conversation inexistante', async () => {
    const erreur = await attendreErreur(access.assertCanRead('alice', 'inconnue'));
    expect(erreur.httpStatus).toBe(404);
  });

  it('répond 404, et non 403, à un non-membre', async () => {
    // Sinon 403 sur une conversation existante et 404 sur une inexistante donnerait
    // un oracle permettant d'énumérer les conversations d'autrui.
    conversations.contexts.set('conv-2', { ...contexteOuvert(), callerId: 'charlie' });
    const erreur = await attendreErreur(access.assertCanRead('charlie', 'conv-2'));
    expect(erreur.httpStatus).toBe(404);
  });

  it('répond 403 MSG_NO_MATCH quand le match est rompu', async () => {
    conversations.contexts.set('conv-1', { ...contexteOuvert(), matchStatus: 'UNMATCHED' });
    const erreur = await attendreErreur(access.assertCanRead('alice', 'conv-1'));
    expect(erreur.code).toBe('MSG_NO_MATCH');
    expect(erreur.httpStatus).toBe(403);
  });

  it('répond 403 MSG_CONVERSATION_LOCKED sur une conversation verrouillée', async () => {
    conversations.contexts.set('conv-1', {
      ...contexteOuvert(),
      conversationStatus: 'LOCKED_BY_BLOCK',
    });
    const erreur = await attendreErreur(access.assertCanRead('alice', 'conv-1'));
    expect(erreur.code).toBe('MSG_CONVERSATION_LOCKED');
  });
});

describe('envoi d’un message', () => {
  it('enregistre le message et le diffuse en temps réel', async () => {
    const vue = await envoi().execute({
      userId: 'alice',
      conversationId: 'conv-1',
      body: '  Bonsoir Awa  ',
      clientIdempotencyKey: 'cle-1',
    });

    expect(vue.body).toBe('Bonsoir Awa');
    expect(vue.senderId).toBe('alice');
    expect(realtime.created).toHaveLength(1);
  });

  it('désigne le destinataire à partir des membres, jamais du client', async () => {
    await envoi().execute({
      userId: 'alice',
      conversationId: 'conv-1',
      body: 'coucou',
      clientIdempotencyKey: 'cle-1',
    });

    expect(messages.commands[0]?.recipientId).toBe('bob');
  });

  it('refuse un envoi si le match est rompu', async () => {
    conversations.contexts.set('conv-1', { ...contexteOuvert(), matchStatus: 'UNMATCHED' });

    const erreur = await attendreErreur(
      envoi().execute({
        userId: 'alice',
        conversationId: 'conv-1',
        body: 'coucou',
        clientIdempotencyKey: 'cle-1',
      }),
    );

    expect(erreur.code).toBe('MSG_NO_MATCH');
    expect(messages.messages).toHaveLength(0);
  });

  it('refuse un envoi si un blocage existe', async () => {
    conversations.contexts.set('conv-1', { ...contexteOuvert(), blockedEitherWay: true });

    const erreur = await attendreErreur(
      envoi().execute({
        userId: 'alice',
        conversationId: 'conv-1',
        body: 'coucou',
        clientIdempotencyKey: 'cle-1',
      }),
    );

    expect(erreur.code).toBe('MSG_NO_MATCH');
  });

  it('refuse un corps vide', async () => {
    const erreur = await attendreErreur(
      envoi().execute({
        userId: 'alice',
        conversationId: 'conv-1',
        body: '   ',
        clientIdempotencyKey: 'cle-1',
      }),
    );

    expect(erreur.code).toBe('VALIDATION_FAILED');
  });

  it('refuse un corps trop long avec MSG_TOO_LONG', async () => {
    const erreur = await attendreErreur(
      envoi().execute({
        userId: 'alice',
        conversationId: 'conv-1',
        body: 'a'.repeat(5000),
        clientIdempotencyKey: 'cle-1',
      }),
    );

    expect(erreur.code).toBe('MSG_TOO_LONG');
  });

  it('refuse au-delà de la limite de messages sans réponse', async () => {
    conversations.streaks.set('conv-1:alice', 20);

    const erreur = await attendreErreur(
      envoi().execute({
        userId: 'alice',
        conversationId: 'conv-1',
        body: 'tu es là ?',
        clientIdempotencyKey: 'cle-1',
      }),
    );

    expect(erreur.code).toBe('MSG_AWAITING_REPLY');
    expect(messages.messages).toHaveLength(0);
  });

  it('ne crée qu’un message quand le client rejoue la même clé', async () => {
    // Réseau instable : la requête part deux fois, l'utilisateur doit voir un
    // message, pas deux (story D5-09).
    const cas = envoi();
    const entree = {
      userId: 'alice',
      conversationId: 'conv-1',
      body: 'coucou',
      clientIdempotencyKey: 'cle-identique',
    };

    const premiere = await cas.execute(entree);
    const seconde = await cas.execute(entree);

    expect(seconde.id).toBe(premiere.id);
    expect(messages.messages).toHaveLength(1);
  });

  it('ne rediffuse pas une ré-émission', async () => {
    const cas = envoi();
    const entree = {
      userId: 'alice',
      conversationId: 'conv-1',
      body: 'coucou',
      clientIdempotencyKey: 'cle-identique',
    };

    await cas.execute(entree);
    await cas.execute(entree);

    expect(realtime.created).toHaveLength(1);
  });

  it('transmet le message tout en marquant les signaux à risque', async () => {
    const vue = await envoi().execute({
      userId: 'alice',
      conversationId: 'conv-1',
      body: 'envoie 100 000 FCFA par Orange Money, mon numéro est 699001122',
      clientIdempotencyKey: 'cle-1',
    });

    expect(vue.body).not.toBeNull();
    expect(messages.commands[0]?.signals).toEqual(
      expect.arrayContaining(['MONEY_REQUEST', 'CONTACT_SHARING']),
    );
  });

  it('calcule une date de purge conforme à la durée de conservation', async () => {
    await envoi().execute({
      userId: 'alice',
      conversationId: 'conv-1',
      body: 'coucou',
      clientIdempotencyKey: 'cle-1',
    });

    expect(messages.commands[0]?.purgeAt.toISOString()).toBe('2028-03-15T10:00:00.000Z');
  });
});

describe('image jointe', () => {
  const envoiImage = () =>
    new SendAttachmentUseCase(
      access,
      conversations,
      messages,
      pipeline,
      storage,
      realtime,
      clock,
      config,
    );

  it('traite l’image, la stocke et crée un message de type IMAGE', async () => {
    const vue = await envoiImage().execute({
      userId: 'alice',
      conversationId: 'conv-1',
      bytes: Buffer.alloc(1024),
      clientIdempotencyKey: 'cle-img',
    });

    expect(vue.type).toBe('IMAGE');
    expect(pipeline.calls).toBe(1);
    expect(storage.objects.size).toBe(2);
  });

  it('ne livre aucune URL tant que l’image n’est pas approuvée', async () => {
    // Modérer après affichage reviendrait à ne pas modérer.
    const vue = await envoiImage().execute({
      userId: 'alice',
      conversationId: 'conv-1',
      bytes: Buffer.alloc(1024),
      clientIdempotencyKey: 'cle-img',
    });

    expect(vue.attachments[0]).toMatchObject({ status: 'PENDING_MODERATION', url: null });
  });

  it('refuse une image au-delà de la taille maximale, avant tout traitement', async () => {
    const erreur = await attendreErreur(
      envoiImage().execute({
        userId: 'alice',
        conversationId: 'conv-1',
        bytes: Buffer.alloc(config.maxAttachmentBytes + 1),
        clientIdempotencyKey: 'cle-img',
      }),
    );

    expect(erreur.code).toBe('MEDIA_TOO_LARGE');
    expect(pipeline.calls).toBe(0);
    expect(storage.objects.size).toBe(0);
  });

  it('refuse une image si le match est rompu', async () => {
    conversations.contexts.set('conv-1', { ...contexteOuvert(), matchStatus: 'UNMATCHED' });

    const erreur = await attendreErreur(
      envoiImage().execute({
        userId: 'alice',
        conversationId: 'conv-1',
        bytes: Buffer.alloc(1024),
        clientIdempotencyKey: 'cle-img',
      }),
    );

    expect(erreur.code).toBe('MSG_NO_MATCH');
    expect(storage.objects.size).toBe(0);
  });
});

describe('historique et lecture', () => {
  const historique = () => new ListMessagesUseCase(access, messages, storage, config);

  beforeEach(async () => {
    await envoi().execute({
      userId: 'alice',
      conversationId: 'conv-1',
      body: 'premier',
      clientIdempotencyKey: 'cle-1',
    });
  });

  it('expose exactement les champs prévus, sans clé de stockage', async () => {
    const page = await historique().execute({
      userId: 'alice',
      conversationId: 'conv-1',
      limit: 20,
    });

    expect(Object.keys(page.items[0] ?? {}).sort()).toEqual([
      'attachments',
      'body',
      'conversationId',
      'createdAt',
      'deleted',
      'deliveryStatus',
      'id',
      'senderId',
      'type',
    ]);
  });

  it('refuse l’historique à un membre bloqué', async () => {
    conversations.contexts.set('conv-1', { ...contexteOuvert(), blockedEitherWay: true });

    const erreur = await attendreErreur(
      historique().execute({ userId: 'alice', conversationId: 'conv-1', limit: 20 }),
    );

    expect(erreur.code).toBe('MSG_NO_MATCH');
  });

  it('marque comme lus les messages reçus et émet un accusé', async () => {
    const cas = new MarkReadUseCase(access, messages, realtime, clock);
    const message = messages.messages[0];
    if (message === undefined) throw new Error('message attendu');

    const resultat = await cas.execute({
      userId: 'bob',
      conversationId: 'conv-1',
      upToMessageId: message.id,
    });

    expect(resultat.updated).toBe(1);
    expect(realtime.statuses[0]).toMatchObject({ status: 'READ' });
  });

  it('n’émet aucun accusé quand rien ne change', async () => {
    const cas = new MarkReadUseCase(access, messages, realtime, clock);
    const message = messages.messages[0];
    if (message === undefined) throw new Error('message attendu');

    // Alice ne peut pas « lire » son propre message : rien ne bascule.
    const resultat = await cas.execute({
      userId: 'alice',
      conversationId: 'conv-1',
      upToMessageId: message.id,
    });

    expect(resultat.updated).toBe(0);
    expect(realtime.statuses).toHaveLength(0);
  });
});

describe('suppression d’un message', () => {
  const supprimer = () => new DeleteMessageUseCase(access, messages, realtime, clock);

  beforeEach(async () => {
    await envoi().execute({
      userId: 'alice',
      conversationId: 'conv-1',
      body: 'à retirer',
      clientIdempotencyKey: 'cle-1',
    });
  });

  it('efface le corps et conserve la ligne', async () => {
    const message = messages.messages[0];
    if (message === undefined) throw new Error('message attendu');

    await supprimer().execute('alice', message.id);

    expect(messages.messages).toHaveLength(1);
    expect(messages.messages[0]?.body).toBeNull();
    expect(messages.messages[0]?.deletedAt).not.toBeNull();
  });

  it('refuse au destinataire de supprimer le message d’autrui', async () => {
    // Supprimer le message de l'autre effacerait une preuve pour la modération.
    const message = messages.messages[0];
    if (message === undefined) throw new Error('message attendu');

    const erreur = await attendreErreur(supprimer().execute('bob', message.id));

    expect(erreur.httpStatus).toBe(404);
    expect(messages.messages[0]?.body).not.toBeNull();
  });

  it('répond 404 sur un message inexistant', async () => {
    const erreur = await attendreErreur(supprimer().execute('alice', 'inconnu'));
    expect(erreur.httpStatus).toBe(404);
  });

  it('rend le message masqué dans l’historique après suppression', async () => {
    const message = messages.messages[0];
    if (message === undefined) throw new Error('message attendu');

    await supprimer().execute('alice', message.id);
    const page = await new ListMessagesUseCase(access, messages, storage, config).execute({
      userId: 'alice',
      conversationId: 'conv-1',
      limit: 20,
    });

    expect(page.items[0]).toMatchObject({ body: null, deleted: true });
  });
});

describe('silence et archivage', () => {
  const drapeaux = () => new SetConversationFlagsUseCase(access, conversations, clock);

  it('enregistre une mise en silence', async () => {
    const jusqua = new Date('2026-03-16T10:00:00.000Z');
    await drapeaux().mute('alice', 'conv-1', jusqua);

    expect(conversations.muted[0]).toEqual({
      conversationId: 'conv-1',
      userId: 'alice',
      until: jusqua,
    });
  });

  it('archive puis désarchive', async () => {
    await drapeaux().archive('alice', 'conv-1', true);
    await drapeaux().archive('alice', 'conv-1', false);

    expect(conversations.archived[0]?.at).toEqual(MAINTENANT);
    expect(conversations.archived[1]?.at).toBeNull();
  });

  it('refuse ces réglages à un non-membre', async () => {
    conversations.contexts.set('conv-2', { ...contexteOuvert(), callerId: 'charlie' });
    const erreur = await attendreErreur(drapeaux().mute('charlie', 'conv-2', null));
    expect(erreur.httpStatus).toBe(404);
  });
});
