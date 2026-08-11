import { describe, expect, it } from '@jest/globals';
import {
  checkReportSubmission,
  escalatePriority,
  priorityFor,
  priorityRank,
  recomputeSlaDueAt,
  routeReport,
  slaDueAt,
  type CasePriority,
  type ExistingCase,
  type ReportCategory,
  type ReportSubmission,
  type SlaConfig,
} from './report-policy';

const SLA: SlaConfig = { P0_CRITICAL: 2, P1_HIGH: 6, P2_NORMAL: 24, P3_LOW: 72 };
const MAINTENANT = new Date('2026-05-10T12:00:00.000Z');

const soumission = (surcharge: Partial<ReportSubmission> = {}): ReportSubmission => ({
  reporterId: 'alice',
  reportedUserId: 'bob',
  targetType: 'PROFILE',
  targetId: null,
  reportsToday: 0,
  dailyLimit: 10,
  ...surcharge,
});

describe('barème de priorité', () => {
  it('classe la suspicion de minorité en P0, seule', () => {
    // Le seul motif où l'erreur de ne rien faire est irréparable.
    expect(priorityFor('UNDERAGE_SUSPICION')).toBe('P0_CRITICAL');

    const autres: ReportCategory[] = [
      'IDENTITY_THEFT',
      'FINANCIAL_SOLICITATION',
      'SCAM_SUSPICION',
      'HARASSMENT',
      'HATE_SPEECH',
      'SEXUAL_CONTENT',
      'INAPPROPRIATE_PHOTO',
      'FAKE_PROFILE',
      'SPAM',
      'OTHER',
    ];
    expect(autres.some((categorie) => priorityFor(categorie) === 'P0_CRITICAL')).toBe(false);
  });

  it.each([
    ['IDENTITY_THEFT', 'P1_HIGH'],
    ['FINANCIAL_SOLICITATION', 'P1_HIGH'],
    ['SCAM_SUSPICION', 'P1_HIGH'],
    ['HARASSMENT', 'P1_HIGH'],
    ['HATE_SPEECH', 'P1_HIGH'],
    ['SEXUAL_CONTENT', 'P2_NORMAL'],
    ['INAPPROPRIATE_PHOTO', 'P2_NORMAL'],
    ['FAKE_PROFILE', 'P2_NORMAL'],
    ['SPAM', 'P3_LOW'],
    ['OTHER', 'P3_LOW'],
  ])('classe %s en %s', (categorie, attendue) => {
    expect(priorityFor(categorie as ReportCategory)).toBe(attendue);
  });

  it('ordonne les priorités du plus urgent au moins urgent', () => {
    const rangs: CasePriority[] = ['P0_CRITICAL', 'P1_HIGH', 'P2_NORMAL', 'P3_LOW'];
    const valeurs = rangs.map(priorityRank);
    expect(valeurs).toEqual([...valeurs].sort((a, b) => a - b));
  });
});

describe('escalade de priorité', () => {
  it('monte quand le nouveau signalement est plus grave', () => {
    expect(escalatePriority('P3_LOW', 'P0_CRITICAL')).toBe('P0_CRITICAL');
  });

  it('ne redescend jamais', () => {
    // Sinon un spammeur pourrait diluer un signalement grave sous des bénins.
    expect(escalatePriority('P0_CRITICAL', 'P3_LOW')).toBe('P0_CRITICAL');
  });

  it('laisse inchangée une priorité égale', () => {
    expect(escalatePriority('P2_NORMAL', 'P2_NORMAL')).toBe('P2_NORMAL');
  });
});

describe('échéance de traitement', () => {
  it.each([
    ['P0_CRITICAL', '2026-05-10T14:00:00.000Z'],
    ['P1_HIGH', '2026-05-10T18:00:00.000Z'],
    ['P2_NORMAL', '2026-05-11T12:00:00.000Z'],
    ['P3_LOW', '2026-05-13T12:00:00.000Z'],
  ])('calcule l’échéance %s', (priorite, attendue) => {
    expect(slaDueAt(priorite as CasePriority, MAINTENANT, SLA).toISOString()).toBe(attendue);
  });

  it('recompte depuis l’OUVERTURE du cas quand la priorité monte', () => {
    // Un cas ouvert il y a cinq heures qui devient critique est déjà en retard.
    // Repartir de maintenant lui offrirait un délai supplémentaire à la faveur
    // d'un signalement plus grave — exactement l'inverse de ce qu'il faut.
    const ouvertureIlYA5h = new Date('2026-05-10T07:00:00.000Z');
    const echeance = recomputeSlaDueAt('P0_CRITICAL', ouvertureIlYA5h, SLA);

    expect(echeance.toISOString()).toBe('2026-05-10T09:00:00.000Z');
    expect(echeance.getTime()).toBeLessThan(MAINTENANT.getTime());
  });
});

describe('recevabilité d’un signalement', () => {
  it('accepte un signalement ordinaire', () => {
    expect(checkReportSubmission(soumission())).toEqual({ accepted: true });
  });

  it('accepte un signalement en double sur le même membre', () => {
    // Refuser apprendrait au membre que son premier signalement n'a rien changé.
    // La déduplication se fait au niveau du cas, jamais du signalant.
    expect(checkReportSubmission(soumission({ reportsToday: 4 }))).toEqual({ accepted: true });
  });

  it('refuse l’auto-signalement', () => {
    expect(checkReportSubmission(soumission({ reportedUserId: 'alice' }))).toEqual({
      accepted: false,
      reason: 'SELF_REPORT',
    });
  });

  it('refuse au-delà du quota quotidien', () => {
    expect(checkReportSubmission(soumission({ reportsToday: 10 }))).toEqual({
      accepted: false,
      reason: 'DAILY_LIMIT',
    });
  });

  it('accepte le dernier signalement avant le quota', () => {
    expect(checkReportSubmission(soumission({ reportsToday: 9 }))).toEqual({ accepted: true });
  });

  it.each([['PHOTO'], ['MESSAGE']])('exige une cible désignée pour un signalement %s', (type) => {
    const verdict = checkReportSubmission(
      soumission({ targetType: type as 'PHOTO' | 'MESSAGE', targetId: null }),
    );
    expect(verdict).toEqual({ accepted: false, reason: 'TARGET_REQUIRED' });
  });

  it.each([['PROFILE'], ['BEHAVIOR']])('n’exige aucune cible pour un signalement %s', (type) => {
    const verdict = checkReportSubmission(
      soumission({ targetType: type as 'PROFILE' | 'BEHAVIOR', targetId: null }),
    );
    expect(verdict).toEqual({ accepted: true });
  });

  it('fait primer l’auto-signalement sur le quota', () => {
    const verdict = checkReportSubmission(
      soumission({ reportedUserId: 'alice', reportsToday: 99 }),
    );
    expect(verdict).toEqual({ accepted: false, reason: 'SELF_REPORT' });
  });
});

describe('acheminement vers un cas', () => {
  const casOuvert: ExistingCase = {
    id: 'cas-1',
    status: 'OPEN',
    priority: 'P3_LOW',
    createdAt: new Date('2026-05-09T12:00:00.000Z'),
    resolvedAt: null,
  };

  const casResolu = (resolvedAt: string): ExistingCase => ({
    id: 'cas-2',
    status: 'RESOLVED',
    priority: 'P2_NORMAL',
    createdAt: new Date('2026-04-01T12:00:00.000Z'),
    resolvedAt: new Date(resolvedAt),
  });

  it('ouvre un cas quand le membre n’en a aucun', () => {
    expect(routeReport('P2_NORMAL', null, null, MAINTENANT, 30)).toEqual({
      action: 'CREATE',
      priority: 'P2_NORMAL',
    });
  });

  it('rattache au cas ouvert et fait monter sa priorité', () => {
    expect(routeReport('P0_CRITICAL', casOuvert, null, MAINTENANT, 30)).toEqual({
      action: 'ATTACH',
      caseId: 'cas-1',
      priority: 'P0_CRITICAL',
    });
  });

  it('rouvre un cas résolu récemment plutôt que d’en créer un second', () => {
    // Même personne, même problème : l'historique doit rester d'un seul tenant.
    const routage = routeReport(
      'P1_HIGH',
      null,
      casResolu('2026-05-01T12:00:00.000Z'),
      MAINTENANT,
      30,
    );
    expect(routage).toEqual({ action: 'REOPEN', caseId: 'cas-2', priority: 'P1_HIGH' });
  });

  it('ouvre un nouveau cas au-delà de la fenêtre de réouverture', () => {
    const routage = routeReport(
      'P1_HIGH',
      null,
      casResolu('2026-03-01T12:00:00.000Z'),
      MAINTENANT,
      30,
    );
    expect(routage).toEqual({ action: 'CREATE', priority: 'P1_HIGH' });
  });

  it('préfère toujours le cas ouvert au cas résolu', () => {
    const routage = routeReport(
      'P2_NORMAL',
      casOuvert,
      casResolu('2026-05-09T12:00:00.000Z'),
      MAINTENANT,
      30,
    );
    expect(routage).toMatchObject({ action: 'ATTACH', caseId: 'cas-1' });
  });
});
