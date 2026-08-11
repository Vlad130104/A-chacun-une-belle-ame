import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Auth } from '../../../common/auth/auth.decorator';
import { requireAuditRole } from '../../../common/auth/admin-role';
import { CurrentUser, type AuthenticatedUser } from '../../../common/auth/auth.guard';
import { ZodBody } from '../../../common/validation/zod.pipe';
import type { CaseStatus } from '../domain/case-policy';
import {
  AddReportEvidenceUseCase,
  ApplyModerationActionUseCase,
  AssignCaseUseCase,
  EvaluateBehaviourUseCase,
  GetCaseUseCase,
  ListCaseQueueUseCase,
  ListMyReportsUseCase,
  ModerationMetricsUseCase,
  RevertActionUseCase,
  SubmitReportUseCase,
} from '../application/moderation.use-cases';

interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
}

const reportSchema = z
  .object({
    reportedUserId: z.string().min(10).max(40),
    targetType: z.enum(['PROFILE', 'PHOTO', 'MESSAGE', 'BEHAVIOR']),
    targetId: z.string().min(10).max(40).nullable().default(null),
    category: z.enum([
      'FAKE_PROFILE',
      'IDENTITY_THEFT',
      'FINANCIAL_SOLICITATION',
      'SCAM_SUSPICION',
      'HARASSMENT',
      'HATE_SPEECH',
      'SEXUAL_CONTENT',
      'INAPPROPRIATE_PHOTO',
      'UNDERAGE_SUSPICION',
      'SPAM',
      'OTHER',
    ]),
    // Description facultative : exiger un texte allongerait le parcours au-delà
    // des 20 secondes visées, et dissuaderait les signalements les plus urgents.
    description: z.string().max(1500).nullable().default(null),
  })
  .strict();

const actionSchema = z
  .object({
    action: z.enum([
      'WARNING',
      'INFORMATION_REQUEST',
      'PHOTO_HIDDEN',
      'CONTENT_REMOVED',
      'TEMPORARY_RESTRICTION',
      'SUSPENSION',
      'BAN',
      'REVERIFICATION_REQUIRED',
      'DISMISSED',
      'ESCALATED',
    ]),
    reasonCode: z.string().min(1).max(60),
    note: z.string().max(1500).nullable().default(null),
    approvedByUserId: z.string().min(10).max(40).nullable().default(null),
    effectiveUntil: z.string().datetime().nullable().default(null),
    targetId: z.string().min(10).max(40).nullable().default(null),
  })
  .strict();

const assignSchema = z.object({ assignTo: z.string().min(10).max(40).nullable() }).strict();

const revertSchema = z.object({ reasonCode: z.string().min(1).max(60) }).strict();

const limite = (valeur: string | undefined, defaut: number, max: number): number =>
  Math.min(Number(valeur ?? defaut) || defaut, max);

/**
 * Signalement — côté membre (story D6-01).
 *
 * Le niveau requis est `auth` et non `verified` : signaler est une fonction de
 * sécurité. La fermer aux comptes non encore vérifiés priverait de recours ceux
 * qui viennent d'arriver, c'est-à-dire précisément les plus exposés.
 */
@ApiTags('reports')
@Controller('reports')
export class ReportController {
  constructor(
    private readonly submitReport: SubmitReportUseCase,
    private readonly addEvidence: AddReportEvidenceUseCase,
    private readonly listMine: ListMyReportsUseCase,
  ) {}

  @Auth({ rateLimit: 'reports.create' })
  @Post()
  @ApiOperation({ summary: 'Signaler un profil, une photo, un message ou un comportement' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(reportSchema) body: unknown,
  ): Promise<unknown> {
    const input = body as z.infer<typeof reportSchema>;
    const resultat = await this.submitReport.execute({
      reporterId: user.id,
      reportedUserId: input.reportedUserId,
      targetType: input.targetType,
      targetId: input.targetId,
      category: input.category,
      description: input.description,
    });

    // Ni l'identifiant du cas ni sa priorité ne sont rendus au signalant : ils
    // renseigneraient sur l'historique du membre visé.
    return { reportId: resultat.reportId, received: true };
  }

  @Auth({ owner: true, rateLimit: 'reports.evidence' })
  @Post(':reportId/evidence')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Joindre une capture à mon signalement — stockage privé' })
  async evidence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
    @UploadedFile() file?: UploadedFileLike,
  ): Promise<{ stored: true }> {
    if (file === undefined) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Fichier requis.' });
    }

    return this.addEvidence.execute({
      reporterId: user.id,
      reportId,
      bytes: file.buffer,
      contentType: file.mimetype,
    });
  }

  @Auth()
  @Get('mine')
  @ApiOperation({ summary: 'Mes signalements et leur avancement' })
  async mine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<unknown> {
    return this.listMine.execute({
      reporterId: user.id,
      limit: limite(limit, 20, 50),
      cursor,
    });
  }
}

/**
 * File de modération — back-office (stories D6-03 à D6-06, D6-10).
 *
 * Chaque route porte sa permission. Aucune n'est ouverte à un compte membre :
 * le test d'inventaire des routes le vérifie.
 */
@ApiTags('admin-moderation')
@Controller('admin/moderation')
export class AdminModerationController {
  constructor(
    private readonly queue: ListCaseQueueUseCase,
    private readonly detail: GetCaseUseCase,
    private readonly assign: AssignCaseUseCase,
    private readonly apply: ApplyModerationActionUseCase,
    private readonly revert: RevertActionUseCase,
    private readonly evaluate: EvaluateBehaviourUseCase,
    private readonly metrics: ModerationMetricsUseCase,
  ) {}

  @Auth({ permissions: ['moderation.read'] })
  @Get('cases')
  @ApiOperation({ summary: 'File triée par priorité puis ancienneté, avec compte à rebours SLA' })
  async list(
    @Query('status') status?: string,
    @Query('assignedTo') assignedTo?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<unknown> {
    return this.queue.execute({
      status: status as CaseStatus | undefined,
      assignedToUserId: assignedTo,
      limit: limite(limit, 25, 50),
      cursor,
    });
  }

  @Auth({ permissions: ['moderation.read'], audit: 'moderation.case.viewed' })
  @Get('cases/:caseId')
  @ApiOperation({ summary: 'Dossier complet — signalements, actions, signaux, antécédents' })
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('caseId') caseId: string,
  ): Promise<unknown> {
    return this.detail.execute(user.id, requireAuditRole(user), caseId);
  }

  @Auth({ permissions: ['moderation.assign'], audit: 'moderation.case.assigned' })
  @Post('cases/:caseId/assign')
  @ApiOperation({ summary: 'S’attribuer un cas ou s’en dessaisir' })
  async assignCase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('caseId') caseId: string,
    @ZodBody(assignSchema) body: unknown,
  ): Promise<unknown> {
    const { assignTo } = body as { assignTo: string | null };
    return this.assign.execute({
      moderatorId: user.id,
      moderatorRole: requireAuditRole(user),
      caseId,
      assignTo,
    });
  }

  /**
   * `moderation.act` ouvre la route ; le bannissement exige en plus `users.ban`
   * et un second valideur distinct. Ces deux contrôles ne peuvent pas vivre dans
   * la politique de route : elle est évaluée avant le corps de la requête et ne
   * sait donc pas quelle action est demandée. Ils sont faits côté serveur dans le
   * cas d'usage, à partir des permissions réelles de l'appelant.
   */
  @Auth({ permissions: ['moderation.act'], audit: 'moderation.action' })
  @Post('cases/:caseId/action')
  @ApiOperation({ summary: 'Appliquer une des 10 actions, avec motif normalisé' })
  async act(
    @CurrentUser() user: AuthenticatedUser,
    @Param('caseId') caseId: string,
    @ZodBody(actionSchema) body: unknown,
  ): Promise<unknown> {
    const input = body as z.infer<typeof actionSchema>;

    return this.apply.execute({
      moderatorId: user.id,
      moderatorRole: requireAuditRole(user),
      actorPermissions: user.permissions,
      caseId,
      action: input.action,
      reasonCode: input.reasonCode,
      note: input.note,
      approvedByUserId: input.approvedByUserId,
      effectiveUntil: input.effectiveUntil === null ? null : new Date(input.effectiveUntil),
      targetId: input.targetId,
    });
  }

  @Auth({ permissions: ['moderation.act'], audit: 'moderation.action.reverted' })
  @Post('actions/:actionId/revert')
  @ApiOperation({ summary: 'Annuler une sanction réversible — jamais un bannissement' })
  async revertAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('actionId') actionId: string,
    @ZodBody(revertSchema) body: unknown,
  ): Promise<unknown> {
    const { reasonCode } = body as { reasonCode: string };
    return this.revert.execute({
      moderatorId: user.id,
      moderatorRole: requireAuditRole(user),
      actionId,
      reasonCode,
    });
  }

  @Auth({ permissions: ['moderation.read'] })
  @Post('users/:userId/evaluate')
  @ApiOperation({ summary: 'Réévaluer les 9 règles de détection — ne sanctionne jamais' })
  async evaluateUser(@Param('userId') userId: string): Promise<unknown> {
    return this.evaluate.execute(userId);
  }

  @Auth({ permissions: ['moderation.read'] })
  @Get('metrics')
  @ApiOperation({ summary: 'Volumétrie, retards et délai médian de traitement' })
  async queueMetrics(): Promise<unknown> {
    return this.metrics.execute();
  }
}
