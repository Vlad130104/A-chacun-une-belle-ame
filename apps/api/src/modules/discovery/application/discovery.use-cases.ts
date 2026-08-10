import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import type { ClockProvider } from '../../../providers/ports';
import {
  applyDiversity,
  computeScore,
  DEFAULT_SCORING_CONFIG,
  type ScoringConfig,
} from '../domain/compatibility-score';
import { checkEligibility, type MatchingPolicy } from '../domain/eligibility';
import type {
  ConversationGateway,
  DiscoveryRepository,
  MatchingRepository,
  MatchRecord,
  QuotaCounter,
} from './ports';

export interface DiscoveryConfig {
  maxCandidates: number;
  dailySuggestionLimitFree: number;
  dailySuggestionLimitPremium: number;
  dailyLikeLimitFree: number;
  dailyLikeLimitPremium: number;
  minimumAge: number;
  minimumCompletion: number;
  policy: MatchingPolicy;
  scoring: ScoringConfig;
}

export const DEFAULT_DISCOVERY_CONFIG: DiscoveryConfig = {
  maxCandidates: 500,
  dailySuggestionLimitFree: 10,
  dailySuggestionLimitPremium: 30,
  dailyLikeLimitFree: 10,
  dailyLikeLimitPremium: 50,
  minimumAge: 18,
  minimumCompletion: 60,
  policy: 'HETERO',
  scoring: DEFAULT_SCORING_CONFIG,
};

export interface Suggestion {
  userId: string;
  score: number;
  sharedInterestCount: number;
}

export interface SuggestionsResult {
  items: Suggestion[];
  quotaRemaining: number;
  quotaResetsAt: Date;
}

/**
 * Suggestions du jour (stories D4-01, D4-02, D4-08).
 *
 * Trois temps : pré-filtre SQL → filtres durs → scoring → diversité → quota.
 * Le quota est consommé APRÈS constitution du lot : un quota entamé pour renvoyer une
 * liste vide serait doublement pénalisant.
 */
export class GetSuggestionsUseCase {
  constructor(
    private readonly repository: DiscoveryRepository,
    private readonly quotas: QuotaCounter,
    private readonly clock: ClockProvider,
    private readonly config: DiscoveryConfig,
  ) {}

  async execute(userId: string): Promise<SuggestionsResult> {
    const seeker = await this.repository.loadSeeker(userId);
    if (seeker === null) throw BusinessError.notFound(ErrorCode.NOT_FOUND);

    const limit = seeker.isPremium
      ? this.config.dailySuggestionLimitPremium
      : this.config.dailySuggestionLimitFree;

    const quota = await this.quotas.peek(`suggestions:${userId}`, limit);
    if (quota.remaining <= 0) {
      throw new BusinessError(ErrorCode.DISCOVERY_QUOTA_EXCEEDED, 429, {
        quotaResetsAt: quota.resetsAt.toISOString(),
      });
    }

    const exclusions = await this.repository.loadExclusions(userId);
    const contexte = {
      blockedUserIds: new Set(exclusions.blockedUserIds),
      seenUserIds: new Set(exclusions.seenUserIds),
      decidedUserIds: new Set(exclusions.decidedUserIds),
      matchedUserIds: new Set(exclusions.matchedUserIds),
      minimumAge: this.config.minimumAge,
      minimumCompletion: this.config.minimumCompletion,
      policy: this.config.policy,
    };

    const candidats = await this.repository.findCandidates(seeker, this.config.maxCandidates);

    // Les filtres durs sont réappliqués ici même si le SQL les a déjà posés : une
    // suggestion illégitime est une faute produit, pas une imprécision.
    const eligibles = candidats.filter(
      (candidat) => checkEligibility(seeker, candidat, contexte).eligible,
    );

    const notes = eligibles
      .map((candidat) => {
        const resultat = computeScore(seeker.scoring, candidat.scoring, this.config.scoring);
        const communs = new Set(candidat.scoring.interestSlugs);
        return {
          userId: candidat.userId,
          cityId: candidat.cityId,
          score: resultat.final,
          sharedInterestCount: seeker.scoring.interestSlugs.filter((slug) => communs.has(slug))
            .length,
        };
      })
      .sort((a, b) => b.score - a.score);

    const lot = applyDiversity(notes, Math.min(quota.remaining, limit));

    if (lot.length === 0) {
      // Aucun candidat : ne pas consommer de quota pour une liste vide.
      return { items: [], quotaRemaining: quota.remaining, quotaResetsAt: quota.resetsAt };
    }

    const consomme = await this.quotas.consume(`suggestions:${userId}`, limit);
    const now = this.clock.now();

    for (const suggestion of lot) {
      await this.repository.recordView(
        userId,
        suggestion.userId,
        suggestion.score,
        'daily_suggestion',
      );
    }

    return {
      items: lot.map((item) => ({
        userId: item.userId,
        score: Number(item.score.toFixed(4)),
        sharedInterestCount: item.sharedInterestCount,
      })),
      quotaRemaining: consomme.remaining,
      quotaResetsAt: consomme.resetsAt ?? now,
    };
  }
}

export interface LikeResult {
  likeId: string;
  matched: boolean;
  match: MatchRecord | null;
}

/**
 * Intérêt ou refus (stories D4-03 et D4-04).
 *
 * La réciprocité crée le match ET sa conversation dans une seule transaction : il ne
 * peut exister ni match sans conversation, ni conversation sans match.
 */
export class SendLikeUseCase {
  constructor(
    private readonly discovery: DiscoveryRepository,
    private readonly matching: MatchingRepository,
    private readonly conversations: ConversationGateway,
    private readonly quotas: QuotaCounter,
    private readonly clock: ClockProvider,
    private readonly config: DiscoveryConfig,
  ) {}

  async execute(
    userId: string,
    targetUserId: string,
    type: 'INTEREST' | 'PASS',
  ): Promise<LikeResult> {
    if (userId === targetUserId) throw BusinessError.badRequest(ErrorCode.MATCH_SELF);

    const seeker = await this.discovery.loadSeeker(userId);
    if (seeker === null) throw BusinessError.notFound(ErrorCode.NOT_FOUND);

    const deja = await this.matching.findLike(userId, targetUserId);
    if (deja !== null) throw BusinessError.conflict(ErrorCode.MATCH_ALREADY_DECIDED);

    if (await this.matching.isBlockedEitherWay(userId, targetUserId)) {
      // Message identique à « profil indisponible » : ne pas révéler un blocage.
      throw BusinessError.notFound(ErrorCode.MATCH_BLOCKED);
    }

    // Le quota ne s'applique qu'aux intérêts : refuser un profil doit rester gratuit,
    // sinon on pousse les membres à accepter par économie.
    if (type === 'INTEREST') {
      const limit = seeker.isPremium
        ? this.config.dailyLikeLimitPremium
        : this.config.dailyLikeLimitFree;
      const quota = await this.quotas.consume(`likes:${userId}`, limit);
      if (!quota.allowed) throw BusinessError.rateLimited(ErrorCode.DISCOVERY_QUOTA_EXCEEDED);
    }

    const now = this.clock.now();
    const { like, match } = await this.matching.createLikeAndMatchIfReciprocal({
      senderId: userId,
      receiverId: targetUserId,
      type,
      score: null,
      now,
    });

    if (match !== null && match.conversationId === null) {
      // La conversation est créée par le module qui en est propriétaire.
      await this.conversations.createForMatch(match.id, [match.userAId, match.userBId], now);
    }

    return { likeId: like.id, matched: match !== null, match };
  }
}

/** Retrait d'un intérêt non encore réciproque. */
export class RevokeLikeUseCase {
  constructor(
    private readonly matching: MatchingRepository,
    private readonly clock: ClockProvider,
  ) {}

  async execute(userId: string, targetUserId: string): Promise<void> {
    const like = await this.matching.findLike(userId, targetUserId);
    if (like === null || like.type !== 'INTEREST') {
      throw BusinessError.notFound(ErrorCode.NOT_FOUND);
    }

    const match = await this.matching.findMatchBetween(userId, targetUserId);
    if (match !== null && match.status === 'ACTIVE') {
      // Un match déjà formé se défait par « annuler le match », pas en retirant
      // discrètement l'intérêt : l'autre membre doit voir la conversation se fermer.
      throw BusinessError.conflict(ErrorCode.MATCH_ALREADY_DECIDED);
    }

    await this.matching.revokeLike(userId, targetUserId, this.clock.now());
  }
}

export class ListInterestsUseCase {
  constructor(private readonly matching: MatchingRepository) {}

  async sent(userId: string, limit: number): Promise<{ items: unknown[] }> {
    const likes = await this.matching.listLikesSent(userId, limit);
    return {
      items: likes
        .filter((like) => like.type === 'INTEREST')
        .map((like) => ({ id: like.id, targetUserId: like.receiverId, createdAt: like.createdAt })),
    };
  }

  /**
   * Intérêts reçus. En offre gratuite, l'identité n'est PAS envoyée au client : le
   * floutage est une omission de données, pas un filtre CSS contournable.
   */
  async received(
    userId: string,
    limit: number,
    isPremium: boolean,
  ): Promise<{ items: unknown[]; totalCount: number }> {
    const likes = await this.matching.listLikesReceived(userId, limit);
    const totalCount = await this.matching.countLikesReceived(userId);

    return {
      items: likes
        .filter((like) => like.type === 'INTEREST')
        .map((like) => ({
          id: like.id,
          createdAt: like.createdAt,
          blurred: !isPremium,
          ...(isPremium ? { senderId: like.senderId } : {}),
        })),
      totalCount,
    };
  }
}

export class UnmatchUseCase {
  constructor(
    private readonly matching: MatchingRepository,
    private readonly conversations: ConversationGateway,
    private readonly clock: ClockProvider,
  ) {}

  async execute(userId: string, matchId: string, reason: string): Promise<void> {
    const match = await this.matching.findMatchById(matchId);
    if (match === null || (match.userAId !== userId && match.userBId !== userId)) {
      throw BusinessError.notFound(ErrorCode.NOT_FOUND);
    }
    if (match.status !== 'ACTIVE') throw BusinessError.conflict(ErrorCode.MATCH_ALREADY_DECIDED);

    const now = this.clock.now();
    await this.matching.unmatch(matchId, userId, now, reason);
    await this.conversations.lockForUnmatch(matchId, now);
  }
}

/**
 * Blocage (story D4-06).
 *
 * Effet immédiat et réciproque : disparition mutuelle de la découverte et verrouillage
 * de la conversation éventuelle. Un blocage n'a pas à être motivé.
 */
export class BlockUserUseCase {
  constructor(
    private readonly matching: MatchingRepository,
    private readonly conversations: ConversationGateway,
    private readonly clock: ClockProvider,
  ) {}

  async execute(userId: string, targetUserId: string, reason: string | null): Promise<void> {
    if (userId === targetUserId) throw BusinessError.badRequest(ErrorCode.MATCH_SELF);

    const now = this.clock.now();
    await this.matching.block(userId, targetUserId, reason, now);
    await this.conversations.lockForBlock(userId, targetUserId, now);
  }
}

export class UnblockUserUseCase {
  constructor(private readonly matching: MatchingRepository) {}

  async execute(userId: string, targetUserId: string): Promise<void> {
    await this.matching.unblock(userId, targetUserId);
  }
}
