import { Controller, Delete, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Auth } from '../../../common/auth/auth.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../../common/auth/auth.guard';
import { ZodBody } from '../../../common/validation/zod.pipe';
import {
  DISCOVERY_REPOSITORY,
  MATCHING_REPOSITORY,
  type DiscoveryRepository,
  type MatchingRepository,
} from '../application/ports';
import {
  BlockUserUseCase,
  GetSuggestionsUseCase,
  ListInterestsUseCase,
  RevokeLikeUseCase,
  SendLikeUseCase,
  UnblockUserUseCase,
  UnmatchUseCase,
} from '../application/discovery.use-cases';

const likeSchema = z
  .object({
    targetUserId: z.string().min(10).max(40),
    type: z.enum(['INTEREST', 'PASS']),
  })
  .strict();

const blockSchema = z
  .object({
    targetUserId: z.string().min(10).max(40),
    reason: z.string().max(200).optional(),
  })
  .strict();

const unmatchSchema = z
  .object({
    reason: z.string().max(200).optional(),
  })
  .strict();

const limite = (valeur: string | undefined, defaut = 20): number =>
  Math.min(Number(valeur ?? defaut) || defaut, 50);

/**
 * Découverte, intérêts et matchs (tranche D4).
 *
 * Toutes ces routes exigent le niveau `verified` : la découverte est fermée tant que
 * l'identité n'est pas vérifiée (ADR-006).
 */
@ApiTags('discovery')
@Controller()
export class DiscoveryController {
  constructor(
    private readonly suggestions: GetSuggestionsUseCase,
    private readonly sendLike: SendLikeUseCase,
    private readonly revokeLike: RevokeLikeUseCase,
    private readonly interests: ListInterestsUseCase,
    private readonly unmatch: UnmatchUseCase,
    private readonly block: BlockUserUseCase,
    private readonly unblock: UnblockUserUseCase,
    @Inject(MATCHING_REPOSITORY) private readonly matching: MatchingRepository,
    @Inject(DISCOVERY_REPOSITORY) private readonly discovery: DiscoveryRepository,
  ) {}

  @Auth({ level: 'verified', rateLimit: 'discovery.suggestions' })
  @Get('discovery/suggestions')
  @ApiOperation({ summary: 'Suggestions du jour' })
  async getSuggestions(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    const resultat = await this.suggestions.execute(user.id);
    return { ...resultat, nextCursor: null, hasMore: false };
  }

  @Auth({ level: 'verified', rateLimit: 'discovery.like' })
  @Post('likes')
  @ApiOperation({ summary: 'Envoyer un intérêt ou passer un profil' })
  async postLike(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(likeSchema) body: unknown,
  ): Promise<unknown> {
    const input = body as { targetUserId: string; type: 'INTEREST' | 'PASS' };
    return this.sendLike.execute(user.id, input.targetUserId, input.type);
  }

  @Auth({ level: 'verified' })
  @Delete('likes/:targetUserId')
  @ApiOperation({ summary: 'Retirer un intérêt non encore réciproque' })
  async deleteLike(
    @CurrentUser() user: AuthenticatedUser,
    @Param('targetUserId') targetUserId: string,
  ): Promise<{ revoked: true }> {
    await this.revokeLike.execute(user.id, targetUserId);
    return { revoked: true };
  }

  @Auth({ level: 'verified' })
  @Get('likes/sent')
  @ApiOperation({ summary: 'Mes intérêts envoyés' })
  async getSent(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ): Promise<unknown> {
    return this.interests.sent(user.id, limite(limit));
  }

  @Auth({ level: 'verified' })
  @Get('likes/received')
  @ApiOperation({
    summary: 'Intérêts reçus — identités omises hors offre Premium, pas seulement masquées',
  })
  async getReceived(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ): Promise<unknown> {
    const seeker = await this.discovery.loadSeeker(user.id);
    return this.interests.received(user.id, limite(limit), seeker?.isPremium ?? false);
  }

  @Auth({ level: 'verified' })
  @Get('matches')
  @ApiOperation({ summary: 'Mes matchs actifs' })
  async getMatches(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ): Promise<unknown> {
    const items = await this.matching.listMatches(user.id, limite(limit));
    return { items, nextCursor: null, hasMore: false };
  }

  @Auth({ level: 'verified' })
  @Delete('matches/:matchId')
  @ApiOperation({ summary: 'Annuler un match et fermer la conversation' })
  async deleteMatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId') matchId: string,
    @ZodBody(unmatchSchema) body: unknown,
  ): Promise<{ unmatched: true }> {
    const { reason } = body as { reason?: string };
    await this.unmatch.execute(user.id, matchId, reason ?? 'Non précisé');
    return { unmatched: true };
  }

  /**
   * Le blocage n'exige PAS d'être vérifié : c'est une fonction de sécurité, elle doit
   * rester accessible à tout compte actif (docs/05-api.md §5).
   */
  @Auth()
  @Post('blocks')
  @ApiOperation({ summary: 'Bloquer un membre — effet immédiat et réciproque' })
  async postBlock(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(blockSchema) body: unknown,
  ): Promise<{ blocked: true }> {
    const input = body as { targetUserId: string; reason?: string };
    await this.block.execute(user.id, input.targetUserId, input.reason ?? null);
    return { blocked: true };
  }

  @Auth()
  @Delete('blocks/:targetUserId')
  @ApiOperation({ summary: 'Débloquer un membre' })
  async deleteBlock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('targetUserId') targetUserId: string,
  ): Promise<{ unblocked: true }> {
    await this.unblock.execute(user.id, targetUserId);
    return { unblocked: true };
  }

  @Auth()
  @Get('blocks')
  @ApiOperation({ summary: 'Membres que j’ai bloqués' })
  async getBlocks(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return { items: await this.matching.listBlocked(user.id) };
  }
}
