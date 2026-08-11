import type { BehaviourObservation, DetectionSignal } from '../domain/detection-rules';
import type { ModerationActionType } from '../domain/case-policy';
import type {
  AccountSanctionGateway,
  AuditWriter,
  BehaviourSource,
  CaseHistory,
  CaseRecord,
  CreateReportInput,
  DecisionNotifier,
  EvidenceStorage,
  MessageModerationGateway,
  ModerationCaseRepository,
  PhotoModerationGateway,
  ReportRecord,
  ReportRepository,
} from './ports';

/**
 * Doublures en mémoire des ports de modération.
 *
 * Elles reproduisent le comportement observable des dépôts : montée de priorité,
 * recalcul d'échéance, immuabilité de l'historique. Les cas d'usage sont ainsi
 * testés sur des règles et non sur des espions muets.
 */
export class FakeReportRepository implements ReportRepository {
  reports: ReportRecord[] = [];
  evidence: { reportId: string; storageKey: string }[] = [];
  reportsTodayByReporter = new Map<string, number>();
  evidenceTodayByReporter = new Map<string, number>();
  private sequence = 0;

  countByReporterSince(reporterId: string): Promise<number> {
    return Promise.resolve(this.reportsTodayByReporter.get(reporterId) ?? 0);
  }

  create(input: CreateReportInput): Promise<ReportRecord> {
    this.sequence += 1;
    const report: ReportRecord = {
      id: `report-${this.sequence}`,
      reporterId: input.reporterId,
      reportedUserId: input.reportedUserId,
      targetType: input.targetType,
      targetId: input.targetId,
      category: input.category,
      caseId: input.caseId,
      createdAt: input.now,
    };
    this.reports.push(report);
    return Promise.resolve(report);
  }

  addEvidence(reportId: string, _reporterId: string, storageKey: string): Promise<void> {
    this.evidence.push({ reportId, storageKey });
    return Promise.resolve();
  }

  countEvidenceSince(reporterId: string): Promise<number> {
    return Promise.resolve(this.evidenceTodayByReporter.get(reporterId) ?? 0);
  }

  findById(reportId: string): Promise<ReportRecord | null> {
    return Promise.resolve(this.reports.find((report) => report.id === reportId) ?? null);
  }

  listByReporter(
    input: Parameters<ReportRepository['listByReporter']>[0],
  ): ReturnType<ReportRepository['listByReporter']> {
    const items = this.reports
      .filter((report) => report.reporterId === input.reporterId)
      .slice(0, input.limit)
      .map((report) => ({
        id: report.id,
        category: report.category,
        caseStatus: 'OPEN',
        createdAt: report.createdAt,
      }));
    return Promise.resolve({ items, nextCursor: null, hasMore: false });
  }
}

export class FakeCaseRepository implements ModerationCaseRepository {
  cases: CaseRecord[] = [];
  actions: {
    id: string;
    caseId: string;
    type: ModerationActionType;
    reasonCode: string;
    performedByUserId: string | null;
    approvedByUserId: string | null;
    revertedAt: Date | null;
  }[] = [];
  signals: { subjectId: string; caseId: string | null; signals: DetectionSignal[] }[] = [];
  histories = new Map<string, CaseHistory>();
  private sequence = 0;

  findOpenBySubject(subjectId: string): Promise<CaseRecord | null> {
    const ouvert = this.cases.find(
      (dossier) =>
        dossier.subjectId === subjectId &&
        dossier.status !== 'RESOLVED' &&
        dossier.status !== 'DISMISSED',
    );
    return Promise.resolve(ouvert ?? null);
  }

  findMostRecentResolvedBySubject(subjectId: string): Promise<CaseRecord | null> {
    const resolus = this.cases
      .filter((dossier) => dossier.subjectId === subjectId && dossier.resolvedAt !== null)
      .sort((a, b) => (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0));
    return Promise.resolve(resolus[0] ?? null);
  }

  findById(caseId: string): Promise<CaseRecord | null> {
    return Promise.resolve(this.cases.find((dossier) => dossier.id === caseId) ?? null);
  }

  loadHistory(caseId: string): Promise<CaseHistory | null> {
    return Promise.resolve(this.histories.get(caseId) ?? null);
  }

  create(input: Parameters<ModerationCaseRepository['create']>[0]): Promise<CaseRecord> {
    this.sequence += 1;
    const dossier: CaseRecord = {
      id: `case-${this.sequence}`,
      subjectId: input.subjectId,
      priority: input.priority,
      status: 'OPEN',
      assignedToUserId: null,
      slaDueAt: input.slaDueAt,
      resolvedAt: null,
      reportCount: 1,
      createdAt: input.now,
    };
    this.cases.push(dossier);
    return Promise.resolve(dossier);
  }

  attachReport(
    input: Parameters<ModerationCaseRepository['attachReport']>[0],
  ): Promise<CaseRecord> {
    const dossier = this.cases.find((candidat) => candidat.id === input.caseId);
    if (dossier === undefined) throw new Error('cas introuvable');

    dossier.priority = input.priority;
    dossier.slaDueAt = input.slaDueAt;
    dossier.reportCount += 1;
    if (input.reopen) {
      dossier.status = 'OPEN';
      dossier.resolvedAt = null;
    }
    return Promise.resolve(dossier);
  }

  listQueue(
    input: Parameters<ModerationCaseRepository['listQueue']>[0],
  ): ReturnType<ModerationCaseRepository['listQueue']> {
    const items = this.cases
      .filter((dossier) => input.status === undefined || dossier.status === input.status)
      .slice(0, input.limit);
    return Promise.resolve({ items, nextCursor: null, hasMore: false });
  }

  assign(caseId: string, moderatorId: string | null): Promise<void> {
    const dossier = this.cases.find((candidat) => candidat.id === caseId);
    if (dossier !== undefined) {
      dossier.assignedToUserId = moderatorId;
      dossier.status = moderatorId === null ? 'OPEN' : 'ASSIGNED';
    }
    return Promise.resolve();
  }

  recordAction(
    input: Parameters<ModerationCaseRepository['recordAction']>[0],
  ): Promise<{ actionId: string }> {
    this.sequence += 1;
    const actionId = `action-${this.sequence}`;
    this.actions.push({
      id: actionId,
      caseId: input.caseId,
      type: input.type,
      reasonCode: input.reasonCode,
      performedByUserId: input.performedByUserId,
      approvedByUserId: input.approvedByUserId,
      revertedAt: null,
    });

    if (input.nextCaseStatus !== null) {
      const dossier = this.cases.find((candidat) => candidat.id === input.caseId);
      if (dossier !== undefined) {
        dossier.status = input.nextCaseStatus;
        if (input.nextCaseStatus === 'RESOLVED' || input.nextCaseStatus === 'DISMISSED') {
          dossier.resolvedAt = input.now;
        }
      }
    }

    return Promise.resolve({ actionId });
  }

  findAction(actionId: string): Promise<{
    id: string;
    caseId: string;
    type: ModerationActionType;
    revertedAt: Date | null;
  } | null> {
    const action = this.actions.find((candidat) => candidat.id === actionId);
    return Promise.resolve(
      action === undefined
        ? null
        : {
            id: action.id,
            caseId: action.caseId,
            type: action.type,
            revertedAt: action.revertedAt,
          },
    );
  }

  revertAction(actionId: string, _byUserId: string, at: Date): Promise<void> {
    const action = this.actions.find((candidat) => candidat.id === actionId);
    if (action !== undefined) action.revertedAt = at;
    return Promise.resolve();
  }

  saveSignals(subjectId: string, caseId: string | null, signals: DetectionSignal[]): Promise<void> {
    this.signals.push({ subjectId, caseId, signals });
    return Promise.resolve();
  }

  metrics(): ReturnType<ModerationCaseRepository['metrics']> {
    const byPriority: Record<string, number> = {};
    for (const dossier of this.cases) {
      byPriority[dossier.priority] = (byPriority[dossier.priority] ?? 0) + 1;
    }
    return Promise.resolve({
      open: this.cases.filter((dossier) => dossier.resolvedAt === null).length,
      overdue: 0,
      byPriority,
      medianResolutionMinutes: null,
    });
  }

  /** Raccourci de test : place un cas dans un état donné. */
  seed(surcharge: Partial<CaseRecord> & { id: string; subjectId: string }): CaseRecord {
    const dossier: CaseRecord = {
      priority: 'P2_NORMAL',
      status: 'OPEN',
      assignedToUserId: null,
      slaDueAt: new Date('2026-05-11T12:00:00.000Z'),
      resolvedAt: null,
      reportCount: 1,
      createdAt: new Date('2026-05-10T12:00:00.000Z'),
      ...surcharge,
    };
    this.cases.push(dossier);
    return dossier;
  }
}

export class FakeSanctionGateway implements AccountSanctionGateway {
  statuses: { userId: string; status: string; until: Date | null }[] = [];
  reverifications: string[] = [];
  blockedIdentities: string[] = [];

  applyStatus(userId: string, status: string, until: Date | null): Promise<void> {
    this.statuses.push({ userId, status, until });
    return Promise.resolve();
  }

  requireReverification(userId: string): Promise<void> {
    this.reverifications.push(userId);
    return Promise.resolve();
  }

  blockIdentityOnBan(userId: string): Promise<void> {
    this.blockedIdentities.push(userId);
    return Promise.resolve();
  }
}

export class FakePhotoModerationGateway implements PhotoModerationGateway {
  hidden: string[] = [];

  hide(photoId: string): Promise<void> {
    this.hidden.push(photoId);
    return Promise.resolve();
  }
}

export class FakeMessageModerationGateway implements MessageModerationGateway {
  hidden: string[] = [];

  hide(messageId: string): Promise<void> {
    this.hidden.push(messageId);
    return Promise.resolve();
  }
}

export class FakeDecisionNotifier implements DecisionNotifier {
  decisions: { userId: string; action: ModerationActionType; caseId: string }[] = [];
  acknowledgements: { reporterId: string; reportId: string }[] = [];

  notifyModerationDecision(
    input: Parameters<DecisionNotifier['notifyModerationDecision']>[0],
  ): Promise<void> {
    this.decisions.push({ userId: input.userId, action: input.action, caseId: input.caseId });
    return Promise.resolve();
  }

  notifyReportAcknowledged(
    input: Parameters<DecisionNotifier['notifyReportAcknowledged']>[0],
  ): Promise<void> {
    this.acknowledgements.push({ reporterId: input.reporterId, reportId: input.reportId });
    return Promise.resolve();
  }
}

export class FakeAuditWriter implements AuditWriter {
  entries: { actorUserId: string; action: string; targetId: string | null }[] = [];

  record(input: Parameters<AuditWriter['record']>[0]): Promise<void> {
    this.entries.push({
      actorUserId: input.actorUserId,
      action: input.action,
      targetId: input.targetId,
    });
    return Promise.resolve();
  }
}

export class FakeEvidenceStorage implements EvidenceStorage {
  objects = new Map<string, Buffer>();

  put(key: string, bytes: Buffer): Promise<void> {
    this.objects.set(key, bytes);
    return Promise.resolve();
  }
}

export class FakeBehaviourSource implements BehaviourSource {
  constructor(private observation: BehaviourObservation) {}

  set(observation: BehaviourObservation): void {
    this.observation = observation;
  }

  observe(): Promise<BehaviourObservation> {
    return Promise.resolve(this.observation);
  }
}

/** Horloge figée : aucun test ne dépend de l'heure réelle. */
export class FixedClock {
  constructor(private readonly instant: Date) {}

  now(): Date {
    return new Date(this.instant.getTime());
  }
}
