import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { FUNNEL_STEPS, type FunnelCounts, type FunnelStep } from '../domain/campaign-policy';
import type {
  AnalyticsRepository,
  CampaignRecord,
  CampaignRepository,
  InviteRecord,
} from '../application/ports';

const JOUR_MS = 86_400_000;

@Injectable()
export class PrismaAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: Parameters<AnalyticsRepository['record']>[0]): Promise<void> {
    await this.prisma.analyticsEvent.create({
      data: {
        subjectHash: input.subjectHash,
        userId: input.userId,
        name: input.name,
        campaignCode: input.campaignCode,
        properties: input.properties,
        occurredAt: input.occurredAt,
        purgeAt: input.purgeAt,
      },
    });
  }

  /**
   * Comptages du tunnel — en **sujets distincts**, pas en événements.
   *
   * Un membre qui ouvre trois fois le lien ne compte qu'une fois : sinon le
   * taux de conversion dépendrait du nombre de clics et ne voudrait plus rien
   * dire.
   */
  async funnelCounts(input: { campaignCode?: string; since: Date }): Promise<FunnelCounts[]> {
    const groupes = await this.prisma.analyticsEvent.groupBy({
      by: ['name'],
      where: {
        name: { in: [...FUNNEL_STEPS] },
        occurredAt: { gte: input.since },
        ...(input.campaignCode === undefined ? {} : { campaignCode: input.campaignCode }),
      },
      _count: { subjectHash: true },
    });

    return groupes.map((groupe) => ({
      step: groupe.name as FunnelStep,
      count: groupe._count.subjectHash,
    }));
  }

  /**
   * Les 13 indicateurs du cahier des charges (story D10-06).
   *
   * Tous agrégés, aucun nominatif. Les taux sont rendus en pourcentages entiers :
   * une décimale sur un taux d'activation laisse croire à une précision que la
   * volumétrie ne justifie pas.
   */
  async keyIndicators(now: Date): Promise<Record<string, number>> {
    const ilYA7j = new Date(now.getTime() - 7 * JOUR_MS);
    const ilYA30j = new Date(now.getTime() - 30 * JOUR_MS);

    const [
      inscrits,
      verifies,
      profilsPublies,
      actifs7j,
      matchs30j,
      conversations30j,
      messages30j,
      signalements30j,
      casResolus30j,
      abonnes,
      paiements30j,
      boosts30j,
      suppressions30j,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { verificationStatus: 'VERIFIED' } }),
      this.prisma.profile.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { lastActiveAt: { gte: ilYA7j } } }),
      this.prisma.match.count({ where: { matchedAt: { gte: ilYA30j } } }),
      this.prisma.conversation.count({ where: { lastMessageAt: { gte: ilYA30j } } }),
      this.prisma.message.count({ where: { createdAt: { gte: ilYA30j } } }),
      this.prisma.report.count({ where: { createdAt: { gte: ilYA30j } } }),
      this.prisma.moderationCase.count({ where: { resolvedAt: { gte: ilYA30j } } }),
      this.prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      this.prisma.payment.count({ where: { status: 'SUCCEEDED', paidAt: { gte: ilYA30j } } }),
      this.prisma.boost.count({ where: { startsAt: { gte: ilYA30j } } }),
      this.prisma.accountDeletionRequest.count({ where: { requestedAt: { gte: ilYA30j } } }),
    ]);

    const pourcentage = (part: number, total: number): number =>
      total === 0 ? 0 : Math.round((part / total) * 100);

    return {
      inscrits,
      tauxVerification: pourcentage(verifies, inscrits),
      tauxProfilPublie: pourcentage(profilsPublies, verifies),
      actifs7Jours: actifs7j,
      tauxActivite7Jours: pourcentage(actifs7j, inscrits),
      matchs30Jours: matchs30j,
      conversations30Jours: conversations30j,
      messages30Jours: messages30j,
      signalements30Jours: signalements30j,
      casResolus30Jours: casResolus30j,
      abonnesActifs: abonnes,
      paiementsAboutis30Jours: paiements30j,
      boosts30Jours: boosts30j,
      suppressionsDemandees30Jours: suppressions30j,
    };
  }
}

const INVITE_SELECT = {
  id: true,
  code: true,
  campaignId: true,
  inviterId: true,
  maxUses: true,
  useCount: true,
  expiresAt: true,
  revokedAt: true,
} as const;

@Injectable()
export class PrismaCampaignRepository implements CampaignRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findInviteByCode(code: string): Promise<InviteRecord | null> {
    return this.prisma.referralInvite.findUnique({
      where: { code },
      select: INVITE_SELECT,
    });
  }

  async findCampaignById(campaignId: string): Promise<CampaignRecord | null> {
    return this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        code: true,
        name: true,
        source: true,
        promoPlanCode: true,
        promoFreeDays: true,
        active: true,
        startsAt: true,
        endsAt: true,
      },
    });
  }

  async countClick(inviteId: string): Promise<void> {
    await this.prisma.referralInvite.update({
      where: { id: inviteId },
      data: { clickCount: { increment: 1 } },
    });
  }

  /**
   * Consommation conditionnelle — le point critique de la story D10-03.
   *
   * `updateMany` filtré sur `useCount < maxUses` fait porter l'arbitrage à la
   * base : deux inscriptions simultanées ne peuvent pas dépasser le quota,
   * quelle que soit leur concurrence. Une lecture suivie d'une écriture
   * laisserait une fenêtre entre les deux.
   */
  async consumeUse(inviteId: string): Promise<boolean> {
    const resultat = await this.prisma.$executeRaw`
      UPDATE app."ReferralInvite"
         SET "useCount" = "useCount" + 1
       WHERE id = ${inviteId}
         AND "useCount" < "maxUses"
         AND "revokedAt" IS NULL
    `;

    return resultat > 0;
  }

  /**
   * Le bénéfice a-t-il déjà été accordé à ce numéro ou à cette pièce ?
   *
   * Les deux contrôles sont faits sur des EMPREINTES : ni le numéro ni le
   * numéro de pièce n'existent en clair dans la requête (ADR-013, ADR-021).
   */
  async promoAlreadyGranted(input: {
    phoneHash: string;
    documentNumberHash: string | null;
  }): Promise<{ byPhone: boolean; byDocument: boolean }> {
    const [parNumero, parPiece] = await Promise.all([
      this.prisma.subscription.count({
        where: { isPromotional: true, user: { phoneHash: input.phoneHash } },
      }),
      input.documentNumberHash === null
        ? Promise.resolve(0)
        : this.prisma.subscription.count({
            where: {
              isPromotional: true,
              user: {
                verificationRequests: {
                  some: { documentNumberHash: input.documentNumberHash, status: 'VERIFIED' },
                },
              },
            },
          }),
    ]);

    return { byPhone: parNumero > 0, byDocument: parPiece > 0 };
  }

  async listCampaigns(limit: number): Promise<(CampaignRecord & { clickCount: number })[]> {
    return this.prisma.campaign.findMany({
      orderBy: { startsAt: 'desc' },
      take: limit,
      select: {
        id: true,
        code: true,
        name: true,
        source: true,
        promoPlanCode: true,
        promoFreeDays: true,
        active: true,
        startsAt: true,
        endsAt: true,
        clickCount: true,
      },
    });
  }

  /**
   * Code de parrainage personnel, créé au premier usage.
   *
   * Le code est tiré au hasard sur 8 caractères sans ambiguïté visuelle : il
   * sera lu à voix haute et recopié à la main. Ni `O` ni `0`, ni `I` ni `1`.
   */
  async ensurePersonalInvite(userId: string, now: Date): Promise<InviteRecord> {
    const existant = await this.prisma.referralInvite.findFirst({
      where: { inviterId: userId, revokedAt: null },
      select: INVITE_SELECT,
    });

    if (existant !== null) return existant;

    return this.prisma.referralInvite.create({
      data: {
        code: codeLisible(),
        inviterId: userId,
        maxUses: 100,
        createdAt: now,
      },
      select: INVITE_SELECT,
    });
  }

  async referralStats(userId: string): Promise<{ clicks: number; signups: number }> {
    const invitation = await this.prisma.referralInvite.findFirst({
      where: { inviterId: userId, revokedAt: null },
      select: { clickCount: true, useCount: true },
    });

    return { clicks: invitation?.clickCount ?? 0, signups: invitation?.useCount ?? 0 };
  }
}

/** Alphabet sans ambiguïté visuelle : un code se lit au téléphone et se recopie. */
const ALPHABET_LISIBLE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function codeLisible(longueur = 8): string {
  const octets = randomBytes(longueur);
  let code = '';
  for (const octet of octets) code += ALPHABET_LISIBLE[octet % ALPHABET_LISIBLE.length];
  return code;
}
