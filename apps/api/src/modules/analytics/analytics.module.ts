import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CLOCK_PROVIDER, type ClockProvider } from '../../providers/ports';
import {
  ANALYTICS_REPOSITORY,
  ANALYTICS_TRACKER,
  CAMPAIGN_REPOSITORY,
  INVITE_RESOLVER,
  type AnalyticsRepository,
  type CampaignRepository,
} from './application/ports';
import {
  GetFunnelUseCase,
  GetKeyIndicatorsUseCase,
  ListCampaignsUseCase,
  MyReferralUseCase,
  ResolveInviteForSignupUseCase,
  ResolveInviteUseCase,
  SafeAnalyticsTracker,
  TrackEventUseCase,
} from './application/analytics.use-cases';
import {
  AdminAnalyticsController,
  InviteController,
  ReferralController,
} from './infrastructure/analytics.controller';
import {
  PrismaAnalyticsRepository,
  PrismaCampaignRepository,
} from './infrastructure/prisma.repositories';

const journal = new Logger('Analytics');

/**
 * Module analytique et migration WhatsApp (tranche D10).
 *
 * Propriétaire des tables `AnalyticsEvent`, `Campaign` et `ReferralInvite`.
 *
 * Il **publie** deux ports — `ANALYTICS_TRACKER` et `INVITE_RESOLVER` —
 * consommés par `auth`, `verification` et `profiles`. Le sens des dépendances
 * est à noter : ce module ne connaît aucun autre module de domaine. Il ne peut
 * donc pas créer de cycle, et les trois modules qui l'utilisent peuvent
 * fonctionner sans lui si un jour on le retire.
 *
 * Aucune route d'ingestion d'événement n'existe, et c'est délibéré : le tunnel
 * est alimenté exclusivement côté serveur, aux moments où l'étape est
 * réellement franchie. Une route publique d'écriture d'événements serait à la
 * fois une surface d'abus (bourrage de statistiques) et une source de mesures
 * fausses, puisque le client peut mentir.
 */
@Module({
  controllers: [InviteController, ReferralController, AdminAnalyticsController],
  providers: [
    {
      provide: ANALYTICS_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaAnalyticsRepository(prisma),
    },
    {
      provide: CAMPAIGN_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaCampaignRepository(prisma),
    },

    {
      provide: TrackEventUseCase,
      inject: [ANALYTICS_REPOSITORY, CLOCK_PROVIDER, ConfigService],
      useFactory: (
        analytics: AnalyticsRepository,
        clock: ClockProvider,
        config: ConfigService<Env, true>,
      ) =>
        new TrackEventUseCase(analytics, clock, {
          hmacSecret: config.get('ANALYTICS_HMAC_SECRET', { infer: true }),
          retentionMonths: config.get('ANALYTICS_RETENTION_MONTHS', { infer: true }),
        }),
    },
    {
      provide: ANALYTICS_TRACKER,
      inject: [TrackEventUseCase],
      useFactory: (trackEvent: TrackEventUseCase) =>
        new SafeAnalyticsTracker(trackEvent, (name, erreur) => {
          // Journalisé au niveau `warn` : c'est une mesure perdue, pas un
          // incident de service. Le nom de l'événement suffit au diagnostic ;
          // les propriétés ne sont pas journalisées.
          journal.warn(
            `événement « ${name} » non enregistré : ${
              erreur instanceof Error ? erreur.message : 'cause inconnue'
            }`,
          );
        }),
    },
    {
      provide: INVITE_RESOLVER,
      inject: [CAMPAIGN_REPOSITORY, CLOCK_PROVIDER],
      useFactory: (campaigns: CampaignRepository, clock: ClockProvider) =>
        new ResolveInviteForSignupUseCase(campaigns, clock),
    },

    {
      provide: ResolveInviteUseCase,
      inject: [CAMPAIGN_REPOSITORY, TrackEventUseCase, CLOCK_PROVIDER],
      useFactory: (campaigns: CampaignRepository, track: TrackEventUseCase, clock: ClockProvider) =>
        new ResolveInviteUseCase(campaigns, track, clock),
    },
    // `ConsumeInviteUseCase` n'est volontairement PAS enregistré ici.
    //
    // Il est écrit et couvert par des tests, mais rien ne l'appelle encore :
    // consommer le quota et accorder l'offre suppose de connaître l'empreinte de
    // la pièce d'identité, donc d'attendre la vérification. L'enregistrer
    // maintenant laisserait croire que l'offre de lancement fonctionne.
    // TODO(D10-08) : accorder l'abonnement promotionnel à l'approbation KYC.
    {
      provide: GetFunnelUseCase,
      inject: [ANALYTICS_REPOSITORY, CLOCK_PROVIDER],
      useFactory: (analytics: AnalyticsRepository, clock: ClockProvider) =>
        new GetFunnelUseCase(analytics, clock),
    },
    {
      provide: GetKeyIndicatorsUseCase,
      inject: [ANALYTICS_REPOSITORY, CLOCK_PROVIDER],
      useFactory: (analytics: AnalyticsRepository, clock: ClockProvider) =>
        new GetKeyIndicatorsUseCase(analytics, clock),
    },
    {
      provide: ListCampaignsUseCase,
      inject: [CAMPAIGN_REPOSITORY],
      useFactory: (campaigns: CampaignRepository) => new ListCampaignsUseCase(campaigns),
    },
    {
      provide: MyReferralUseCase,
      inject: [CAMPAIGN_REPOSITORY, CLOCK_PROVIDER],
      useFactory: (campaigns: CampaignRepository, clock: ClockProvider) =>
        new MyReferralUseCase(campaigns, clock),
    },
  ],
  exports: [ANALYTICS_TRACKER, INVITE_RESOLVER],
})
export class AnalyticsModule {}
