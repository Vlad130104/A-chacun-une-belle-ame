import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { buildPage, decodeCursor } from '../../../common/pagination/cursor';
import type { DetectionSignal } from '../domain/detection-rules';
import type { CasePriority, ReportCategory, ReportTargetType } from '../domain/report-policy';
import type { CaseStatus, ModerationActionType } from '../domain/case-policy';
import type {
  CaseHistory,
  CaseRecord,
  CreateReportInput,
  ModerationCaseRepository,
  ReportRecord,
  ReportRepository,
} from '../application/ports';

const CASE_SELECT = {
  id: true,
  subjectId: true,
  priority: true,
  status: true,
  assignedToUserId: true,
  slaDueAt: true,
  resolvedAt: true,
  reportCount: true,
  createdAt: true,
} as const;

type CaseRow = Prisma.ModerationCaseGetPayload<{ select: typeof CASE_SELECT }>;

function toCase(row: CaseRow): CaseRecord {
  return {
    id: row.id,
    subjectId: row.subjectId,
    priority: row.priority,
    status: row.status,
    assignedToUserId: row.assignedToUserId,
    slaDueAt: row.slaDueAt,
    resolvedAt: row.resolvedAt,
    reportCount: row.reportCount,
    createdAt: row.createdAt,
  };
}

const STATUTS_OUVERTS: CaseStatus[] = ['OPEN', 'ASSIGNED', 'AWAITING_USER', 'ESCALATED'];

@Injectable()
export class PrismaReportRepository implements ReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  countByReporterSince(reporterId: string, since: Date): Promise<number> {
    return this.prisma.report.count({ where: { reporterId, createdAt: { gte: since } } });
  }

  async create(input: CreateReportInput): Promise<ReportRecord> {
    const report = await this.prisma.report.create({
      data: {
        reporterId: input.reporterId,
        reportedUserId: input.reportedUserId,
        targetType: input.targetType,
        targetId: input.targetId,
        category: input.category,
        description: input.description,
        caseId: input.caseId,
        createdAt: input.now,
      },
      select: {
        id: true,
        reporterId: true,
        reportedUserId: true,
        targetType: true,
        targetId: true,
        category: true,
        caseId: true,
        createdAt: true,
      },
    });

    return report;
  }

  async addEvidence(reportId: string, reporterId: string, storageKey: string): Promise<void> {
    // `updateMany` filtré sur le signalant : impossible d'attacher une capture au
    // signalement de quelqu'un d'autre, même en connaissant son identifiant.
    await this.prisma.report.updateMany({
      where: { id: reportId, reporterId },
      data: { evidenceKeys: { push: storageKey } },
    });
  }

  async countEvidenceSince(reporterId: string, since: Date): Promise<number> {
    const rows = await this.prisma.report.findMany({
      where: { reporterId, createdAt: { gte: since } },
      select: { evidenceKeys: true },
    });

    return rows.reduce((total, row) => total + row.evidenceKeys.length, 0);
  }

  async findById(reportId: string): Promise<ReportRecord | null> {
    return this.prisma.report.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        reporterId: true,
        reportedUserId: true,
        targetType: true,
        targetId: true,
        category: true,
        caseId: true,
        createdAt: true,
      },
    });
  }

  async listByReporter(input: { reporterId: string; limit: number; cursor?: string }): Promise<{
    items: { id: string; category: ReportCategory; caseStatus: string; createdAt: Date }[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const curseur = input.cursor === undefined ? null : decodeCursor(input.cursor);

    const rows = await this.prisma.report.findMany({
      where: {
        reporterId: input.reporterId,
        ...(curseur === null
          ? {}
          : {
              OR: [
                { createdAt: { lt: new Date(curseur.createdAt) } },
                { createdAt: new Date(curseur.createdAt), id: { lt: curseur.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      select: {
        id: true,
        category: true,
        createdAt: true,
        // Le STATUT du cas, jamais la décision prise : le signalant apprend que
        // son signalement a été traité, pas ce qui est arrivé à l'autre membre.
        case: { select: { status: true } },
      },
    });

    const page = buildPage(rows, input.limit);
    return {
      items: page.items.map((row) => ({
        id: row.id,
        category: row.category,
        caseStatus: row.case?.status ?? 'OPEN',
        createdAt: row.createdAt,
      })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }
}

@Injectable()
export class PrismaModerationCaseRepository implements ModerationCaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOpenBySubject(subjectId: string): Promise<CaseRecord | null> {
    const row = await this.prisma.moderationCase.findFirst({
      where: { subjectId, status: { in: STATUTS_OUVERTS } },
      orderBy: { createdAt: 'desc' },
      select: CASE_SELECT,
    });
    return row === null ? null : toCase(row);
  }

  async findMostRecentResolvedBySubject(subjectId: string): Promise<CaseRecord | null> {
    const row = await this.prisma.moderationCase.findFirst({
      where: { subjectId, resolvedAt: { not: null } },
      orderBy: { resolvedAt: 'desc' },
      select: CASE_SELECT,
    });
    return row === null ? null : toCase(row);
  }

  async findById(caseId: string): Promise<CaseRecord | null> {
    const row = await this.prisma.moderationCase.findUnique({
      where: { id: caseId },
      select: CASE_SELECT,
    });
    return row === null ? null : toCase(row);
  }

  async loadHistory(caseId: string): Promise<CaseHistory | null> {
    const row = await this.prisma.moderationCase.findUnique({
      where: { id: caseId },
      select: {
        ...CASE_SELECT,
        reports: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            category: true,
            targetType: true,
            targetId: true,
            description: true,
            createdAt: true,
          },
        },
        actions: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            type: true,
            reasonCode: true,
            note: true,
            performedByUserId: true,
            performedBySystem: true,
            approvedByUserId: true,
            revertedAt: true,
            createdAt: true,
          },
        },
        signals: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, type: true, severity: true, createdAt: true },
        },
      },
    });

    if (row === null) return null;

    // Historique de sanctions du MEMBRE, tous cas confondus : un modérateur qui
    // décide sans voir les précédents applique deux fois la même « première »
    // sanction à un récidiviste (story D6-04).
    const anterieures = await this.prisma.moderationAction.findMany({
      where: { case: { subjectId: row.subjectId }, caseId: { not: caseId }, revertedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { type: true, createdAt: true, caseId: true },
    });

    return {
      case: toCase(row),
      reports: row.reports,
      actions: row.actions,
      signals: row.signals,
      priorSanctions: anterieures,
    };
  }

  async create(input: {
    subjectId: string;
    priority: CasePriority;
    slaDueAt: Date;
    now: Date;
  }): Promise<CaseRecord> {
    const row = await this.prisma.moderationCase.create({
      data: {
        subjectId: input.subjectId,
        priority: input.priority,
        status: 'OPEN',
        slaDueAt: input.slaDueAt,
        reportCount: 1,
        createdAt: input.now,
      },
      select: CASE_SELECT,
    });
    return toCase(row);
  }

  async attachReport(input: {
    caseId: string;
    priority: CasePriority;
    slaDueAt: Date;
    reopen: boolean;
    now: Date;
  }): Promise<CaseRecord> {
    const row = await this.prisma.moderationCase.update({
      where: { id: input.caseId },
      data: {
        priority: input.priority,
        slaDueAt: input.slaDueAt,
        reportCount: { increment: 1 },
        ...(input.reopen ? { status: 'OPEN', resolvedAt: null, assignedToUserId: null } : {}),
      },
      select: CASE_SELECT,
    });
    return toCase(row);
  }

  async listQueue(input: {
    status?: CaseStatus;
    assignedToUserId?: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: CaseRecord[]; nextCursor: string | null; hasMore: boolean }> {
    const curseur = input.cursor === undefined ? null : decodeCursor(input.cursor);

    const rows = await this.prisma.moderationCase.findMany({
      where: {
        status: input.status ?? { in: STATUTS_OUVERTS },
        ...(input.assignedToUserId === undefined
          ? {}
          : { assignedToUserId: input.assignedToUserId }),
        ...(curseur === null
          ? {}
          : {
              OR: [
                { createdAt: { lt: new Date(curseur.createdAt) } },
                { createdAt: new Date(curseur.createdAt), id: { lt: curseur.id } },
              ],
            }),
      },
      // Priorité d'abord, ancienneté ensuite — le même ordre que `compareQueue`,
      // exprimé ici en SQL sur l'index (status, priority, slaDueAt).
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
      select: CASE_SELECT,
    });

    const page = buildPage(rows, input.limit);
    return { items: page.items.map(toCase), nextCursor: page.nextCursor, hasMore: page.hasMore };
  }

  async assign(caseId: string, moderatorId: string | null, at: Date): Promise<void> {
    await this.prisma.moderationCase.update({
      where: { id: caseId },
      data: {
        assignedToUserId: moderatorId,
        assignedAt: moderatorId === null ? null : at,
        status: moderatorId === null ? 'OPEN' : 'ASSIGNED',
      },
    });
  }

  async recordAction(input: {
    caseId: string;
    type: ModerationActionType;
    reasonCode: string;
    note: string | null;
    performedByUserId: string | null;
    approvedByUserId: string | null;
    effectiveUntil: Date | null;
    nextCaseStatus: CaseStatus | null;
    now: Date;
  }): Promise<{ actionId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const action = await tx.moderationAction.create({
        data: {
          caseId: input.caseId,
          type: input.type,
          reasonCode: input.reasonCode.slice(0, 60),
          note: input.note,
          performedByUserId: input.performedByUserId,
          performedBySystem: input.performedByUserId === null,
          approvedByUserId: input.approvedByUserId,
          effectiveUntil: input.effectiveUntil,
          createdAt: input.now,
        },
        select: { id: true },
      });

      if (input.nextCaseStatus !== null) {
        const clos = input.nextCaseStatus === 'RESOLVED' || input.nextCaseStatus === 'DISMISSED';
        await tx.moderationCase.update({
          where: { id: input.caseId },
          data: {
            status: input.nextCaseStatus,
            ...(clos ? { resolvedAt: input.now } : {}),
          },
        });
      }

      return { actionId: action.id };
    });
  }

  async findAction(actionId: string): Promise<{
    id: string;
    caseId: string;
    type: ModerationActionType;
    revertedAt: Date | null;
  } | null> {
    return this.prisma.moderationAction.findUnique({
      where: { id: actionId },
      select: { id: true, caseId: true, type: true, revertedAt: true },
    });
  }

  async revertAction(actionId: string, byUserId: string, at: Date): Promise<void> {
    // L'historique est immuable : l'annulation s'écrit sur la ligne d'origine
    // sans jamais l'effacer, et reste visible dans le dossier.
    await this.prisma.moderationAction.update({
      where: { id: actionId },
      data: { revertedAt: at, revertedByUserId: byUserId },
    });
  }

  async saveSignals(
    subjectId: string,
    caseId: string | null,
    signals: DetectionSignal[],
    now: Date,
  ): Promise<void> {
    if (signals.length === 0) return;

    await this.prisma.moderationSignal.createMany({
      data: signals.map((signal) => ({
        userId: subjectId,
        caseId,
        type: signal.type,
        severity: signal.severity,
        evidence: signal.evidence,
        createdAt: now,
      })),
    });
  }

  async metrics(now: Date): Promise<{
    open: number;
    overdue: number;
    byPriority: Record<string, number>;
    medianResolutionMinutes: number | null;
  }> {
    const [open, overdue, groupes, resolus] = await Promise.all([
      this.prisma.moderationCase.count({ where: { status: { in: STATUTS_OUVERTS } } }),
      this.prisma.moderationCase.count({
        where: { status: { in: STATUTS_OUVERTS }, slaDueAt: { lt: now } },
      }),
      this.prisma.moderationCase.groupBy({
        by: ['priority'],
        where: { status: { in: STATUTS_OUVERTS } },
        _count: { _all: true },
      }),
      this.prisma.moderationCase.findMany({
        where: { resolvedAt: { not: null } },
        orderBy: { resolvedAt: 'desc' },
        take: 200,
        select: { createdAt: true, resolvedAt: true },
      }),
    ]);

    const byPriority: Record<string, number> = {};
    for (const groupe of groupes) byPriority[groupe.priority] = groupe._count._all;

    // Médiane et non moyenne : un seul dossier oublié pendant trois semaines
    // déplacerait une moyenne au point de la rendre inutilisable.
    const durees = resolus
      .map((dossier) => (dossier.resolvedAt!.getTime() - dossier.createdAt.getTime()) / 60_000)
      .sort((a, b) => a - b);

    const median =
      durees.length === 0 ? null : Math.round(durees[Math.floor(durees.length / 2)] ?? 0);

    return { open, overdue, byPriority, medianResolutionMinutes: median };
  }
}

/** Type de cible d'un signalement, tel qu'attendu par Prisma. */
export type PrismaReportTargetType = ReportTargetType;
