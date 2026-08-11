import { beforeEach, describe, expect, it } from '@jest/globals';
import { BusinessError } from '../../../common/errors/business.error';
import { DEFAULT_RETRY } from '../domain/retry-policy';
import {
  DispatchNotificationUseCase,
  GetPreferencesUseCase,
  ListInboxUseCase,
  MarkNotificationReadUseCase,
  RegisterDeviceUseCase,
  SendNotificationUseCase,
  UpdatePreferencesUseCase,
  type NotificationConfig,
} from './notification.use-cases';
import {
  FakeDeviceRepository,
  FakeMailProvider,
  FakeNotificationRepository,
  FakePreferenceRepository,
  FakePushProvider,
  FakeQueue,
  FakeSmsProvider,
  FixedClock,
} from './test-doubles';

const MAINTENANT = new Date('2026-03-15T12:00:00.000Z');

const config: NotificationConfig = { retry: DEFAULT_RETRY, retentionDays: 90 };

let notifications: FakeNotificationRepository;
let preferences: FakePreferenceRepository;
let devices: FakeDeviceRepository;
let queue: FakeQueue;
let push: FakePushProvider;
let mail: FakeMailProvider;
let sms: FakeSmsProvider;
let clock: FixedClock;

/** Hachage de test : préfixé pour rendre visible qu'un hachage a bien eu lieu. */
const hacheur = { hash: (valeur: string): string => `sha256:${valeur}` };

beforeEach(() => {
  notifications = new FakeNotificationRepository();
  preferences = new FakePreferenceRepository();
  devices = new FakeDeviceRepository();
  queue = new FakeQueue();
  push = new FakePushProvider();
  mail = new FakeMailProvider();
  sms = new FakeSmsProvider();
  clock = new FixedClock(MAINTENANT);
});

const envoyer = () =>
  new SendNotificationUseCase(notifications, preferences, devices, queue, clock, config);

const distribuer = () =>
  new DispatchNotificationUseCase(notifications, devices, queue, push, mail, sms, clock, config);

const attendreErreur = async (promesse: Promise<unknown>): Promise<BusinessError> => {
  try {
    await promesse;
  } catch (erreur) {
    if (erreur instanceof BusinessError) return erreur;
    throw erreur;
  }
  throw new Error('Une BusinessError était attendue.');
};

const nouveauMatch = {
  userId: 'membre-1',
  type: 'NEW_MATCH' as const,
  title: 'Nouveau match',
  body: 'Vous avez un nouveau match.',
  dedupeKey: 'new_match:match-1',
};

describe('envoi d’une notification', () => {
  it('écrit la ligne in-app et met le push en file', async () => {
    const resultat = await envoyer().execute(nouveauMatch);

    expect(resultat.channels).toEqual(['IN_APP', 'PUSH']);
    expect(notifications.notifications).toHaveLength(2);
    // L'in-app ne passe PAS par la file : écrire, c'est livrer.
    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0]?.job.channel).toBe('PUSH');
  });

  it('marque l’in-app comme envoyée immédiatement', async () => {
    await envoyer().execute(nouveauMatch);
    const inApp = notifications.notifications.find((notif) => notif.channel === 'IN_APP');
    expect(inApp?.sentAt).toEqual(MAINTENANT);
  });

  it('respecte une préférence de désactivation', async () => {
    preferences.entries = [{ type: 'NEW_MATCH', channel: 'PUSH', enabled: false }];
    const resultat = await envoyer().execute(nouveauMatch);

    expect(resultat.channels).toEqual(['IN_APP']);
    expect(queue.jobs).toHaveLength(0);
  });

  it('IGNORE la préférence sur une alerte de sécurité', async () => {
    // Story D8-04 : l'interface n'est pas le contrôle. Un appel direct à l'API
    // ne suffit pas à se couper d'une alerte de sécurité.
    preferences.entries = [
      { type: 'SECURITY_ALERT', channel: 'PUSH', enabled: false },
      { type: 'SECURITY_ALERT', channel: 'EMAIL', enabled: false },
    ];

    const resultat = await envoyer().execute({
      userId: 'membre-1',
      type: 'SECURITY_ALERT',
      title: 'Connexion inhabituelle',
      body: 'Une connexion depuis un nouvel appareil a été détectée.',
      dedupeKey: 'security:session-9',
    });

    expect(resultat.channels).toEqual(['IN_APP', 'PUSH', 'EMAIL']);
  });

  it('n’envoie pas de push à un membre sans jeton', async () => {
    devices.pushTokens = [];
    const resultat = await envoyer().execute(nouveauMatch);

    expect(resultat.channels).toEqual(['IN_APP']);
    expect(queue.jobs).toHaveLength(0);
  });

  it('ne crée qu’une seule notification pour le même événement', async () => {
    // Story D8-06 : la contrainte unique est l'arbitre.
    const cas = envoyer();
    await cas.execute(nouveauMatch);
    const second = await cas.execute(nouveauMatch);

    expect(second.duplicate).toBe(true);
    expect(second.channels).toEqual([]);
    expect(notifications.notifications).toHaveLength(2);
    expect(queue.jobs).toHaveLength(1);
  });

  it('distingue deux événements différents du même type', async () => {
    const cas = envoyer();
    await cas.execute(nouveauMatch);
    await cas.execute({ ...nouveauMatch, dedupeKey: 'new_match:match-2' });

    expect(notifications.notifications).toHaveLength(4);
  });

  it('ne fait rien quand aucun canal n’est disponible', async () => {
    devices.pushTokens = [];
    preferences.entries = [{ type: 'NEW_MATCH', channel: 'IN_APP', enabled: false }];

    const resultat = await envoyer().execute(nouveauMatch);

    expect(resultat.channels).toEqual([]);
    expect(notifications.notifications).toHaveLength(0);
  });
});

describe('distribution sur un canal sortant', () => {
  const job = {
    notificationId: 'notif-1',
    userId: 'membre-1',
    type: 'NEW_MATCH' as const,
    channel: 'PUSH' as const,
    title: 'Nouveau match',
    body: 'Vous avez un nouveau match.',
    attempt: 1,
  };

  it('envoie le push et marque la notification comme envoyée', async () => {
    await notifications.createIfNew({
      userId: 'membre-1',
      type: 'NEW_MATCH',
      channel: 'PUSH',
      title: 'x',
      body: 'y',
      data: null,
      dedupeKey: 'k',
      purgeAt: MAINTENANT,
      now: MAINTENANT,
    });

    const resultat = await distribuer().execute(job);

    expect(resultat).toEqual({ delivered: true, retried: false });
    expect(push.sent).toHaveLength(1);
  });

  it('réessaie un échec transitoire avec un délai croissant', async () => {
    push.failWith = new Error('socket hang up');

    const resultat = await distribuer().execute(job);

    expect(resultat).toEqual({ delivered: false, retried: true });
    expect(queue.jobs[0]?.delayMs).toBe(30_000);
    expect(queue.jobs[0]?.job.attempt).toBe(2);
  });

  it('attend plus longtemps après une limitation de débit', async () => {
    push.failWith = new Error('Rate limit exceeded');
    await distribuer().execute(job);
    expect(queue.jobs[0]?.delayMs).toBe(60_000);
  });

  it('abandonne immédiatement un jeton invalide et l’efface', async () => {
    // Sans effacement, chaque notification future recréerait le même échec.
    push.failWith = new Error('Device not registered');

    const resultat = await distribuer().execute(job);

    expect(resultat).toEqual({ delivered: false, retried: false });
    expect(queue.jobs).toHaveLength(0);
    expect(devices.clearedTokens).toEqual(['jeton-push-1']);
  });

  it('abandonne au plafond de tentatives', async () => {
    push.failWith = new Error('socket hang up');

    const resultat = await distribuer().execute({ ...job, attempt: 5 });

    expect(resultat).toEqual({ delivered: false, retried: false });
    expect(queue.jobs).toHaveLength(0);
  });

  it('échappe le corps avant de l’insérer dans un e-mail', async () => {
    // Un titre ou un corps venant d'un membre ne doit pas pouvoir injecter du
    // HTML dans le message d'un autre.
    await distribuer().execute({
      ...job,
      channel: 'EMAIL',
      body: '<script>alert(1)</script>',
    });

    expect(mail.sent[0]?.html).not.toContain('<script>');
    expect(mail.sent[0]?.html).toContain('&lt;script&gt;');
  });

  it('envoie un SMS transactionnel', async () => {
    await distribuer().execute({ ...job, channel: 'SMS' });
    expect(sms.sent[0]?.phone).toBe('+237699001122');
  });

  it('refuse de traiter le canal in-app', async () => {
    // L'écriture en base EST la livraison : passer par la file serait une
    // boucle silencieuse.
    const resultat = await distribuer().execute({ ...job, channel: 'IN_APP' });
    expect(resultat.delivered).toBe(false);
  });
});

describe('centre de notifications', () => {
  beforeEach(async () => {
    await envoyer().execute(nouveauMatch);
    await envoyer().execute({ ...nouveauMatch, dedupeKey: 'new_match:match-2' });
  });

  it('liste les notifications in-app avec le compte de non-lues', async () => {
    const resultat = (await new ListInboxUseCase(notifications).execute({
      userId: 'membre-1',
      limit: 20,
      unreadOnly: false,
    })) as { items: unknown[]; unreadCount: number };

    expect(resultat.items).toHaveLength(2);
    expect(resultat.unreadCount).toBe(2);
  });

  it('marque une notification comme lue', async () => {
    const cas = new MarkNotificationReadUseCase(notifications, clock);
    const premiere = notifications.notifications.find((notif) => notif.channel === 'IN_APP');

    await cas.execute('membre-1', premiere?.id ?? '');

    expect(await notifications.countUnread('membre-1')).toBe(1);
  });

  it('répond 404 sur la notification de quelqu’un d’autre', async () => {
    const cas = new MarkNotificationReadUseCase(notifications, clock);
    const premiere = notifications.notifications[0];

    const erreur = await attendreErreur(cas.execute('intrus', premiere?.id ?? ''));
    expect(erreur.httpStatus).toBe(404);
  });

  it('marque tout comme lu', async () => {
    const cas = new MarkNotificationReadUseCase(notifications, clock);
    const resultat = await cas.all('membre-1');

    expect(resultat.updated).toBeGreaterThan(0);
    expect(await notifications.countUnread('membre-1')).toBe(0);
  });
});

describe('préférences', () => {
  it('rend la grille complète avec les verrous', async () => {
    const resultat = await new GetPreferencesUseCase(preferences).execute('membre-1');

    const securite = resultat.items.filter((item) => item.type === 'SECURITY_ALERT');
    expect(securite.length).toBeGreaterThan(0);
    expect(securite.every((item) => item.locked)).toBe(true);
    expect(securite.every((item) => item.enabled)).toBe(true);

    const match = resultat.items.filter((item) => item.type === 'NEW_MATCH');
    expect(match.every((item) => item.locked)).toBe(false);
  });

  it('n’expose que les canaux prévus pour chaque type', async () => {
    const resultat = await new GetPreferencesUseCase(preferences).execute('membre-1');
    const match = resultat.items.filter((item) => item.type === 'NEW_MATCH');
    expect(match.map((item) => item.channel).sort()).toEqual(['IN_APP', 'PUSH']);
  });

  it('enregistre une désactivation ordinaire', async () => {
    const cas = new UpdatePreferencesUseCase(preferences, clock);
    await cas.execute('membre-1', [{ type: 'NEW_MATCH', channel: 'PUSH', enabled: false }]);

    expect(preferences.entries).toEqual([{ type: 'NEW_MATCH', channel: 'PUSH', enabled: false }]);
  });

  it('REFUSE côté serveur la désactivation d’un type de sécurité', async () => {
    const cas = new UpdatePreferencesUseCase(preferences, clock);

    const erreur = await attendreErreur(
      cas.execute('membre-1', [{ type: 'SECURITY_ALERT', channel: 'PUSH', enabled: false }]),
    );

    expect(erreur.code).toBe('NOTIF_MANDATORY_TYPE');
    expect(erreur.httpStatus).toBe(403);
  });

  it('refuse TOUTE la mise à jour si une seule entrée est interdite', async () => {
    // Appliquer partiellement laisserait le membre croire que sa demande a été
    // suivie, alors qu'une partie a été ignorée en silence.
    const cas = new UpdatePreferencesUseCase(preferences, clock);

    await attendreErreur(
      cas.execute('membre-1', [
        { type: 'NEW_MATCH', channel: 'PUSH', enabled: false },
        { type: 'MODERATION_ACTION', channel: 'PUSH', enabled: false },
      ]),
    );

    expect(preferences.entries).toEqual([]);
  });

  it('autorise la réactivation d’un type de sécurité', async () => {
    const cas = new UpdatePreferencesUseCase(preferences, clock);
    await expect(
      cas.execute('membre-1', [{ type: 'SECURITY_ALERT', channel: 'PUSH', enabled: true }]),
    ).resolves.toEqual({ updated: 1 });
  });
});

describe('appareils', () => {
  it('ne stocke JAMAIS l’empreinte en clair', async () => {
    // Conservée telle quelle, elle permettrait de relier entre eux des comptes
    // distincts créés depuis le même appareil (ADR-013).
    const cas = new RegisterDeviceUseCase(devices, hacheur, clock);
    await cas.execute({
      userId: 'membre-1',
      fingerprint: 'empreinte-appareil-brute',
      type: 'ANDROID',
      model: null,
      osVersion: null,
      appVersion: null,
      pushToken: null,
    });

    expect(devices.registered[0]?.fingerprintHash).toBe('sha256:empreinte-appareil-brute');
    expect(devices.registered[0]?.fingerprintHash).not.toBe('empreinte-appareil-brute');
  });

  it('enregistre un appareil et signale la présence d’un jeton sans le rendre', async () => {
    const cas = new RegisterDeviceUseCase(devices, hacheur, clock);
    await cas.execute({
      userId: 'membre-1',
      fingerprint: 'empreinte-appareil-brute',
      type: 'ANDROID',
      model: 'Tecno Spark',
      osVersion: '13',
      appVersion: '1.0.0',
      pushToken: 'jeton-secret',
    });

    const liste = (await cas.list('membre-1')) as { items: Record<string, unknown>[] };
    expect(liste.items[0]).toMatchObject({ hasPushToken: true });
    expect(JSON.stringify(liste.items)).not.toContain('jeton-secret');
  });

  it('répond 404 en retirant l’appareil d’un autre membre', async () => {
    const cas = new RegisterDeviceUseCase(devices, hacheur, clock);
    await cas.execute({
      userId: 'membre-1',
      fingerprint: 'empreinte-quelconque',
      type: 'ANDROID',
      model: null,
      osVersion: null,
      appVersion: null,
      pushToken: null,
    });

    const erreur = await attendreErreur(cas.remove('intrus', 'device-1'));
    expect(erreur.httpStatus).toBe(404);
  });
});
