import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, Public } from '../../../common/auth/auth.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../../common/auth/auth.guard';
import {
  GetFunnelUseCase,
  GetKeyIndicatorsUseCase,
  ListCampaignsUseCase,
  MyReferralUseCase,
  ResolveInviteUseCase,
} from '../application/analytics.use-cases';

const entier = (valeur: string | undefined, defaut: number, max: number): number =>
  Math.min(Math.max(Number(valeur ?? defaut) || defaut, 1), max);

/**
 * Ouverture d'un lien d'invitation (story D10-01).
 *
 * Seule route publique de la tranche, et la plus scrutée : elle est appelée
 * depuis WhatsApp, avant toute inscription, par des gens qui ne sont pas encore
 * membres.
 *
 * Trois choses qu'elle ne fait PAS, et qui sont le cœur de sa conception :
 *
 *  - elle ne dit pas **qui** a émis le code. Un code circule par capture
 *    d'écran ; révéler l'invitant exposerait cette personne à des inconnus ;
 *  - elle ne dit pas **pourquoi** un code est refusé. Inexistant, expiré,
 *    révoqué ou saturé rendent la même réponse : sinon, essayer des codes au
 *    hasard permettrait de cartographier les campagnes en cours ;
 *  - elle ne crée **aucun** compte. Les 9 000 personnes du groupe WhatsApp ne
 *    sont pas une base à transférer : chacune s'inscrit et consent elle-même.
 */
@ApiTags('invitations')
@Controller('invites')
export class InviteController {
  constructor(private readonly resolve: ResolveInviteUseCase) {}

  @Public()
  @Get(':code')
  @ApiOperation({ summary: 'Vérifier un code d’invitation — ne révèle jamais qui l’a émis' })
  async getInvite(@Param('code') code: string): Promise<unknown> {
    return this.resolve.execute(code);
  }
}

/**
 * Code de parrainage personnel (story D10-07).
 *
 * Niveau `auth` et non `verified` : partager un lien n'est pas une fonction du
 * produit réservée aux comptes vérifiés, et un membre en cours d'onboarding qui
 * fait venir quelqu'un rend service à la communauté.
 *
 * Ce que la route rend est un COMPTE, jamais une identité : un parrain apprend
 * combien de personnes se sont inscrites par son lien, jamais lesquelles. Le
 * parrainage ne crée aucun droit de regard sur les filleuls.
 */
@ApiTags('invitations')
@Controller('referral')
export class ReferralController {
  constructor(private readonly referral: MyReferralUseCase) {}

  @Auth({ rateLimit: 'referral.me' })
  @Get('me')
  @ApiOperation({ summary: 'Mon code de parrainage et ses compteurs agrégés' })
  async getMine(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.referral.execute(user.id);
  }
}

/**
 * Analytique d'administration (stories D10-04 et D10-06).
 *
 * Toutes les réponses sont des AGRÉGATS. Aucune route ne rend d'événement
 * unitaire, aucune ne rend d'identifiant de membre : il n'existe donc pas de
 * chemin par lequel le back-office pourrait reconstituer le parcours d'une
 * personne nommée depuis l'analytique.
 *
 * `analytics.read` est déjà la permission du tableau de bord : la lecture
 * agrégée forme un seul et même droit.
 */
@ApiTags('admin')
@Controller('admin')
export class AdminAnalyticsController {
  constructor(
    private readonly funnel: GetFunnelUseCase,
    private readonly indicators: GetKeyIndicatorsUseCase,
    private readonly campaigns: ListCampaignsUseCase,
  ) {}

  @Auth({ permissions: ['analytics.read'] })
  @Get('analytics/funnel')
  @ApiOperation({ summary: 'Tunnel de migration — comptes en sujets distincts et taux' })
  async getFunnel(
    @Query('campaignCode') campaignCode?: string,
    @Query('days') days?: string,
  ): Promise<unknown> {
    return this.funnel.execute({
      ...(campaignCode === undefined ? {} : { campaignCode }),
      days: entier(days, 30, 365),
    });
  }

  @Auth({ permissions: ['analytics.read'] })
  @Get('analytics/indicators')
  @ApiOperation({ summary: 'Les indicateurs clés du cahier des charges — agrégats uniquement' })
  async getIndicators(): Promise<unknown> {
    return this.indicators.execute();
  }

  @Auth({ permissions: ['analytics.read'] })
  @Get('campaigns')
  @ApiOperation({ summary: 'Campagnes de migration et leur volume de clics' })
  async getCampaigns(@Query('limit') limit?: string): Promise<unknown> {
    return this.campaigns.execute(entier(limit, 20, 100));
  }
}
