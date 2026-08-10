import { Controller, Get, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '../../../common/auth/auth.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../../common/auth/auth.guard';
import { ZodBody } from '../../../common/validation/zod.pipe';
import type { DocumentTypeValue } from '../domain/document-policy';
import {
  DecideVerificationUseCase,
  StartVerificationUseCase,
  SubmitVerificationUseCase,
  UploadDocumentUseCase,
} from '../application/verification.use-cases';
import { VERIFICATION_REPOSITORY, type VerificationRepository } from '../application/ports';
import { Inject } from '@nestjs/common';
import { decisionSchema, uploadDocumentSchema } from './verification.schemas';

interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/** Parcours membre de la vérification d'identité (tranche D2). */
@ApiTags('verification')
@Controller('verification')
export class VerificationController {
  constructor(
    private readonly start: StartVerificationUseCase,
    private readonly upload: UploadDocumentUseCase,
    private readonly submit: SubmitVerificationUseCase,
    @Inject(VERIFICATION_REPOSITORY) private readonly repository: VerificationRepository,
  ) {}

  @Auth({ level: 'pending' })
  @Get('status')
  @ApiOperation({ summary: 'Statut de vérification et action attendue' })
  async getStatus(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    const request = await this.repository.findLatestByUser(user.id);
    return {
      status: request?.status ?? 'NOT_STARTED',
      canResubmit: request?.status === 'REJECTED' || request?.status === 'ADDITIONAL_REQUIRED',
      requiredDocuments: ['NATIONAL_ID | PASSPORT | DRIVER_LICENSE | CONSULAR_CARD', 'SELFIE'],
      // Transparence : tant qu'aucun prestataire n'est branché, la décision est humaine.
      testMode: true,
    };
  }

  @Auth({ level: 'pending' })
  @Post('requests')
  @ApiOperation({ summary: 'Ouvrir une demande de vérification' })
  async postRequest(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    const request = await this.start.execute(user.id);
    return { id: request.id, status: request.status, submittedAt: request.submittedAt };
  }

  @Auth({ level: 'pending', owner: true })
  @Post('requests/:requestId/documents')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Déposer une pièce d’identité ou un selfie' })
  async postDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @ZodBody(uploadDocumentSchema) body: unknown,
    @UploadedFile() file: UploadedFileLike | undefined,
  ): Promise<unknown> {
    const { type } = body as { type: DocumentTypeValue };

    // La réponse ne contient jamais de clé de stockage ni d'URL (docs/05-api.md §3).
    return this.upload.execute({
      userId: user.id,
      requestId,
      type,
      declaredContentType: file?.mimetype ?? 'application/octet-stream',
      bytes: file?.buffer ?? Buffer.alloc(0),
    });
  }

  @Auth({ level: 'pending', owner: true })
  @Post('requests/:requestId/submit')
  @ApiOperation({ summary: 'Soumettre la demande pour revue' })
  async postSubmit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
  ): Promise<unknown> {
    return this.submit.execute(user.id, requestId);
  }
}

/**
 * File de vérification côté back-office (stories D2-03 et D2-04).
 *
 * `kyc.review` et `kyc.view_document` sont deux permissions DISTINCTES : traiter un
 * dossier n'emporte pas le droit d'ouvrir la pièce d'identité sans motif
 * (docs/06-roles-et-permissions.md §3.1).
 */
@ApiTags('admin')
@Controller('admin/verification')
export class AdminVerificationController {
  constructor(
    private readonly decide: DecideVerificationUseCase,
    @Inject(VERIFICATION_REPOSITORY) private readonly repository: VerificationRepository,
  ) {}

  @Auth({ permissions: ['kyc.review'], audit: 'kyc.queue.viewed' })
  @Get('queue')
  @ApiOperation({ summary: 'File de vérification, du dossier le plus ancien au plus récent' })
  async getQueue(@Query('limit') limit?: string): Promise<unknown> {
    const taille = Math.min(Number(limit ?? 20) || 20, 50);
    const items = await this.repository.listQueue(taille);
    return { items, nextCursor: null, hasMore: items.length === taille };
  }

  @Auth({ permissions: ['kyc.review'], audit: 'kyc.decision' })
  @Post(':requestId/decision')
  @ApiOperation({ summary: 'Approuver, rejeter ou demander un complément' })
  async postDecision(
    @CurrentUser() agent: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @ZodBody(decisionSchema) body: unknown,
  ): Promise<unknown> {
    const input = body as {
      outcome: 'APPROVE' | 'REJECT' | 'REQUEST_ADDITIONAL';
      reasonCode: string;
      reasonNote?: string;
    };

    return this.decide.execute({
      requestId,
      agentUserId: agent.id,
      outcome: input.outcome,
      reasonCode: input.reasonCode,
      ...(input.reasonNote !== undefined ? { reasonNote: input.reasonNote } : {}),
    });
  }

  // TODO(D9-01): GET :requestId/documents/:documentId/url — accès le plus sensible de
  // la plateforme. Il exige un motif écrit, une URL de 5 minutes et un événement
  // d'audit nominatif ; il sera livré avec le journal d'audit de la tranche D9 plutôt
  // qu'ouvert ici sans traçabilité.
}
