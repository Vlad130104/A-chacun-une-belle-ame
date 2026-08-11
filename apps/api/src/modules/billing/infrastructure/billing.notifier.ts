import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { formatAmount } from '../domain/payment-policy';
import type { BillingNotifier } from '../application/ports';

/**
 * Notifications de facturation.
 *
 * Comme en D6 : la notification **in-app est réellement écrite en base**, aucun
 * push ni e-mail n'est envoyé — la file multi-canal est la tranche D8. L'écart
 * est consigné dans docs/MOCKS.md.
 *
 * Aucun montant ne figure dans le corps des messages : un membre qui consulte
 * son téléphone en public n'a pas à exposer ce qu'il paie. Le montant reste dans
 * l'historique des paiements, derrière authentification.
 */
@Injectable()
export class PrismaBillingNotifier implements BillingNotifier {
  constructor(private readonly prisma: PrismaService) {}

  async subscriptionRenewed(userId: string, periodEnd: Date, now: Date): Promise<void> {
    await this.write({
      userId,
      type: 'SUBSCRIPTION_RENEWED',
      title: 'Abonnement actif',
      body: `Votre abonnement est actif jusqu’au ${jour(periodEnd)}.`,
      dedupeKey: `sub-renewed:${periodEnd.toISOString()}`,
      now,
    });
  }

  async paymentFailed(userId: string, gracePeriodEnd: Date, now: Date): Promise<void> {
    await this.write({
      userId,
      type: 'SUBSCRIPTION_FAILED',
      title: 'Paiement non abouti',
      body:
        `Votre paiement n’a pas abouti. Vos avantages restent actifs jusqu’au ` +
        `${jour(gracePeriodEnd)}, le temps de régulariser.`,
      dedupeKey: `sub-failed:${gracePeriodEnd.toISOString()}`,
      now,
    });
  }

  async subscriptionExpiring(userId: string, periodEnd: Date, now: Date): Promise<void> {
    await this.write({
      userId,
      type: 'SUBSCRIPTION_EXPIRING',
      title: 'Abonnement bientôt terminé',
      body: `Votre abonnement prend fin le ${jour(periodEnd)}.`,
      dedupeKey: `sub-expiring:${periodEnd.toISOString()}`,
      now,
    });
  }

  private async write(input: {
    userId: string;
    type: 'SUBSCRIPTION_RENEWED' | 'SUBSCRIPTION_FAILED' | 'SUBSCRIPTION_EXPIRING';
    title: string;
    body: string;
    dedupeKey: string;
    now: Date;
  }): Promise<void> {
    // `dedupeKey` porte la période concernée : rejouer un webhook n'écrit pas
    // une seconde notification au membre.
    await this.prisma.notification.upsert({
      where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } },
      create: {
        userId: input.userId,
        type: input.type,
        channel: 'IN_APP',
        title: input.title,
        body: input.body,
        dedupeKey: input.dedupeKey,
        createdAt: input.now,
      },
      update: {},
    });
  }
}

function jour(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Réexporté pour les vues d'administration qui affichent un montant formaté. */
export { formatAmount };
