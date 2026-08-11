import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import type { ClockProvider } from '../../../providers/ports';
import {
  checkAction,
  checkAssignment,
  effectOf,
  isRevertible,
  slaState,
  type CaseStatus,
  type ModerationActionType,
} from '../domain/case-policy';
import {
  aggregateSeverity,
  evaluateRules,
  type DetectionThresholds,
} from '../domain/detection-rules';
import {
  checkReportSubmission,
  priorityFor,
  recomputeSlaDueAt,
  routeReport,
  slaDueAt,
  type CasePriority,
  type ReportCategory,
  type ReportTargetType,
  type SlaConfig,
} from '../domain/report-policy';
import type {
  AccountSanctionGateway,
  AuditWriter,
  BehaviourSource,
  CaseHistory,
  CaseRecord,
  DecisionNotifier,
  EvidenceStorage,
  MessageModerationGateway,
  ModerationCaseRepository,
  PhotoModerationGateway,
  ReportRepository,
} from './ports';

export interface ModerationConfig {
  sla: SlaConfig;
  dailyReportLimit: number;
  dailyEvidenceLimit: number;
  reopenWindowDays: number;
  maxEvidenceBytes: number;
  thresholds: DetectionThresholds;
}

/** Début du jour UTC — toutes les fenêtres de quota sont en UTC (ADR : dates en UTC). */
function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const SLA_HEURES: Record<CasePriority, keyof SlaConfig> = {
  P0_CRITICAL: 'P0_CRITICAL',
  P1_HIGH: 'P1_HIGH',
  P2_NORMAL: 'P2_NORMAL',
  P3_LOW: 'P3_LOW',
};

/**
 * Déposer un signalement (story D6-01).
 *
 * Objectif produit : moins de 20 secondes. Techniquement, cela impose une seule
 * requête, sans étape de confirmation et sans champ obligatoire au-delà de la
 * catégorie. Tout le travail de tri est fait côté serveur, après coup.
 */
export class SubmitReportUseCase {
  constructor(
    private readonly reports: ReportRepository,
    private readonly cases: ModerationCaseRepository,
    private readonly notifier: DecisionNotifier,
    private readonly clock: ClockProvider,
    private readonly config: ModerationConfig,
  ) {}

  async execute(input: {
    reporterId: string;
    reportedUserId: string;
    targetType: ReportTargetType;
    targetId: string | null;
    category: ReportCategory;
    description: string | null;
  }): Promise<{ reportId: string; caseId: string; priority: CasePriority }> {
    const now = this.clock.now();
    const reportsToday = await this.reports.countByReporterSince(
      input.reporterId,
      startOfUtcDay(now),
    );

    const recevabilite = checkReportSubmission({
      reporterId: input.reporterId,
      reportedUserId: input.reportedUserId,
      targetType: input.targetType,
      targetId: input.targetId,
      reportsToday,
      dailyLimit: this.config.dailyReportLimit,
    });

    if (!recevabilite.accepted) {
      throw recevabilite.reason === 'DAILY_LIMIT'
        ? BusinessError.rateLimited(ErrorCode.MOD_REPORT_LIMIT)
        : BusinessError.badRequest(ErrorCode.VALIDATION_FAILED, { reason: recevabilite.reason });
    }

    const priorite = priorityFor(input.category);
    const [casOuvert, casResolu] = await Promise.all([
      this.cases.findOpenBySubject(input.reportedUserId),
      this.cases.findMostRecentResolvedBySubject(input.reportedUserId),
    ]);

    const routage = routeReport(priorite, casOuvert, casResolu, now, this.config.reopenWindowDays);

    const dossier = await this.resolveCase(
      routage,
      input.reportedUserId,
      casOuvert,
      casResolu,
      now,
    );

    const report = await this.reports.create({
      reporterId: input.reporterId,
      reportedUserId: input.reportedUserId,
      targetType: input.targetType,
      targetId: input.targetId,
      category: input.category,
      description: input.description,
      caseId: dossier.id,
      now,
    });

    // Accusé de réception au signalant : sans retour, un membre conclut que
    // signaler ne sert à rien, et cesse de le faire.
    await this.notifier.notifyReportAcknowledged({
      reporterId: input.reporterId,
      reportId: report.id,
      now,
    });

    return { reportId: report.id, caseId: dossier.id, priority: dossier.priority };
  }

  private async resolveCase(
    routage: ReturnType<typeof routeReport>,
    subjectId: string,
    casOuvert: CaseRecord | null,
    casResolu: CaseRecord | null,
    now: Date,
  ): Promise<CaseRecord> {
    if (routage.action === 'CREATE') {
      return this.cases.create({
        subjectId,
        priority: routage.priority,
        slaDueAt: slaDueAt(routage.priority, now, this.config.sla),
        now,
      });
    }

    // L'échéance repart de l'ouverture du cas, jamais de maintenant : un cas déjà
    // ancien qui devient critique doit apparaître en retard, pas fraîchement remis
    // à zéro.
    const dossier = routage.action === 'REOPEN' ? casResolu : casOuvert;
    const ouvertLe = dossier?.createdAt ?? now;

    return this.cases.attachReport({
      caseId: routage.caseId,
      priority: routage.priority,
      slaDueAt: recomputeSlaDueAt(routage.priority, ouvertLe, this.config.sla),
      reopen: routage.action === 'REOPEN',
      now,
    });
  }
}

export class AddReportEvidenceUseCase {
  constructor(
    private readonly reports: ReportRepository,
    private readonly storage: EvidenceStorage,
    private readonly clock: ClockProvider,
    private readonly config: ModerationConfig,
  ) {}

  async execute(input: {
    reporterId: string;
    reportId: string;
    bytes: Buffer;
    contentType: string;
  }): Promise<{ stored: true }> {
    const report = await this.reports.findById(input.reportId);
    // 404 avant tout : ne pas confirmer l'existence d'un signalement d'autrui.
    if (report === null || report.reporterId !== input.reporterId) throw BusinessError.notFound();

    if (input.bytes.byteLength > this.config.maxEvidenceBytes) {
      throw BusinessError.badRequest(ErrorCode.MEDIA_TOO_LARGE, {
        maxBytes: this.config.maxEvidenceBytes,
      });
    }

    const now = this.clock.now();
    const deposeesAujourdhui = await this.reports.countEvidenceSince(
      input.reporterId,
      startOfUtcDay(now),
    );
    if (deposeesAujourdhui >= this.config.dailyEvidenceLimit) {
      throw BusinessError.rateLimited(ErrorCode.MOD_REPORT_LIMIT);
    }

    // Bucket privé, aucune URL signée n'est jamais rendue au signalant : une
    // capture peut contenir la conversation d'un tiers.
    const key = `evidence/${input.reportId}/${now.getTime()}`;
    await this.storage.put(key, input.bytes, input.contentType);
    await this.reports.addEvidence(input.reportId, input.reporterId, key);

    return { stored: true };
  }
}

export class ListMyReportsUseCase {
  constructor(private readonly reports: ReportRepository) {}

  async execute(input: { reporterId: string; limit: number; cursor?: string }): Promise<unknown> {
    return this.reports.listByReporter(input);
  }
}

export interface QueueItem {
  id: string;
  subjectId: string;
  priority: CasePriority;
  status: CaseStatus;
  assignedToUserId: string | null;
  reportCount: number;
  slaDueAt: string;
  slaState: string;
  createdAt: string;
}

/** File de modération triée, avec compte à rebours (story D6-03). */
export class ListCaseQueueUseCase {
  constructor(
    private readonly cases: ModerationCaseRepository,
    private readonly clock: ClockProvider,
    private readonly config: ModerationConfig,
  ) {}

  async execute(input: {
    status?: CaseStatus;
    assignedToUserId?: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: QueueItem[]; nextCursor: string | null; hasMore: boolean }> {
    const now = this.clock.now();
    const page = await this.cases.listQueue(input);

    return {
      items: page.items.map((dossier) => ({
        id: dossier.id,
        subjectId: dossier.subjectId,
        priority: dossier.priority,
        status: dossier.status,
        assignedToUserId: dossier.assignedToUserId,
        reportCount: dossier.reportCount,
        slaDueAt: dossier.slaDueAt.toISOString(),
        slaState: slaState(dossier.slaDueAt, now, this.config.sla[SLA_HEURES[dossier.priority]]),
        createdAt: dossier.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }
}

/**
 * Dossier complet d'un cas (story D6-04).
 *
 * Consulter un dossier est audité : il contient les signalements et l'historique
 * de sanctions d'une personne, ce n'est pas une lecture anodine.
 */
export class GetCaseUseCase {
  constructor(
    private readonly cases: ModerationCaseRepository,
    private readonly audit: AuditWriter,
    private readonly clock: ClockProvider,
  ) {}

  async execute(moderatorId: string, moderatorRole: string, caseId: string): Promise<CaseHistory> {
    const dossier = await this.cases.loadHistory(caseId);
    if (dossier === null) throw BusinessError.notFound();

    await this.audit.record({
      actorUserId: moderatorId,
      actorRole: moderatorRole,
      action: 'moderation.case.viewed',
      targetType: 'ModerationCase',
      targetId: caseId,
      context: { subjectId: dossier.case.subjectId },
      now: this.clock.now(),
    });

    return dossier;
  }
}

export class AssignCaseUseCase {
  constructor(
    private readonly cases: ModerationCaseRepository,
    private readonly audit: AuditWriter,
    private readonly clock: ClockProvider,
  ) {}

  async execute(input: {
    moderatorId: string;
    moderatorRole: string;
    caseId: string;
    /** `null` pour se dessaisir. */
    assignTo: string | null;
  }): Promise<{ assigned: string | null }> {
    const dossier = await this.cases.findById(input.caseId);
    if (dossier === null) throw BusinessError.notFound();

    if (input.assignTo !== null) {
      const verdict = checkAssignment(dossier.status, dossier.assignedToUserId, input.assignTo);
      if (!verdict.allowed) {
        throw verdict.reason === 'CASE_ALREADY_CLOSED'
          ? BusinessError.conflict(ErrorCode.MOD_CASE_ALREADY_RESOLVED)
          : BusinessError.conflict(ErrorCode.VALIDATION_FAILED, { reason: verdict.reason });
      }
    }

    const now = this.clock.now();
    await this.cases.assign(input.caseId, input.assignTo, now);
    await this.audit.record({
      actorUserId: input.moderatorId,
      actorRole: input.moderatorRole,
      action: 'moderation.case.assigned',
      targetType: 'ModerationCase',
      targetId: input.caseId,
      context: { assignTo: input.assignTo },
      now,
    });

    return { assigned: input.assignTo };
  }
}

export interface ApplyActionInput {
  moderatorId: string;
  moderatorRole: string;
  /** Permissions réelles de l'appelant, relues du jeton par le garde. */
  actorPermissions: string[];
  caseId: string;
  action: ModerationActionType;
  reasonCode: string;
  note: string | null;
  approvedByUserId: string | null;
  /** Échéance d'une sanction temporaire. */
  effectiveUntil: Date | null;
  /** Cible d'une action de contenu. */
  targetId: string | null;
}

/**
 * Appliquer une action de modération (stories D6-05, D6-06, D6-09).
 *
 * L'ordre des opérations est délibéré : la décision est **enregistrée d'abord**,
 * les effets sont appliqués ensuite. Si l'application d'un effet échoue, il reste
 * une trace de ce qui a été décidé et par qui. L'inverse laisserait un compte
 * suspendu sans décision associée — invérifiable et inattaquable.
 */
export class ApplyModerationActionUseCase {
  constructor(
    private readonly cases: ModerationCaseRepository,
    private readonly sanctions: AccountSanctionGateway,
    private readonly photos: PhotoModerationGateway,
    private readonly messages: MessageModerationGateway,
    private readonly notifier: DecisionNotifier,
    private readonly audit: AuditWriter,
    private readonly clock: ClockProvider,
  ) {}

  async execute(
    input: ApplyActionInput,
  ): Promise<{ actionId: string; caseStatus: CaseStatus | null }> {
    const dossier = await this.cases.findById(input.caseId);
    if (dossier === null) throw BusinessError.notFound();

    const verdict = checkAction({
      caseStatus: dossier.status,
      action: input.action,
      reasonCode: input.reasonCode,
      performedByUserId: input.moderatorId,
      approvedByUserId: input.approvedByUserId,
      assignedToUserId: dossier.assignedToUserId,
    });

    if (!verdict.allowed) throw toBusinessError(verdict.reason);

    // Le bannissement exige `users.ban` EN PLUS de `moderation.act` qui ouvre la
    // route. Le contrôle ne peut pas vivre dans la politique de route : celle-ci
    // est évaluée avant le corps de la requête et ignore l'action demandée.
    if (input.action === 'BAN' && !input.actorPermissions.includes('users.ban')) {
      throw BusinessError.forbidden(ErrorCode.AUTH_FORBIDDEN, { required: 'users.ban' });
    }

    const effet = effectOf(input.action);
    const now = this.clock.now();

    // Une sanction temporaire sans échéance deviendrait définitive par accident.
    if (effet.temporary && effet.accountStatus !== null && input.effectiveUntil === null) {
      throw BusinessError.badRequest(ErrorCode.VALIDATION_FAILED, { field: 'effectiveUntil' });
    }

    const { actionId } = await this.cases.recordAction({
      caseId: input.caseId,
      type: input.action,
      reasonCode: input.reasonCode,
      note: input.note,
      performedByUserId: input.moderatorId,
      approvedByUserId: input.approvedByUserId,
      effectiveUntil: input.effectiveUntil,
      nextCaseStatus: effet.caseStatus,
      now,
    });

    await this.applyEffects(input, dossier.subjectId, now);

    // Le membre est informé de ce qui le concerne, jamais de qui l'a signalé.
    if (effet.accountStatus !== null || input.action === 'WARNING') {
      await this.notifier.notifyModerationDecision({
        userId: dossier.subjectId,
        action: input.action,
        reasonCode: input.reasonCode,
        effectiveUntil: input.effectiveUntil,
        caseId: input.caseId,
        now,
      });
    }

    await this.audit.record({
      actorUserId: input.moderatorId,
      actorRole: input.moderatorRole,
      action: `moderation.action.${input.action.toLowerCase()}`,
      targetType: 'User',
      targetId: dossier.subjectId,
      context: {
        caseId: input.caseId,
        actionId,
        reasonCode: input.reasonCode,
        approvedByUserId: input.approvedByUserId,
      },
      now,
    });

    return { actionId, caseStatus: effet.caseStatus };
  }

  private async applyEffects(input: ApplyActionInput, subjectId: string, now: Date): Promise<void> {
    const effet = effectOf(input.action);

    if (effet.accountStatus !== null) {
      await this.sanctions.applyStatus(subjectId, effet.accountStatus, input.effectiveUntil, now);
    }

    if (effet.requiresReverification) {
      await this.sanctions.requireReverification(subjectId, now);
    }

    if (input.action === 'BAN') {
      // Empreintes salées uniquement : le banni ne peut pas revenir avec le même
      // numéro ou la même pièce, sans qu'on conserve la moindre donnée en clair
      // (ADR-013).
      await this.sanctions.blockIdentityOnBan(subjectId, now);
    }

    if (input.action === 'PHOTO_HIDDEN' && input.targetId !== null) {
      await this.photos.hide(input.targetId, input.reasonCode, input.moderatorId, now);
    }

    if (input.action === 'CONTENT_REMOVED' && input.targetId !== null) {
      await this.messages.hide(input.targetId, now);
    }
  }
}

/** Annulation d'une sanction. Le bannissement en est exclu par construction. */
export class RevertActionUseCase {
  constructor(
    private readonly cases: ModerationCaseRepository,
    private readonly sanctions: AccountSanctionGateway,
    private readonly audit: AuditWriter,
    private readonly clock: ClockProvider,
  ) {}

  async execute(input: {
    moderatorId: string;
    moderatorRole: string;
    actionId: string;
    reasonCode: string;
  }): Promise<{ reverted: true }> {
    const action = await this.cases.findAction(input.actionId);
    if (action === null) throw BusinessError.notFound();
    if (action.revertedAt !== null) {
      throw BusinessError.conflict(ErrorCode.MOD_CASE_ALREADY_RESOLVED);
    }

    if (!isRevertible(action.type)) {
      // Un bannissement se lève par une décision de réintégration explicite,
      // tracée comme telle — pas en effaçant la sanction d'origine.
      throw BusinessError.forbidden(ErrorCode.MOD_CASE_ALREADY_RESOLVED, { action: action.type });
    }

    const dossier = await this.cases.findById(action.caseId);
    if (dossier === null) throw BusinessError.notFound();

    const now = this.clock.now();
    await this.cases.revertAction(input.actionId, input.moderatorId, now);
    await this.sanctions.applyStatus(dossier.subjectId, 'ACTIVE', null, now);

    await this.audit.record({
      actorUserId: input.moderatorId,
      actorRole: input.moderatorRole,
      action: 'moderation.action.reverted',
      targetType: 'User',
      targetId: dossier.subjectId,
      context: {
        actionId: input.actionId,
        originalType: action.type,
        reasonCode: input.reasonCode,
      },
      now,
    });

    return { reverted: true };
  }
}

/**
 * Évaluation des 9 règles pour un membre (story D6-07).
 *
 * Ce cas d'usage n'applique **aucune** sanction. Il enregistre les signaux, et
 * crée ou priorise un cas si la sévérité le justifie. Les mesures réversibles que
 * les règles proposent sont volontairement laissées à la décision humaine au MVP :
 * les appliquer d'office avant d'avoir mesuré le taux de faux positifs reviendrait
 * à sanctionner sur une intuition non validée.
 */
export class EvaluateBehaviourUseCase {
  constructor(
    private readonly behaviour: BehaviourSource,
    private readonly cases: ModerationCaseRepository,
    private readonly clock: ClockProvider,
    private readonly config: ModerationConfig,
  ) {}

  async execute(
    userId: string,
  ): Promise<{ signals: number; severity: number; caseId: string | null }> {
    const now = this.clock.now();
    const observation = await this.behaviour.observe(userId, now);
    const signaux = evaluateRules(observation, this.config.thresholds);

    if (signaux.length === 0) return { signals: 0, severity: 0, caseId: null };

    const severite = aggregateSeverity(signaux);
    // Un signal isolé de faible sévérité ne mérite pas encore un dossier : il est
    // conservé, et c'est l'accumulation qui déclenche l'ouverture.
    const meriteUnCas = severite >= 3;

    let dossier = await this.cases.findOpenBySubject(userId);

    if (dossier === null && meriteUnCas) {
      const priorite: CasePriority = severite >= 5 ? 'P1_HIGH' : 'P2_NORMAL';
      dossier = await this.cases.create({
        subjectId: userId,
        priority: priorite,
        slaDueAt: slaDueAt(priorite, now, this.config.sla),
        now,
      });
    }

    await this.cases.saveSignals(userId, dossier?.id ?? null, signaux, now);

    return { signals: signaux.length, severity: severite, caseId: dossier?.id ?? null };
  }
}

/** Indicateurs de traitement et alerte sur dépassement (story D6-10). */
export class ModerationMetricsUseCase {
  constructor(
    private readonly cases: ModerationCaseRepository,
    private readonly clock: ClockProvider,
  ) {}

  async execute(): Promise<unknown> {
    return this.cases.metrics(this.clock.now());
  }
}

function toBusinessError(reason: string): BusinessError {
  switch (reason) {
    case 'CASE_ALREADY_CLOSED':
      return BusinessError.conflict(ErrorCode.MOD_CASE_ALREADY_RESOLVED);
    case 'SECOND_APPROVER_REQUIRED':
    case 'SECOND_APPROVER_MUST_DIFFER':
      return BusinessError.forbidden(ErrorCode.MOD_SECOND_APPROVER_REQUIRED);
    case 'AUTOMATIC_ACTION_NOT_ALLOWED':
      return BusinessError.forbidden(ErrorCode.AUTH_FORBIDDEN, { reason });
    default:
      return BusinessError.badRequest(ErrorCode.VALIDATION_FAILED, { reason });
  }
}
