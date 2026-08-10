import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { ClockProvider } from '../../../providers/ports';
import type {
  CandidateProfile,
  DiscoveryRepository,
  LikeRecord,
  MatchRecord,
  MatchingRepository,
  SeekerProfile,
} from '../application/ports';

/** Colonnes nécessaires au pré-filtre et au scoring, et rien de plus. */
const CANDIDATE_SELECT = {
  id: true,
  gender: true,
  birthDate: true,
  countryCode: true,
  accountStatus: true,
  verificationStatus: true,
  lastActiveAt: true,
  createdAt: true,
  profile: {
    select: {
      status: true,
      completionRate: true,
      cityId: true,
      relationship: true,
      hasChildren: true,
      primaryPhotoId: true,
      city: { select: { region: true, countryCode: true } },
      interests: { select: { interestId: true, interest: { select: { category: true } } } },
    },
  },
  preference: {
    select: {
      seekingGender: true,
      minAge: true,
      maxAge: true,
      acceptedRelationshipStatuses: true,
      acceptsChildren: true,
      cities: { select: { cityId: true } },
    },
  },
} as const;

@Injectable()
export class PrismaDiscoveryRepository implements DiscoveryRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockProvider,
  ) {}

  async loadSeeker(userId: string): Promise<SeekerProfile | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: CANDIDATE_SELECT,
    });

    if (user === null || user.profile === null || user.preference === null) return null;

    const commun = this.toScoring(user);
    return {
      userId,
      age: commun.age,
      gender: user.gender ?? 'FEMALE',
      cityId: user.profile.cityId,
      countryCode: user.profile.city.countryCode,
      seekingGender: user.preference.seekingGender,
      preferenceMinAge: user.preference.minAge,
      preferenceMaxAge: user.preference.maxAge,
      preferenceCityIds: user.preference.cities.map((city) => city.cityId),
      sameCountryOnly: true,
      // Les droits Premium arrivent avec la tranche D7 : fermé plutôt qu'ouvert.
      isPremium: false,
      scoring: { userId, ...commun.scoring },
    };
  }

  /**
   * Pré-filtre en SQL indexé.
   *
   * C'est ce plafond — et non la taille de la base — qui borne le coût du scoring :
   * il garantit la tenue à x10 sans refonte (docs/04-algorithme-de-matching.md §1).
   */
  async findCandidates(seeker: SeekerProfile, maxCandidates: number): Promise<CandidateProfile[]> {
    const now = this.clock.now();
    const naissanceMax = new Date(now);
    naissanceMax.setUTCFullYear(now.getUTCFullYear() - seeker.preferenceMinAge);
    const naissanceMin = new Date(now);
    naissanceMin.setUTCFullYear(now.getUTCFullYear() - seeker.preferenceMaxAge - 1);

    const users = await this.prisma.user.findMany({
      where: {
        id: { not: seeker.userId },
        accountStatus: 'ACTIVE',
        verificationStatus: 'VERIFIED',
        birthDate: { gte: naissanceMin, lte: naissanceMax },
        ...(seeker.sameCountryOnly ? { countryCode: seeker.countryCode } : {}),
        profile: {
          status: 'ACTIVE',
          primaryPhotoId: { not: null },
          ...(seeker.preferenceCityIds.length > 0
            ? { cityId: { in: seeker.preferenceCityIds } }
            : {}),
        },
      },
      select: CANDIDATE_SELECT,
      orderBy: { lastActiveAt: 'desc' },
      take: maxCandidates,
    });

    return users
      .filter((user) => user.profile !== null && user.preference !== null)
      .map((user) => {
        const commun = this.toScoring(user);
        return {
          userId: user.id,
          age: commun.age,
          gender: user.gender ?? 'MALE',
          cityId: user.profile!.cityId,
          countryCode: user.profile!.city.countryCode,
          accountStatus: user.accountStatus,
          verificationStatus: user.verificationStatus,
          profileStatus: user.profile!.status,
          completionRate: user.profile!.completionRate,
          hasApprovedPhoto: user.profile!.primaryPhotoId !== null,
          seekingGender: user.preference!.seekingGender,
          preferenceMinAge: user.preference!.minAge,
          preferenceMaxAge: user.preference!.maxAge,
          scoring: { userId: user.id, ...commun.scoring },
        };
      });
  }

  async loadExclusions(userId: string): Promise<{
    blockedUserIds: string[];
    seenUserIds: string[];
    decidedUserIds: string[];
    matchedUserIds: string[];
  }> {
    const [blocks, views, likes, matches] = await Promise.all([
      this.prisma.block.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      }),
      this.prisma.profileView.findMany({ where: { viewerId: userId }, select: { viewedId: true } }),
      this.prisma.like.findMany({ where: { senderId: userId }, select: { receiverId: true } }),
      this.prisma.match.findMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
        select: { userAId: true, userBId: true },
      }),
    ]);

    return {
      // Le blocage vaut dans les deux sens : peu importe qui a bloqué qui.
      blockedUserIds: blocks.map((block) =>
        block.blockerId === userId ? block.blockedId : block.blockerId,
      ),
      seenUserIds: views.map((view) => view.viewedId),
      decidedUserIds: likes.map((like) => like.receiverId),
      matchedUserIds: matches.map((match) =>
        match.userAId === userId ? match.userBId : match.userAId,
      ),
    };
  }

  async recordView(
    viewerId: string,
    viewedId: string,
    score: number,
    source: string,
  ): Promise<void> {
    await this.prisma.profileView.upsert({
      where: { viewerId_viewedId: { viewerId, viewedId } },
      update: {},
      create: { viewerId, viewedId, score, source },
    });
  }

  private toScoring(user: {
    birthDate: Date | null;
    lastActiveAt: Date | null;
    createdAt: Date;
    profile: {
      completionRate: number;
      cityId: string;
      relationship: string | null;
      hasChildren: boolean | null;
      city: { region: string; countryCode: string };
      interests: Array<{ interestId: string; interest: { category: string } }>;
    } | null;
    preference: {
      minAge: number;
      maxAge: number;
      acceptedRelationshipStatuses: string[];
      acceptsChildren: boolean | null;
      cities: Array<{ cityId: string }>;
    } | null;
  }): { age: number; scoring: Omit<CandidateProfile['scoring'], 'userId'> } {
    const now = this.clock.now();
    const age =
      user.birthDate === null
        ? 0
        : Math.floor((now.getTime() - user.birthDate.getTime()) / 31_557_600_000);

    const joursInactif =
      user.lastActiveAt === null
        ? 999
        : Math.floor((now.getTime() - user.lastActiveAt.getTime()) / 86_400_000);

    const interets = user.profile?.interests ?? [];

    return {
      age,
      scoring: {
        age,
        cityId: user.profile?.cityId ?? '',
        regionCode: user.profile?.city.region ?? '',
        countryCode: user.profile?.city.countryCode ?? '',
        interestSlugs: interets
          .filter((item) => item.interest.category !== 'valeurs')
          .map((item) => item.interestId),
        valueSlugs: interets
          .filter((item) => item.interest.category === 'valeurs')
          .map((item) => item.interestId),
        relationshipStatus: user.profile?.relationship ?? null,
        hasChildren: user.profile?.hasChildren ?? null,
        completionRate: user.profile?.completionRate ?? 0,
        daysSinceActive: joursInactif,
        isNewProfile: now.getTime() - user.createdAt.getTime() < 7 * 86_400_000,
        // Boosts et impressions arrivent avec la tranche D7.
        boostMultiplier: 1,
        impressionsToday: 0,
        preference: {
          minAge: user.preference?.minAge ?? 18,
          maxAge: user.preference?.maxAge ?? 99,
          cityIds: user.preference?.cities.map((city) => city.cityId) ?? [],
          acceptedRelationshipStatuses: user.preference?.acceptedRelationshipStatuses ?? [],
          acceptsChildren: user.preference?.acceptsChildren ?? null,
        },
      },
    };
  }
}

@Injectable()
export class PrismaMatchingRepository implements MatchingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findLike(senderId: string, receiverId: string): Promise<LikeRecord | null> {
    const like = await this.prisma.like.findUnique({
      where: { senderId_receiverId: { senderId, receiverId } },
    });
    return like === null || like.revokedAt !== null ? null : this.toLike(like);
  }

  async findMatchBetween(userAId: string, userBId: string): Promise<MatchRecord | null> {
    const [a, b] = [userAId, userBId].sort() as [string, string];
    const match = await this.prisma.match.findUnique({
      where: { userAId_userBId: { userAId: a, userBId: b } },
      include: { conversation: { select: { id: true } } },
    });
    return match === null ? null : this.toMatch(match);
  }

  async findMatchById(matchId: string): Promise<MatchRecord | null> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { conversation: { select: { id: true } } },
    });
    return match === null ? null : this.toMatch(match);
  }

  /**
   * Création de l'intérêt et, le cas échéant, du match — dans UNE transaction.
   * Un échec à mi-chemin ne doit jamais laisser un intérêt réciproque sans match.
   */
  async createLikeAndMatchIfReciprocal(input: {
    senderId: string;
    receiverId: string;
    type: 'INTEREST' | 'PASS';
    score: number | null;
    now: Date;
  }): Promise<{ like: LikeRecord; match: MatchRecord | null }> {
    return this.prisma.$transaction(async (tx) => {
      const like = await tx.like.create({
        data: {
          senderId: input.senderId,
          receiverId: input.receiverId,
          type: input.type,
          createdAt: input.now,
        },
      });

      if (input.type !== 'INTEREST') return { like: this.toLike(like), match: null };

      const reciproque = await tx.like.findUnique({
        where: {
          senderId_receiverId: { senderId: input.receiverId, receiverId: input.senderId },
        },
      });

      if (reciproque === null || reciproque.type !== 'INTEREST' || reciproque.revokedAt !== null) {
        return { like: this.toLike(like), match: null };
      }

      // Convention userAId < userBId : l'unicité du couple ne dépend pas de l'ordre
      // dans lequel les intérêts ont été envoyés.
      const [userAId, userBId] = [input.senderId, input.receiverId].sort() as [string, string];
      const match = await tx.match.create({
        data: { userAId, userBId, status: 'ACTIVE', score: input.score, matchedAt: input.now },
      });

      return { like: this.toLike(like), match: this.toMatch({ ...match, conversation: null }) };
    });
  }

  async revokeLike(senderId: string, receiverId: string, at: Date): Promise<void> {
    await this.prisma.like.update({
      where: { senderId_receiverId: { senderId, receiverId } },
      data: { revokedAt: at },
    });
  }

  async listLikesSent(userId: string, limit: number): Promise<LikeRecord[]> {
    const likes = await this.prisma.like.findMany({
      where: { senderId: userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return likes.map((like) => this.toLike(like));
  }

  async listLikesReceived(userId: string, limit: number): Promise<LikeRecord[]> {
    const likes = await this.prisma.like.findMany({
      where: { receiverId: userId, type: 'INTEREST', revokedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return likes.map((like) => this.toLike(like));
  }

  countLikesReceived(userId: string): Promise<number> {
    return this.prisma.like.count({
      where: { receiverId: userId, type: 'INTEREST', revokedAt: null },
    });
  }

  async listMatches(userId: string, limit: number): Promise<MatchRecord[]> {
    const matches = await this.prisma.match.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: { conversation: { select: { id: true } } },
      orderBy: { matchedAt: 'desc' },
      take: limit,
    });
    return matches.map((match) => this.toMatch(match));
  }

  async unmatch(matchId: string, byUserId: string, at: Date, reason: string): Promise<void> {
    // Jamais de suppression : un match annulé reste traçable pour la modération.
    await this.prisma.match.update({
      where: { id: matchId },
      data: {
        status: 'UNMATCHED',
        unmatchedAt: at,
        unmatchedById: byUserId,
        unmatchedReason: reason,
      },
    });
  }

  async block(
    blockerId: string,
    blockedId: string,
    reason: string | null,
    at: Date,
  ): Promise<void> {
    await this.prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      update: {},
      create: { blockerId, blockedId, reason, createdAt: at },
    });
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.prisma.block.deleteMany({ where: { blockerId, blockedId } });
  }

  async listBlocked(userId: string): Promise<string[]> {
    const blocks = await this.prisma.block.findMany({
      where: { blockerId: userId },
      select: { blockedId: true },
    });
    return blocks.map((block) => block.blockedId);
  }

  async isBlockedEitherWay(userAId: string, userBId: string): Promise<boolean> {
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userAId, blockedId: userBId },
          { blockerId: userBId, blockedId: userAId },
        ],
      },
      select: { id: true },
    });
    return block !== null;
  }

  private toLike(like: {
    id: string;
    senderId: string;
    receiverId: string;
    type: string;
    createdAt: Date;
  }): LikeRecord {
    return {
      id: like.id,
      senderId: like.senderId,
      receiverId: like.receiverId,
      type: like.type as 'INTEREST' | 'PASS',
      createdAt: like.createdAt,
    };
  }

  private toMatch(match: {
    id: string;
    userAId: string;
    userBId: string;
    status: string;
    score: number | null;
    matchedAt: Date;
    conversation: { id: string } | null;
  }): MatchRecord {
    return {
      id: match.id,
      userAId: match.userAId,
      userBId: match.userBId,
      status: match.status as MatchRecord['status'],
      score: match.score,
      conversationId: match.conversation?.id ?? null,
      matchedAt: match.matchedAt,
    };
  }
}
