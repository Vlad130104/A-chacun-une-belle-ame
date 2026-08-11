import type { BehaviourObservation, DetectionSignal } from '../domain/detection-rules';
import type { CasePriority, ReportCategory, ReportTargetType } from '../domain/report-policy';
import type { CaseStatus, ModerationActionType } from '../domain/case-policy';

export const REPORT_REPOSITORY = Symbol('ReportRepository');
export const MODERATION_CASE_REPOSITORY = Symbol('ModerationCaseRepository');
export const BEHAVIOUR_SOURCE = Symbol('BehaviourSource');
export const ACCOUNT_SANCTION_GATEWAY = Symbol('AccountSanctionGateway');
export const PHOTO_MODERATION_GATEWAY = Symbol('PhotoModerationGateway');
export const MESSAGE_MODERATION_GATEWAY = Symbol('MessageModerationGateway');
export const DECISION_NOTIFIER = Symbol('DecisionNotifier');
export const EVIDENCE_STORAGE = Symbol('EvidenceStorage');
export const AUDIT_WRITER = Symbol('AuditWriter');

export interface ReportRecord {
  id: string;
  reporterId: string;
  reportedUserId: string;
  targetType: ReportTargetType;
  targetId: string | null;
  category: ReportCategory;
  caseId: string | null;
  createdAt: Date;
}

export interface CreateReportInput {
  reporterId: string;
  reportedUserId: string;
  targetType: ReportTargetType;
  targetId: string | null;
  category: ReportCategory;
  description: string | null;
  caseId: string;
  now: Date;
}

export interface ReportRepository {
  /** Signalements émis par ce membre depuis minuit UTC — quota anti-harcèlement. */
  countByReporterSince(reporterId: string, since: Date): Promise<number>;

  create(input: CreateReportInput): Promise<ReportRecord>;

  addEvidence(reportId: string, reporterId: string, storageKey: string): Promise<void>;
  countEvidenceSince(reporterId: string, since: Date): Promise<number>;
  findById(reportId: string): Promise<ReportRecord | null>;

  /**
   * Mes signalements et leur avancement. Ne renvoie **jamais** la décision prise
   * sur le membre visé : le signalant apprend que son signalement a été traité,
   * pas ce qui est arrivé à l'autre.
   */
  listByReporter(input: { reporterId: string; limit: number; cursor?: string }): Promise<{
    items: { id: string; category: ReportCategory; caseStatus: string; createdAt: Date }[];
    nextCursor: string | null;
    hasMore: boolean;
  }>;
}

export interface CaseRecord {
  id: string;
  subjectId: string;
  priority: CasePriority;
  status: CaseStatus;
  assignedToUserId: string | null;
  slaDueAt: Date;
  resolvedAt: Date | null;
  reportCount: number;
  createdAt: Date;
}

export interface CaseHistory {
  case: CaseRecord;
  reports: {
    id: string;
    category: ReportCategory;
    targetType: ReportTargetType;
    targetId: string | null;
    description: string | null;
    createdAt: Date;
  }[];
  actions: {
    id: string;
    type: ModerationActionType;
    reasonCode: string;
    note: string | null;
    performedByUserId: string | null;
    performedBySystem: boolean;
    approvedByUserId: string | null;
    revertedAt: Date | null;
    createdAt: Date;
  }[];
  signals: { id: string; type: string; severity: number; createdAt: Date }[];
  /** Sanctions passées du membre, tous cas confondus (story D6-04). */
  priorSanctions: { type: ModerationActionType; createdAt: Date; caseId: string }[];
}

export interface ModerationCaseRepository {
  findOpenBySubject(subjectId: string): Promise<CaseRecord | null>;
  findMostRecentResolvedBySubject(subjectId: string): Promise<CaseRecord | null>;
  findById(caseId: string): Promise<CaseRecord | null>;
  loadHistory(caseId: string): Promise<CaseHistory | null>;

  create(input: {
    subjectId: string;
    priority: CasePriority;
    slaDueAt: Date;
    now: Date;
  }): Promise<CaseRecord>;

  /** Incrémente le compteur, remonte la priorité et recalcule l'échéance. */
  attachReport(input: {
    caseId: string;
    priority: CasePriority;
    slaDueAt: Date;
    reopen: boolean;
    now: Date;
  }): Promise<CaseRecord>;

  listQueue(input: {
    status?: CaseStatus;
    assignedToUserId?: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: CaseRecord[]; nextCursor: string | null; hasMore: boolean }>;

  assign(caseId: string, moderatorId: string | null, at: Date): Promise<void>;

  /**
   * Enregistre l'action ET le nouvel état du cas dans une seule transaction.
   * L'historique est immuable : on ajoute une ligne, on n'en modifie jamais.
   */
  recordAction(input: {
    caseId: string;
    type: ModerationActionType;
    reasonCode: string;
    note: string | null;
    performedByUserId: string | null;
    approvedByUserId: string | null;
    effectiveUntil: Date | null;
    nextCaseStatus: CaseStatus | null;
    now: Date;
  }): Promise<{ actionId: string }>;

  findAction(actionId: string): Promise<{
    id: string;
    caseId: string;
    type: ModerationActionType;
    revertedAt: Date | null;
  } | null>;

  revertAction(actionId: string, byUserId: string, at: Date): Promise<void>;

  saveSignals(
    subjectId: string,
    caseId: string | null,
    signals: DetectionSignal[],
    now: Date,
  ): Promise<void>;

  /** Indicateurs de la file : volumétrie, retards, délai médian (story D6-10). */
  metrics(now: Date): Promise<{
    open: number;
    overdue: number;
    byPriority: Record<string, number>;
    medianResolutionMinutes: number | null;
  }>;
}

/** Observations agrégées d'un membre, pour les 9 règles de détection. */
export interface BehaviourSource {
  observe(userId: string, now: Date): Promise<BehaviourObservation>;
}

/**
 * Changement d'état d'un compte.
 *
 * Port déclaré ici, implémenté par le module `auth` qui possède la table `User` :
 * la modération ne réécrit pas dans les tables d'un autre module.
 */
export interface AccountSanctionGateway {
  applyStatus(userId: string, status: string, until: Date | null, at: Date): Promise<void>;
  requireReverification(userId: string, at: Date): Promise<void>;
  /** Empreintes conservées à la place des données, pour empêcher la recréation (ADR-013). */
  blockIdentityOnBan(userId: string, at: Date): Promise<void>;
}

export interface PhotoModerationGateway {
  hide(photoId: string, reason: string, moderatorId: string | null, at: Date): Promise<void>;
}

export interface MessageModerationGateway {
  hide(messageId: string, at: Date): Promise<void>;
}

/**
 * Information du membre sanctionné (story D6-09).
 *
 * L'implémentation écrit une notification **in-app réelle** en base. Les canaux
 * sortants (push, e-mail) arrivent avec la tranche D8 : voir docs/MOCKS.md.
 */
export interface DecisionNotifier {
  notifyModerationDecision(input: {
    userId: string;
    action: ModerationActionType;
    reasonCode: string;
    effectiveUntil: Date | null;
    caseId: string;
    now: Date;
  }): Promise<void>;

  notifyReportAcknowledged(input: {
    reporterId: string;
    reportId: string;
    now: Date;
  }): Promise<void>;
}

export interface EvidenceStorage {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
}

/** Journal d'audit administratif — en ajout seul, jamais modifié ni supprimé. */
export interface AuditWriter {
  record(input: {
    actorUserId: string;
    actorRole: string;
    action: string;
    targetType: string | null;
    targetId: string | null;
    context: Record<string, unknown> | null;
    now: Date;
  }): Promise<void>;
}
