import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { DetectionThresholds, BehaviourObservation } from '../domain/detection-rules';
import type { BehaviourSource } from '../application/ports';

/**
 * Agrégation des observations nécessaires aux 9 règles de détection.
 *
 * Ce fichier ne décide rien : il compte. Toute la logique de seuil vit dans
 * `detection-rules.ts`, en fonctions pures et testables. Ici, uniquement des
 * requêtes indexées, exécutées en parallèle, et jamais sur du texte de message —
 * les signaux de contenu ont déjà été calculés à l'envoi (tranche D5).
 */
@Injectable()
export class PrismaBehaviourSource implements BehaviourSource {
  constructor(
    private readonly prisma: PrismaService,
    private readonly thresholds: DetectionThresholds,
  ) {}

  async observe(userId: string, now: Date): Promise<BehaviourObservation> {
    const depuisArgent = new Date(
      now.getTime() - this.thresholds.moneyRequestWindowHours * 3_600_000,
    );
    const depuisComptes = new Date(
      now.getTime() - this.thresholds.accountCreationWindowDays * 86_400_000,
    );
    const depuisAppareils = new Date(
      now.getTime() - this.thresholds.deviceChangeWindowDays * 86_400_000,
    );
    const depuisSignalements = new Date(
      now.getTime() - this.thresholds.multipleReportsWindowDays * 86_400_000,
    );
    const debutDuJour = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    const [
      signauxArgent,
      signauxLiens,
      messagesRecents,
      appareils,
      likesDuJour,
      refusVerification,
      signalants,
      actionsRecentes,
    ] = await Promise.all([
      this.prisma.moderationSignal.count({
        where: { userId, type: 'REPEATED_MONEY_REQUEST', createdAt: { gte: depuisArgent } },
      }),
      this.prisma.moderationSignal.count({
        where: { userId, type: 'SUSPICIOUS_LINK', createdAt: { gte: depuisArgent } },
      }),
      this.prisma.message.findMany({
        where: { senderId: userId, createdAt: { gte: depuisArgent }, body: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { body: true },
      }),
      this.prisma.device.findMany({
        where: { userId, lastSeenAt: { gte: depuisAppareils } },
        select: { fingerprintHash: true },
      }),
      this.prisma.like.count({ where: { senderId: userId, createdAt: { gte: debutDuJour } } }),
      // « Refus » au sens de la règle : une vérification rejetée, ou une
      // vérification révoquée après coup. Un dossier encore en file n'est pas un
      // refus — le membre n'a rien refusé, il attend.
      this.prisma.verificationRequest.count({
        where: { userId, status: { in: ['REJECTED', 'SUSPENDED'] } },
      }),
      this.prisma.report.findMany({
        where: { reportedUserId: userId, createdAt: { gte: depuisSignalements } },
        select: { reporterId: true },
        distinct: ['reporterId'],
      }),
      this.prisma.like.findMany({
        where: { senderId: userId },
        orderBy: { createdAt: 'desc' },
        take: this.thresholds.automationSampleSize + 1,
        select: { createdAt: true },
      }),
    ]);

    const empreinte = appareils[0]?.fingerprintHash ?? null;
    const comptesMemeAppareil =
      empreinte === null
        ? 1
        : await this.prisma.device
            .findMany({
              where: { fingerprintHash: empreinte, createdAt: { gte: depuisComptes } },
              select: { userId: true },
              distinct: ['userId'],
            })
            .then((rows) => rows.length);

    return {
      userId,
      moneyRequestSignals: signauxArgent,
      moneyRequestWindowHours: this.thresholds.moneyRequestWindowHours,
      recentMessageCount: messagesRecents.length,
      duplicateMessageRatio: duplicateRatio(messagesRecents.map((message) => message.body ?? '')),
      accountsFromSameDevice: comptesMemeAppareil,
      accountCreationWindowDays: this.thresholds.accountCreationWindowDays,
      distinctDevicesUsed: new Set(appareils.map((appareil) => appareil.fingerprintHash)).size,
      deviceWindowDays: this.thresholds.deviceChangeWindowDays,
      likesToday: likesDuJour,
      platformMedianLikesPerDay: await this.platformMedianLikes(debutDuJour),
      verificationRefusals: refusVerification,
      distinctReportersRecently: signalants.length,
      reportWindowDays: this.thresholds.multipleReportsWindowDays,
      suspiciousLinkSignals: signauxLiens,
      actionIntervalsMs: intervals(actionsRecentes.map((action) => action.createdAt)),
    };
  }

  /**
   * Médiane des likes du jour sur la plateforme.
   *
   * Sert de référence à la règle « volume anormal » : comparer à une constante
   * signalerait tout le monde le jour où la plateforme devient plus active.
   */
  private async platformMedianLikes(since: Date): Promise<number> {
    const parMembre = await this.prisma.like.groupBy({
      by: ['senderId'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });

    if (parMembre.length === 0) return 0;

    const comptes = parMembre.map((ligne) => ligne._count._all).sort((a, b) => a - b);
    return comptes[Math.floor(comptes.length / 2)] ?? 0;
  }
}

/**
 * Proportion de quasi-doublons dans un lot de messages.
 *
 * Comparaison sur une forme normalisée plutôt que caractère à caractère :
 * remplacer un prénom dans un message copié-collé ne doit pas suffire à passer
 * sous le radar.
 */
export function duplicateRatio(bodies: string[]): number {
  if (bodies.length < 2) return 0;

  const empreintes = new Map<string, number>();
  for (const body of bodies) {
    const forme = body
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .slice(0, 120);
    empreintes.set(forme, (empreintes.get(forme) ?? 0) + 1);
  }

  const plusFrequent = Math.max(...empreintes.values());
  return plusFrequent / bodies.length;
}

/** Intervalles en millisecondes entre actions, du plus ancien au plus récent. */
export function intervals(dates: Date[]): number[] {
  const croissant = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const resultat: number[] = [];

  for (let index = 1; index < croissant.length; index += 1) {
    resultat.push(croissant[index]!.getTime() - croissant[index - 1]!.getTime());
  }

  return resultat;
}
