import type { Candidate, Seeker } from '../domain/compatibility-score';
import type {
  CandidateProfile,
  ConversationGateway,
  DiscoveryRepository,
  LikeRecord,
  MatchingRepository,
  MatchRecord,
  QuotaCounter,
  SeekerProfile,
} from './ports';

/** Doubles en mémoire du module découverte (docs/09-plan-de-tests.md §1). */

const scoringBase: Omit<Candidate, 'userId'> = {
  age: 32,
  cityId: 'douala',
  regionCode: 'littoral',
  countryCode: 'CM',
  interestSlugs: ['lecture', 'voyage'],
  valueSlugs: ['famille'],
  relationshipStatus: 'SINGLE',
  hasChildren: false,
  completionRate: 80,
  daysSinceActive: 0,
  isNewProfile: false,
  boostMultiplier: 1,
  impressionsToday: 0,
  preference: {
    minAge: 18,
    maxAge: 99,
    cityIds: [],
    acceptedRelationshipStatuses: ['SINGLE', 'DIVORCED', 'WIDOWED', 'SEPARATED'],
    acceptsChildren: true,
  },
};

export function makeSeeker(userId: string, surcharge: Partial<SeekerProfile> = {}): SeekerProfile {
  const scoring: Seeker = { userId, ...scoringBase, ...(surcharge.scoring ?? {}) };
  return {
    userId,
    age: scoring.age,
    gender: 'FEMALE',
    cityId: scoring.cityId,
    countryCode: scoring.countryCode,
    seekingGender: 'MALE',
    preferenceMinAge: 18,
    preferenceMaxAge: 99,
    preferenceCityIds: [],
    sameCountryOnly: false,
    isPremium: false,
    ...surcharge,
    scoring,
  };
}

export function makeCandidate(
  userId: string,
  surcharge: Partial<CandidateProfile> = {},
): CandidateProfile {
  const scoring: Candidate = { userId, ...scoringBase, ...(surcharge.scoring ?? {}) };
  return {
    userId,
    age: scoring.age,
    gender: 'MALE',
    cityId: scoring.cityId,
    countryCode: scoring.countryCode,
    accountStatus: 'ACTIVE',
    verificationStatus: 'VERIFIED',
    profileStatus: 'ACTIVE',
    completionRate: scoring.completionRate,
    hasApprovedPhoto: true,
    seekingGender: 'FEMALE',
    preferenceMinAge: 18,
    preferenceMaxAge: 99,
    ...surcharge,
    scoring,
  };
}

export class InMemoryDiscoveryRepository implements DiscoveryRepository {
  readonly seekers = new Map<string, SeekerProfile>();
  candidates: CandidateProfile[] = [];
  readonly views: Array<{ viewerId: string; viewedId: string; score: number }> = [];
  exclusions = {
    blockedUserIds: [] as string[],
    seenUserIds: [] as string[],
    decidedUserIds: [] as string[],
    matchedUserIds: [] as string[],
  };

  loadSeeker(userId: string): Promise<SeekerProfile | null> {
    return Promise.resolve(this.seekers.get(userId) ?? null);
  }

  findCandidates(_seeker: SeekerProfile, maxCandidates: number): Promise<CandidateProfile[]> {
    return Promise.resolve(this.candidates.slice(0, maxCandidates));
  }

  loadExclusions(): Promise<typeof this.exclusions> {
    return Promise.resolve(this.exclusions);
  }

  recordView(viewerId: string, viewedId: string, score: number): Promise<void> {
    this.views.push({ viewerId, viewedId, score });
    return Promise.resolve();
  }
}

export class InMemoryMatchingRepository implements MatchingRepository {
  readonly likes: LikeRecord[] = [];
  readonly matches: MatchRecord[] = [];
  readonly blocks: Array<{ blockerId: string; blockedId: string }> = [];
  private counter = 0;

  findLike(senderId: string, receiverId: string): Promise<LikeRecord | null> {
    return Promise.resolve(
      this.likes.find((like) => like.senderId === senderId && like.receiverId === receiverId) ??
        null,
    );
  }

  findMatchBetween(userAId: string, userBId: string): Promise<MatchRecord | null> {
    const [a, b] = [userAId, userBId].sort();
    return Promise.resolve(
      this.matches.find((match) => match.userAId === a && match.userBId === b) ?? null,
    );
  }

  findMatchById(matchId: string): Promise<MatchRecord | null> {
    return Promise.resolve(this.matches.find((match) => match.id === matchId) ?? null);
  }

  createLikeAndMatchIfReciprocal(input: {
    senderId: string;
    receiverId: string;
    type: 'INTEREST' | 'PASS';
    score: number | null;
    now: Date;
  }): Promise<{ like: LikeRecord; match: MatchRecord | null }> {
    const like: LikeRecord = {
      id: `like-${++this.counter}`,
      senderId: input.senderId,
      receiverId: input.receiverId,
      type: input.type,
      createdAt: input.now,
    };
    this.likes.push(like);

    if (input.type !== 'INTEREST') return Promise.resolve({ like, match: null });

    const reciproque = this.likes.find(
      (autre) =>
        autre.senderId === input.receiverId &&
        autre.receiverId === input.senderId &&
        autre.type === 'INTEREST',
    );
    if (reciproque === undefined) return Promise.resolve({ like, match: null });

    // Convention userAId < userBId : l'unicité du couple ne dépend pas de qui a
    // envoyé son intérêt en premier.
    const [userAId, userBId] = [input.senderId, input.receiverId].sort() as [string, string];
    const match: MatchRecord = {
      id: `match-${++this.counter}`,
      userAId,
      userBId,
      status: 'ACTIVE',
      score: input.score,
      conversationId: null,
      matchedAt: input.now,
    };
    this.matches.push(match);

    return Promise.resolve({ like, match });
  }

  revokeLike(senderId: string, receiverId: string): Promise<void> {
    const index = this.likes.findIndex(
      (like) => like.senderId === senderId && like.receiverId === receiverId,
    );
    if (index >= 0) this.likes.splice(index, 1);
    return Promise.resolve();
  }

  listLikesSent(userId: string, limit: number): Promise<LikeRecord[]> {
    return Promise.resolve(this.likes.filter((like) => like.senderId === userId).slice(0, limit));
  }

  listLikesReceived(userId: string, limit: number): Promise<LikeRecord[]> {
    return Promise.resolve(this.likes.filter((like) => like.receiverId === userId).slice(0, limit));
  }

  countLikesReceived(userId: string): Promise<number> {
    return Promise.resolve(
      this.likes.filter((like) => like.receiverId === userId && like.type === 'INTEREST').length,
    );
  }

  listMatches(userId: string, limit: number): Promise<MatchRecord[]> {
    return Promise.resolve(
      this.matches
        .filter((match) => match.userAId === userId || match.userBId === userId)
        .slice(0, limit),
    );
  }

  unmatch(matchId: string): Promise<void> {
    const index = this.matches.findIndex((match) => match.id === matchId);
    const match = this.matches[index];
    if (match) this.matches[index] = { ...match, status: 'UNMATCHED' };
    return Promise.resolve();
  }

  block(blockerId: string, blockedId: string): Promise<void> {
    this.blocks.push({ blockerId, blockedId });
    return Promise.resolve();
  }

  unblock(blockerId: string, blockedId: string): Promise<void> {
    const index = this.blocks.findIndex(
      (block) => block.blockerId === blockerId && block.blockedId === blockedId,
    );
    if (index >= 0) this.blocks.splice(index, 1);
    return Promise.resolve();
  }

  listBlocked(userId: string): Promise<string[]> {
    return Promise.resolve(
      this.blocks.filter((block) => block.blockerId === userId).map((block) => block.blockedId),
    );
  }

  isBlockedEitherWay(userAId: string, userBId: string): Promise<boolean> {
    return Promise.resolve(
      this.blocks.some(
        (block) =>
          (block.blockerId === userAId && block.blockedId === userBId) ||
          (block.blockerId === userBId && block.blockedId === userAId),
      ),
    );
  }
}

export class InMemoryConversationGateway implements ConversationGateway {
  readonly created: Array<{ matchId: string; memberIds: [string, string] }> = [];
  readonly lockedByUnmatch: string[] = [];
  readonly lockedByBlock: Array<[string, string]> = [];
  private counter = 0;

  createForMatch(matchId: string, memberIds: [string, string]): Promise<string> {
    this.created.push({ matchId, memberIds });
    return Promise.resolve(`conversation-${++this.counter}`);
  }

  lockForUnmatch(matchId: string): Promise<void> {
    this.lockedByUnmatch.push(matchId);
    return Promise.resolve();
  }

  lockForBlock(userAId: string, userBId: string): Promise<void> {
    this.lockedByBlock.push([userAId, userBId]);
    return Promise.resolve();
  }
}

export class InMemoryQuotaCounter implements QuotaCounter {
  readonly consumed = new Map<string, number>();
  private readonly resetsAt = new Date('2026-08-07T00:00:00.000Z');

  consume(
    key: string,
    limit: number,
  ): Promise<{ allowed: boolean; remaining: number; resetsAt: Date }> {
    const utilise = this.consumed.get(key) ?? 0;
    if (utilise >= limit) {
      return Promise.resolve({ allowed: false, remaining: 0, resetsAt: this.resetsAt });
    }
    this.consumed.set(key, utilise + 1);
    return Promise.resolve({
      allowed: true,
      remaining: limit - utilise - 1,
      resetsAt: this.resetsAt,
    });
  }

  peek(key: string, limit: number): Promise<{ remaining: number; resetsAt: Date }> {
    const utilise = this.consumed.get(key) ?? 0;
    return Promise.resolve({ remaining: Math.max(0, limit - utilise), resetsAt: this.resetsAt });
  }

  /** Permet à un test de placer un quota déjà épuisé. */
  setConsumed(key: string, value: number): void {
    this.consumed.set(key, value);
  }
}
