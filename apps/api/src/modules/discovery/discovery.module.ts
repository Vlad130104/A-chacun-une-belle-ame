import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CLOCK_PROVIDER, type ClockProvider } from '../../providers/ports';
import { ConversationsModule } from '../conversations/conversations.module';
import { DEFAULT_SCORING_CONFIG } from './domain/compatibility-score';
import {
  CONVERSATION_GATEWAY,
  DISCOVERY_REPOSITORY,
  MATCHING_REPOSITORY,
  QUOTA_COUNTER,
  type ConversationGateway,
  type DiscoveryRepository,
  type MatchingRepository,
  type QuotaCounter,
} from './application/ports';
import {
  BlockUserUseCase,
  GetSuggestionsUseCase,
  ListInterestsUseCase,
  RevokeLikeUseCase,
  SendLikeUseCase,
  UnblockUserUseCase,
  UnmatchUseCase,
  type DiscoveryConfig,
} from './application/discovery.use-cases';
import { DiscoveryController } from './infrastructure/discovery.controller';
import { RedisQuotaCounter } from './infrastructure/redis-quota.counter';
import {
  PrismaDiscoveryRepository,
  PrismaMatchingRepository,
} from './infrastructure/prisma.repositories';

/**
 * Les pondérations du score sont modifiables sans redéploiement via le feature flag
 * `matching.weights` ; leur somme est validée à chaque calcul
 * (docs/04-algorithme-de-matching.md §3.2).
 */
const buildConfig = (config: ConfigService<Env, true>): DiscoveryConfig => ({
  maxCandidates: config.get('MATCHING_MAX_CANDIDATES', { infer: true }),
  dailySuggestionLimitFree: config.get('DAILY_SUGGESTION_LIMIT_FREE', { infer: true }),
  dailySuggestionLimitPremium: config.get('DAILY_SUGGESTION_LIMIT_PREMIUM', { infer: true }),
  dailyLikeLimitFree: config.get('DAILY_LIKE_LIMIT_FREE', { infer: true }),
  dailyLikeLimitPremium: config.get('DAILY_LIKE_LIMIT_PREMIUM', { infer: true }),
  minimumAge: config.get('MINIMUM_AGE', { infer: true }),
  minimumCompletion: config.get('MIN_COMPLETION_TO_PUBLISH', { infer: true }),
  policy: config.get('MATCHING_POLICY', { infer: true }),
  scoring: DEFAULT_SCORING_CONFIG,
});

@Module({
  imports: [ConversationsModule],
  controllers: [DiscoveryController],
  providers: [
    RedisQuotaCounter,
    { provide: QUOTA_COUNTER, useExisting: RedisQuotaCounter },

    {
      provide: DISCOVERY_REPOSITORY,
      inject: [PrismaService, CLOCK_PROVIDER],
      useFactory: (prisma: PrismaService, clock: ClockProvider) =>
        new PrismaDiscoveryRepository(prisma, clock),
    },
    {
      provide: MATCHING_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaMatchingRepository(prisma),
    },

    {
      provide: GetSuggestionsUseCase,
      inject: [DISCOVERY_REPOSITORY, QUOTA_COUNTER, CLOCK_PROVIDER, ConfigService],
      useFactory: (
        discovery: DiscoveryRepository,
        quotas: QuotaCounter,
        clock: ClockProvider,
        config: ConfigService<Env, true>,
      ) => new GetSuggestionsUseCase(discovery, quotas, clock, buildConfig(config)),
    },
    {
      provide: SendLikeUseCase,
      inject: [
        DISCOVERY_REPOSITORY,
        MATCHING_REPOSITORY,
        CONVERSATION_GATEWAY,
        QUOTA_COUNTER,
        CLOCK_PROVIDER,
        ConfigService,
      ],
      useFactory: (
        discovery: DiscoveryRepository,
        matching: MatchingRepository,
        conversations: ConversationGateway,
        quotas: QuotaCounter,
        clock: ClockProvider,
        config: ConfigService<Env, true>,
      ) =>
        new SendLikeUseCase(discovery, matching, conversations, quotas, clock, buildConfig(config)),
    },
    {
      provide: RevokeLikeUseCase,
      inject: [MATCHING_REPOSITORY, CLOCK_PROVIDER],
      useFactory: (matching: MatchingRepository, clock: ClockProvider) =>
        new RevokeLikeUseCase(matching, clock),
    },
    {
      provide: ListInterestsUseCase,
      inject: [MATCHING_REPOSITORY],
      useFactory: (matching: MatchingRepository) => new ListInterestsUseCase(matching),
    },
    {
      provide: UnmatchUseCase,
      inject: [MATCHING_REPOSITORY, CONVERSATION_GATEWAY, CLOCK_PROVIDER],
      useFactory: (
        matching: MatchingRepository,
        conversations: ConversationGateway,
        clock: ClockProvider,
      ) => new UnmatchUseCase(matching, conversations, clock),
    },
    {
      provide: BlockUserUseCase,
      inject: [MATCHING_REPOSITORY, CONVERSATION_GATEWAY, CLOCK_PROVIDER],
      useFactory: (
        matching: MatchingRepository,
        conversations: ConversationGateway,
        clock: ClockProvider,
      ) => new BlockUserUseCase(matching, conversations, clock),
    },
    {
      provide: UnblockUserUseCase,
      inject: [MATCHING_REPOSITORY],
      useFactory: (matching: MatchingRepository) => new UnblockUserUseCase(matching),
    },
  ],
  exports: [MATCHING_REPOSITORY],
})
export class DiscoveryModule {}
