import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Auth } from '../../../common/auth/auth.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../../common/auth/auth.guard';
import { ZodBody } from '../../../common/validation/zod.pipe';
import {
  DeleteMessageUseCase,
  GetConversationUseCase,
  ListConversationsUseCase,
  ListMessagesUseCase,
  MarkReadUseCase,
  SendAttachmentUseCase,
  SendMessageUseCase,
  SetConversationFlagsUseCase,
  type MessageView,
} from '../application/conversation.use-cases';
import type { ConversationSummary } from '../application/ports';

const sendSchema = z
  .object({
    body: z.string().min(1).max(8000),
  })
  .strict();

const readSchema = z
  .object({
    upToMessageId: z.string().min(10).max(40),
  })
  .strict();

const muteSchema = z
  .object({
    /** Date ISO 8601 en UTC, ou `null` pour lever le silence. */
    until: z.string().datetime().nullable(),
  })
  .strict();

const archiveSchema = z
  .object({
    archived: z.boolean(),
  })
  .strict();

interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
}

const limite = (valeur: string | undefined, defaut: number, max: number): number =>
  Math.min(Number(valeur ?? defaut) || defaut, max);

/**
 * Clé d'idempotence obligatoire à l'envoi (docs/05-api.md §2).
 *
 * Elle est exigée par le serveur et non « recommandée » : sur les réseaux visés,
 * la coupure entre l'envoi et la réponse est le cas nominal, pas l'exception.
 */
function requireIdempotencyKey(header: string | undefined): string {
  if (header === undefined || header.trim().length < 8 || header.length > 100) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'En-tête Idempotency-Key requis (8 à 100 caractères).',
    });
  }
  return header.trim();
}

/**
 * Conversations et messages (tranche D5).
 *
 * Aucune route ne permet d'écrire à quelqu'un par son identifiant : l'unique porte
 * d'entrée est une conversation, et une conversation n'existe que par un match.
 * Un test d'inventaire vérifie cette propriété sur l'ensemble des routes de l'API.
 */
@ApiTags('conversations')
@Controller()
export class ConversationsController {
  constructor(
    private readonly listConversations: ListConversationsUseCase,
    private readonly getConversation: GetConversationUseCase,
    private readonly listMessages: ListMessagesUseCase,
    private readonly sendMessage: SendMessageUseCase,
    private readonly sendAttachment: SendAttachmentUseCase,
    private readonly markRead: MarkReadUseCase,
    private readonly deleteMessage: DeleteMessageUseCase,
    private readonly flags: SetConversationFlagsUseCase,
  ) {}

  @Auth({ level: 'verified', rateLimit: 'conversations.list' })
  @Get('conversations')
  @ApiOperation({ summary: 'Mes conversations, triées et avec le nombre de non-lus' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('archived') archived?: string,
  ): Promise<{ items: ConversationSummary[]; nextCursor: string | null; hasMore: boolean }> {
    return this.listConversations.execute({
      userId: user.id,
      limit: limite(limit, 20, 50),
      cursor,
      includeArchived: archived === 'true',
    });
  }

  @Auth({ level: 'verified', conversationMember: true })
  @Get('conversations/:conversationId')
  @ApiOperation({ summary: 'Détail d’une conversation' })
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
  ): Promise<ConversationSummary> {
    return this.getConversation.execute(user.id, conversationId);
  }

  @Auth({ level: 'verified', conversationMember: true, rateLimit: 'conversations.messages' })
  @Get('conversations/:conversationId/messages')
  @ApiOperation({ summary: 'Historique paginé, du plus récent au plus ancien' })
  async messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<{ items: MessageView[]; nextCursor: string | null; hasMore: boolean }> {
    return this.listMessages.execute({
      userId: user.id,
      conversationId,
      limit: limite(limit, 30, 50),
      cursor,
    });
  }

  @Auth({ level: 'verified', conversationMember: true, rateLimit: 'conversations.send' })
  @Post('conversations/:conversationId/messages')
  @ApiOperation({ summary: 'Envoyer un message — Idempotency-Key obligatoire' })
  async send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @ZodBody(sendSchema) body: unknown,
  ): Promise<MessageView> {
    const input = body as { body: string };
    return this.sendMessage.execute({
      userId: user.id,
      conversationId,
      body: input.body,
      clientIdempotencyKey: requireIdempotencyKey(idempotencyKey),
    });
  }

  @Auth({ level: 'verified', conversationMember: true, rateLimit: 'conversations.attachment' })
  @Post('conversations/:conversationId/attachments')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Joindre une image — visible après modération seulement' })
  async attachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @UploadedFile() file?: UploadedFileLike,
  ): Promise<MessageView> {
    if (file === undefined) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Fichier requis.' });
    }

    return this.sendAttachment.execute({
      userId: user.id,
      conversationId,
      bytes: file.buffer,
      clientIdempotencyKey: requireIdempotencyKey(idempotencyKey),
    });
  }

  @Auth({ level: 'verified', conversationMember: true, rateLimit: 'conversations.read' })
  @Post('conversations/:conversationId/read')
  @ApiOperation({ summary: 'Marquer comme lu jusqu’à un message' })
  async read(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @ZodBody(readSchema) body: unknown,
  ): Promise<{ updated: number }> {
    const input = body as { upToMessageId: string };
    return this.markRead.execute({
      userId: user.id,
      conversationId,
      upToMessageId: input.upToMessageId,
    });
  }

  @Auth({ level: 'verified', conversationMember: true })
  @Patch('conversations/:conversationId/mute')
  @ApiOperation({ summary: 'Mettre la conversation en silence' })
  async mute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @ZodBody(muteSchema) body: unknown,
  ): Promise<{ muted: boolean }> {
    const input = body as { until: string | null };
    const jusqua = input.until === null ? null : new Date(input.until);
    await this.flags.mute(user.id, conversationId, jusqua);
    return { muted: jusqua !== null };
  }

  @Auth({ level: 'verified', conversationMember: true })
  @Patch('conversations/:conversationId/archive')
  @ApiOperation({ summary: 'Archiver ou désarchiver une conversation' })
  async archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @ZodBody(archiveSchema) body: unknown,
  ): Promise<{ archived: boolean }> {
    const input = body as { archived: boolean };
    await this.flags.archive(user.id, conversationId, input.archived);
    return { archived: input.archived };
  }

  /**
   * La propriété du message est vérifiée côté serveur, à partir de son auteur réel :
   * l'identifiant fourni par le client ne sert qu'à désigner la ligne.
   */
  @Auth({ level: 'verified', owner: true })
  @Delete('messages/:messageId')
  @ApiOperation({ summary: 'Supprimer un de mes messages — le corps est effacé' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId') messageId: string,
  ): Promise<{ deleted: true }> {
    await this.deleteMessage.execute(user.id, messageId);
    return { deleted: true };
  }
}
