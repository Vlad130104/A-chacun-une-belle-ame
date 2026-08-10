import type { Candidate, Seeker } from '../domain/compatibility-score';
import type { EligibilityCandidate, EligibilitySeeker } from '../domain/eligibility';

export const DISCOVERY_REPOSITORY = Symbol('DiscoveryRepository');
export const MATCHING_REPOSITORY = Symbol('MatchingRepository');
export const CONVERSATION_GATEWAY = Symbol('ConversationGateway');
export const QUOTA_COUNTER = Symbol('QuotaCounter');

/** Profil complet d'un candidat : données d'éligibilité et de scoring réunies. */
export interface CandidateProfile extends EligibilityCandidate {
  scoring: Candidate;
}

export interface SeekerProfile extends EligibilitySeeker {
  scoring: Seeker;
  /** Droits ouverts par l'abonnement — résolus par le module `subscriptions` (D7). */
  isPremium: boolean;
}

export interface DiscoveryRepository {
  loadSeeker(userId: string): Promise<SeekerProfile | null>;

  /**
   * Pré-filtre SQL indexé. C'est lui qui garantit la tenue à x10 : le scoring
   * applicatif ne dépend pas de la taille de la base, seulement de ce plafond
   * (docs/04-algorithme-de-matching.md §1).
   */
  findCandidates(seeker: SeekerProfile, maxCandidates: number): Promise<CandidateProfile[]>;

  loadExclusions(userId: string): Promise<{
    blockedUserIds: string[];
    seenUserIds: string[];
    decidedUserIds: string[];
    matchedUserIds: string[];
  }>;

  /** Trace la suggestion servie, avec son score, pour pouvoir l'auditer a posteriori. */
  recordView(viewerId: string, viewedId: string, score: number, source: string): Promise<void>;
}

export interface LikeRecord {
  id: string;
  senderId: string;
  receiverId: string;
  type: 'INTEREST' | 'PASS';
  createdAt: Date;
}

export interface MatchRecord {
  id: string;
  userAId: string;
  userBId: string;
  status: 'ACTIVE' | 'UNMATCHED' | 'CLOSED_BY_MODERATION';
  score: number | null;
  conversationId: string | null;
  matchedAt: Date;
}

export interface MatchingRepository {
  findLike(senderId: string, receiverId: string): Promise<LikeRecord | null>;
  findMatchBetween(userAId: string, userBId: string): Promise<MatchRecord | null>;
  findMatchById(matchId: string): Promise<MatchRecord | null>;

  /**
   * Enregistre l'intérêt et, si la réciprocité est établie, crée le match, la
   * conversation et ses membres dans UNE SEULE transaction (story D4-04).
   */
  createLikeAndMatchIfReciprocal(input: {
    senderId: string;
    receiverId: string;
    type: 'INTEREST' | 'PASS';
    score: number | null;
    now: Date;
  }): Promise<{ like: LikeRecord; match: MatchRecord | null }>;

  revokeLike(senderId: string, receiverId: string, at: Date): Promise<void>;

  listLikesSent(userId: string, limit: number, cursor?: string): Promise<LikeRecord[]>;
  listLikesReceived(userId: string, limit: number, cursor?: string): Promise<LikeRecord[]>;
  countLikesReceived(userId: string): Promise<number>;

  listMatches(userId: string, limit: number, cursor?: string): Promise<MatchRecord[]>;
  unmatch(matchId: string, byUserId: string, at: Date, reason: string): Promise<void>;

  block(blockerId: string, blockedId: string, reason: string | null, at: Date): Promise<void>;
  unblock(blockerId: string, blockedId: string): Promise<void>;
  listBlocked(userId: string): Promise<string[]>;
  isBlockedEitherWay(userAId: string, userBId: string): Promise<boolean>;
}

/**
 * Création de la conversation d'un match.
 *
 * Le port est déclaré ici, l'implémentation vit dans le module `conversations` : le
 * matching n'écrit jamais directement dans les tables d'un autre module
 * (docs/01-architecture.md §3).
 */
export interface ConversationGateway {
  createForMatch(matchId: string, memberIds: [string, string], at: Date): Promise<string>;
  lockForUnmatch(matchId: string, at: Date): Promise<void>;
  lockForBlock(userAId: string, userBId: string, at: Date): Promise<void>;
}

/** Quotas quotidiens, comptés côté serveur (story D4-08). */
export interface QuotaCounter {
  consume(
    key: string,
    limit: number,
  ): Promise<{ allowed: boolean; remaining: number; resetsAt: Date }>;
  peek(key: string, limit: number): Promise<{ remaining: number; resetsAt: Date }>;
}
