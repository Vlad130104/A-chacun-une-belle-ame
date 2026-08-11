import { beforeEach, describe, expect, it } from '@jest/globals';
import { BusinessError } from '../../../common/errors/business.error';
import type { BehaviourObservation, DetectionThresholds } from '../domain/detection-rules';
import {
  ApplyModerationActionUseCase,
  AssignCaseUseCase,
  EvaluateBehaviourUseCase,
  RevertActionUseCase,
  SubmitReportUseCase,
  type ModerationConfig,
} from './moderation.use-cases';
import {
  FakeAuditWriter,
  FakeBehaviourSource,
  FakeCaseRepository,
  FakeDecisionNotifier,
  FakeMessageModerationGateway,
  FakePhotoModerationGateway,
  FakeReportRepository,
  FakeSanctionGateway,
  FixedClock,
} from './test-doubles';

const MAINTENANT = new Date('2026-05-10T12:00:00.000Z');

const SEUILS: DetectionThresholds = {
  moneyRequestCount: 3,
  moneyRequestWindowHours: 24,
  bulkSimilarCount: 5,
  bulkSimilarRatio: 0.9,
  accountCreationCount: 3,
  accountCreationWindowDays: 30,
  deviceChangeCount: 5,
  deviceChangeWindowDays: 7,
  likeVolumeMultiplier: 3,
  verificationRefusalCount: 3,
  multipleReportsCount: 3,
  multipleReportsWindowDays: 7,
  suspiciousLinkCount: 3,
  automationMinIntervalMs: 400,
  automationSampleSize: 10,
};

const config: ModerationConfig = {
  sla: { P0_CRITICAL: 2, P1_HIGH: 6, P2_NORMAL: 24, P3_LOW: 72 },
  dailyReportLimit: 10,
  dailyEvidenceLimit: 20,
  reopenWindowDays: 30,
  maxEvidenceBytes: 8 * 1024 * 1024,
  thresholds: SEUILS,
};

const observationCalme: BehaviourObservation = {
  userId: 'bob',
  moneyRequestSignals: 0,
  moneyRequestWindowHours: 24,
  recentMessageCount: 5,
  duplicateMessageRatio: 0.1,
  accountsFromSameDevice: 1,
  accountCreationWindowDays: 30,
  distinctDevicesUsed: 1,
  deviceWindowDays: 7,
  likesToday: 5,
  platformMedianLikesPerDay: 10,
  verificationRefusals: 0,
  distinctReportersRecently: 0,
  reportWindowDays: 7,
  suspiciousLinkSignals: 0,
  actionIntervalsMs: [2000, 3000],
};

let reports: FakeReportRepository;
let cases: FakeCaseRepository;
let sanctions: FakeSanctionGateway;
let photos: FakePhotoModerationGateway;
let messages: FakeMessageModerationGateway;
let notifier: FakeDecisionNotifier;
let audit: FakeAuditWriter;
let clock: FixedClock;

beforeEach(() => {
  reports = new FakeReportRepository();
  cases = new FakeCaseRepository();
  sanctions = new FakeSanctionGateway();
  photos = new FakePhotoModerationGateway();
  messages = new FakeMessageModerationGateway();
  notifier = new FakeDecisionNotifier();
  audit = new FakeAuditWriter();
  clock = new FixedClock(MAINTENANT);
});

const signaler = () => new SubmitReportUseCase(reports, cases, notifier, clock, config);

const agir = () =>
  new ApplyModerationActionUseCase(cases, sanctions, photos, messages, notifier, audit, clock);

const attendreErreur = async (promesse: Promise<unknown>): Promise<BusinessError> => {
  try {
    await promesse;
  } catch (erreur) {
    if (erreur instanceof BusinessError) return erreur;
    throw erreur;
  }
  throw new Error('Une BusinessError était attendue.');
};

const signalement = {
  reporterId: 'alice',
  reportedUserId: 'bob',
  targetType: 'PROFILE' as const,
  targetId: null,
  category: 'HARASSMENT' as const,
  description: null,
};

describe('déposer un signalement', () => {
  it('ouvre un cas et calcule sa priorité et son échéance', async () => {
    const resultat = await signaler().execute(signalement);

    expect(resultat.priority).toBe('P1_HIGH');
    expect(cases.cases).toHaveLength(1);
    expect(cases.cases[0]?.slaDueAt.toISOString()).toBe('2026-05-10T18:00:00.000Z');
  });

  it('accuse réception au signalant', async () => {
    // Sans retour, un membre conclut que signaler ne sert à rien et cesse de le faire.
    await signaler().execute(signalement);
    expect(notifier.acknowledgements).toHaveLength(1);
  });

  it('rattache un second signalement au cas ouvert au lieu d’en créer un autre', async () => {
    await signaler().execute(signalement);
    await signaler().execute({ ...signalement, reporterId: 'carine', category: 'SPAM' });

    expect(cases.cases).toHaveLength(1);
    expect(cases.cases[0]?.reportCount).toBe(2);
  });

  it('fait monter la priorité du cas sans jamais la faire redescendre', async () => {
    await signaler().execute({ ...signalement, category: 'SPAM' });
    expect(cases.cases[0]?.priority).toBe('P3_LOW');

    await signaler().execute({
      ...signalement,
      reporterId: 'carine',
      category: 'UNDERAGE_SUSPICION',
    });
    expect(cases.cases[0]?.priority).toBe('P0_CRITICAL');

    await signaler().execute({ ...signalement, reporterId: 'david', category: 'OTHER' });
    expect(cases.cases[0]?.priority).toBe('P0_CRITICAL');
  });

  it('recompte l’échéance depuis l’ouverture du cas quand la priorité monte', async () => {
    // Un cas ouvert depuis longtemps qui devient critique doit apparaître en
    // retard, pas se voir offrir un délai neuf.
    cases.seed({
      id: 'ancien',
      subjectId: 'bob',
      priority: 'P3_LOW',
      createdAt: new Date('2026-05-10T07:00:00.000Z'),
    });

    await signaler().execute({ ...signalement, category: 'UNDERAGE_SUSPICION' });

    const echeance = cases.cases[0]?.slaDueAt;
    expect(echeance?.toISOString()).toBe('2026-05-10T09:00:00.000Z');
    expect(echeance!.getTime()).toBeLessThan(MAINTENANT.getTime());
  });

  it('refuse l’auto-signalement', async () => {
    const erreur = await attendreErreur(
      signaler().execute({ ...signalement, reportedUserId: 'alice' }),
    );
    expect(erreur.httpStatus).toBe(400);
    expect(cases.cases).toHaveLength(0);
  });

  it('refuse au-delà du quota quotidien avec un 429', async () => {
    reports.reportsTodayByReporter.set('alice', 10);
    const erreur = await attendreErreur(signaler().execute(signalement));

    expect(erreur.code).toBe('MOD_REPORT_LIMIT');
    expect(erreur.httpStatus).toBe(429);
  });

  it('accepte un signalement sur un membre déjà signalé par quelqu’un d’autre', async () => {
    // La déduplication se fait au niveau du cas, jamais du signalant.
    await signaler().execute(signalement);
    await expect(
      signaler().execute({ ...signalement, reporterId: 'carine' }),
    ).resolves.toMatchObject({ caseId: cases.cases[0]?.id });
  });
});

describe('appliquer une action', () => {
  beforeEach(() => {
    cases.seed({ id: 'cas-1', subjectId: 'bob', status: 'ASSIGNED', assignedToUserId: 'mod-1' });
  });

  const action = {
    moderatorId: 'mod-1',
    moderatorRole: 'MODERATOR',
    actorPermissions: ['moderation.act', 'users.ban'],
    caseId: 'cas-1',
    reasonCode: 'HARCELEMENT',
    note: null,
    approvedByUserId: null,
    effectiveUntil: null,
    targetId: null,
  };

  it('enregistre un avertissement et notifie le membre', async () => {
    await agir().execute({ ...action, action: 'WARNING' });

    expect(cases.actions).toHaveLength(1);
    expect(notifier.decisions[0]).toMatchObject({ userId: 'bob', action: 'WARNING' });
    expect(sanctions.statuses).toHaveLength(0);
  });

  it('suspend le compte et trace l’action dans l’audit', async () => {
    await agir().execute({
      ...action,
      action: 'SUSPENSION',
      effectiveUntil: new Date('2026-05-17T12:00:00.000Z'),
    });

    expect(sanctions.statuses[0]).toMatchObject({ userId: 'bob', status: 'SUSPENDED' });
    expect(audit.entries.map((entree) => entree.action)).toContain('moderation.action.suspension');
  });

  it('refuse une suspension sans échéance', async () => {
    // Une sanction temporaire sans échéance deviendrait définitive par accident.
    const erreur = await attendreErreur(agir().execute({ ...action, action: 'SUSPENSION' }));

    expect(erreur.code).toBe('VALIDATION_FAILED');
    expect(sanctions.statuses).toHaveLength(0);
  });

  it('refuse un bannissement sans second valideur', async () => {
    const erreur = await attendreErreur(agir().execute({ ...action, action: 'BAN' }));

    expect(erreur.code).toBe('MOD_SECOND_APPROVER_REQUIRED');
    expect(sanctions.statuses).toHaveLength(0);
    expect(cases.actions).toHaveLength(0);
  });

  it('refuse un bannissement auto-validé', async () => {
    const erreur = await attendreErreur(
      agir().execute({ ...action, action: 'BAN', approvedByUserId: 'mod-1' }),
    );
    expect(erreur.code).toBe('MOD_SECOND_APPROVER_REQUIRED');
  });

  it('refuse un bannissement à un modérateur sans la permission users.ban', async () => {
    // `moderation.act` ouvre la route ; bannir exige une permission de plus.
    // Le contrôle est fait côté serveur : la politique de route est évaluée
    // avant le corps de la requête et ignore l'action demandée.
    const erreur = await attendreErreur(
      agir().execute({
        ...action,
        actorPermissions: ['moderation.act'],
        action: 'BAN',
        approvedByUserId: 'chef-1',
      }),
    );

    expect(erreur.httpStatus).toBe(403);
    expect(sanctions.statuses).toHaveLength(0);
    expect(sanctions.blockedIdentities).toHaveLength(0);
  });

  it('bannit avec second valideur et bloque l’identité', async () => {
    await agir().execute({ ...action, action: 'BAN', approvedByUserId: 'chef-1' });

    expect(sanctions.statuses[0]).toMatchObject({ status: 'BANNED' });
    // ADR-013 : empreintes salées conservées, aucune donnée en clair.
    expect(sanctions.blockedIdentities).toEqual(['bob']);
  });

  it('refuse une action sur un cas déjà clos', async () => {
    cases.seed({ id: 'cas-clos', subjectId: 'bob', status: 'RESOLVED' });
    const erreur = await attendreErreur(
      agir().execute({ ...action, caseId: 'cas-clos', action: 'WARNING' }),
    );

    expect(erreur.code).toBe('MOD_CASE_ALREADY_RESOLVED');
  });

  it('refuse une action par un modérateur qui n’est pas l’attributaire', async () => {
    const erreur = await attendreErreur(
      agir().execute({ ...action, moderatorId: 'mod-2', action: 'WARNING' }),
    );
    expect(erreur.httpStatus).toBe(400);
  });

  it('masque la photo visée sans toucher au compte', async () => {
    await agir().execute({ ...action, action: 'PHOTO_HIDDEN', targetId: 'photo-9' });

    expect(photos.hidden).toEqual(['photo-9']);
    expect(sanctions.statuses).toHaveLength(0);
  });

  it('masque le message visé', async () => {
    await agir().execute({ ...action, action: 'CONTENT_REMOVED', targetId: 'msg-3' });
    expect(messages.hidden).toEqual(['msg-3']);
  });

  it('enregistre la décision AVANT d’en appliquer les effets', async () => {
    // Si un effet échoue, il doit rester une trace de ce qui a été décidé et par
    // qui. L'inverse laisserait un compte suspendu sans décision associée.
    const echoue = new FakeSanctionGateway();
    echoue.applyStatus = () => Promise.reject(new Error('base indisponible'));

    const casUsage = new ApplyModerationActionUseCase(
      cases,
      echoue,
      photos,
      messages,
      notifier,
      audit,
      clock,
    );

    await expect(
      casUsage.execute({
        ...action,
        action: 'SUSPENSION',
        effectiveUntil: new Date('2026-05-17T12:00:00.000Z'),
      }),
    ).rejects.toThrow('base indisponible');

    expect(cases.actions).toHaveLength(1);
  });

  it('classe un cas sans suite sans notifier le membre', async () => {
    // Un membre signalé à tort n'a pas à apprendre qu'il l'a été.
    await agir().execute({ ...action, action: 'DISMISSED' });

    expect(cases.cases[0]?.status).toBe('DISMISSED');
    expect(notifier.decisions).toHaveLength(0);
  });
});

describe('annuler une sanction', () => {
  const annuler = () => new RevertActionUseCase(cases, sanctions, audit, clock);

  beforeEach(() => {
    cases.seed({ id: 'cas-1', subjectId: 'bob', status: 'ASSIGNED', assignedToUserId: 'mod-1' });
  });

  it('rétablit le compte après annulation d’une restriction', async () => {
    await agir().execute({
      moderatorId: 'mod-1',
      moderatorRole: 'MODERATOR',
      actorPermissions: ['moderation.act'],
      caseId: 'cas-1',
      action: 'TEMPORARY_RESTRICTION',
      reasonCode: 'SPAM',
      note: null,
      approvedByUserId: null,
      effectiveUntil: new Date('2026-05-12T12:00:00.000Z'),
      targetId: null,
    });

    const actionId = cases.actions[0]?.id ?? '';
    await annuler().execute({
      moderatorId: 'mod-1',
      moderatorRole: 'MODERATOR',
      actionId,
      reasonCode: 'ERREUR',
    });

    expect(sanctions.statuses.at(-1)).toMatchObject({ userId: 'bob', status: 'ACTIVE' });
    expect(cases.actions[0]?.revertedAt).not.toBeNull();
  });

  it('refuse d’annuler un bannissement', async () => {
    // Un bannissement se lève par une réintégration explicite et tracée, jamais
    // en effaçant la sanction d'origine.
    await agir().execute({
      moderatorId: 'mod-1',
      moderatorRole: 'MODERATOR',
      actorPermissions: ['moderation.act', 'users.ban'],
      caseId: 'cas-1',
      action: 'BAN',
      reasonCode: 'ARNAQUE',
      note: null,
      approvedByUserId: 'chef-1',
      effectiveUntil: null,
      targetId: null,
    });

    const actionId = cases.actions[0]?.id ?? '';
    const erreur = await attendreErreur(
      annuler().execute({
        moderatorId: 'mod-1',
        moderatorRole: 'MODERATOR',
        actionId,
        reasonCode: 'ERREUR',
      }),
    );

    expect(erreur.httpStatus).toBe(403);
  });
});

describe('attribution d’un cas', () => {
  const attribuer = () => new AssignCaseUseCase(cases, audit, clock);

  it('attribue un cas libre et l’audite', async () => {
    cases.seed({ id: 'cas-1', subjectId: 'bob' });
    await attribuer().execute({
      moderatorId: 'mod-1',
      moderatorRole: 'MODERATOR',
      caseId: 'cas-1',
      assignTo: 'mod-1',
    });

    expect(cases.cases[0]?.assignedToUserId).toBe('mod-1');
    expect(audit.entries.map((entree) => entree.action)).toContain('moderation.case.assigned');
  });

  it('refuse de prendre le cas d’un autre modérateur', async () => {
    cases.seed({ id: 'cas-1', subjectId: 'bob', status: 'ASSIGNED', assignedToUserId: 'mod-1' });
    const erreur = await attendreErreur(
      attribuer().execute({
        moderatorId: 'mod-2',
        moderatorRole: 'MODERATOR',
        caseId: 'cas-1',
        assignTo: 'mod-2',
      }),
    );

    expect(erreur.httpStatus).toBe(409);
  });
});

describe('évaluation des règles de détection', () => {
  const evaluer = (observation: BehaviourObservation) =>
    new EvaluateBehaviourUseCase(new FakeBehaviourSource(observation), cases, clock, config);

  it('ne crée rien sur un membre au comportement ordinaire', async () => {
    const resultat = await evaluer(observationCalme).execute('bob');

    expect(resultat).toEqual({ signals: 0, severity: 0, caseId: null });
    expect(cases.cases).toHaveLength(0);
    expect(cases.signals).toHaveLength(0);
  });

  it('n’applique JAMAIS de sanction, quelle que soit la gravité', async () => {
    // ADR-012 : une règle produit un signal et priorise un cas. Elle ne
    // sanctionne pas. `sanctions` n'est même pas une dépendance de ce cas d'usage.
    await evaluer({
      ...observationCalme,
      moneyRequestSignals: 20,
      suspiciousLinkSignals: 20,
      accountsFromSameDevice: 9,
    }).execute('bob');

    expect(sanctions.statuses).toHaveLength(0);
    expect(sanctions.blockedIdentities).toHaveLength(0);
  });

  it('ouvre un cas quand la sévérité cumulée le justifie', async () => {
    const resultat = await evaluer({ ...observationCalme, moneyRequestSignals: 5 }).execute('bob');

    expect(resultat.signals).toBe(1);
    expect(cases.cases).toHaveLength(1);
    expect(resultat.caseId).toBe(cases.cases[0]?.id);
  });

  it('conserve un signal faible sans ouvrir de dossier', async () => {
    // L'accumulation déclenche l'ouverture, pas le premier soupçon.
    const resultat = await evaluer({ ...observationCalme, distinctDevicesUsed: 6 }).execute('bob');

    expect(resultat.signals).toBe(1);
    expect(cases.cases).toHaveLength(0);
    expect(cases.signals[0]?.caseId).toBeNull();
  });

  it('rattache les signaux au cas déjà ouvert', async () => {
    cases.seed({ id: 'cas-1', subjectId: 'bob' });
    await evaluer({ ...observationCalme, moneyRequestSignals: 5 }).execute('bob');

    expect(cases.cases).toHaveLength(1);
    expect(cases.signals[0]?.caseId).toBe('cas-1');
  });
});
