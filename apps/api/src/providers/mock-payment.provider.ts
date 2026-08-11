import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CheckoutInstruction, PaymentProvider } from './ports';

/**
 * Implémentation SIMULÉE du paiement.
 *
 * **Aucun argent ne circule.** Cette classe existe pour que tout le reste du
 * produit — plans, souscription, webhooks, reçus, remboursements — soit écrit,
 * testé et vérifiable avant qu'un contrat de prestataire soit signé. Le jour où
 * il l'est, on ajoute une classe à côté et on change une variable
 * d'environnement : rien dans `domain/` ni dans `application/` ne bouge.
 *
 * Trois garde-fous, délibérés :
 *
 *  1. **`testMode: true` dans chaque réponse.** L'interface l'affiche, et le
 *     client ne peut pas le retirer — c'est le serveur qui l'émet.
 *  2. **`verifyWebhookSignature` renvoie toujours `false`.** Aucune clé partagée
 *     n'existe, donc aucune signature ne peut être valide. Renvoyer `true` ferait
 *     croire qu'une vérification a lieu, ce qui serait la pire ligne du projet.
 *     Conséquence assumée : en mode simulé, **aucun webhook n'est traité** — le
 *     crédit d'abonnement passe par la route d'administration tracée.
 *  3. **Aucune référence de fournisseur inventée.** La référence produite porte
 *     le préfixe `mock_` : elle ne ressemble à aucun format réel et ne peut pas
 *     être confondue avec une vraie transaction dans un export comptable.
 *
 * Voir docs/MOCKS.md et la question Q3 du cadrage.
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'MockPaymentProvider';
  readonly simulated = true;

  private readonly logger = new Logger(MockPaymentProvider.name);

  createCheckout(input: {
    idempotencyKey: string;
    amountMinor: number;
    currency: string;
    methodType: 'MOBILE_MONEY' | 'CARD';
    msisdn?: string;
  }): Promise<CheckoutInstruction> {
    this.logger.warn(
      `[MODE TEST — aucun paiement réel] Intention de paiement ${input.amountMinor} ${input.currency} ` +
        `(${input.methodType}), clé ${input.idempotencyKey}.`,
    );

    return Promise.resolve({
      paymentId: input.idempotencyKey,
      providerPaymentRef: `mock_${randomUUID()}`,
      // `PENDING` et non `SUCCEEDED` : un paiement simulé ne se confirme pas tout
      // seul. Le confirmer d'office masquerait l'absence d'intégration réelle et
      // rendrait le parcours d'échec impossible à éprouver.
      status: 'PENDING',
      instruction: {
        testMode: true,
        message:
          'Mode test — aucun paiement réel n’est effectué. Le crédit doit être confirmé ' +
          'depuis le back-office tant qu’aucun prestataire n’est intégré.',
        methodType: input.methodType,
      },
    });
  }

  refund(providerPaymentRef: string, amountMinor: number): Promise<void> {
    this.logger.warn(
      `[MODE TEST — aucun remboursement réel] ${amountMinor} sur ${providerPaymentRef}.`,
    );
    return Promise.resolve();
  }

  /**
   * Toujours `false`, et ce n'est pas un oubli.
   *
   * Sans secret partagé avec un prestataire, il n'existe aucune signature
   * vérifiable. Renvoyer `true` reviendrait à déclarer authentique n'importe
   * quelle requête arrivant sur la route de webhook — c'est-à-dire à offrir un
   * crédit d'abonnement gratuit à qui connaît l'URL.
   */
  verifyWebhookSignature(): boolean {
    return false;
  }

  parseWebhook(rawBody: Buffer): { providerEventId: string; eventType: string } {
    // Analysé uniquement pour le journal : la signature ayant échoué en amont,
    // ce résultat n'est jamais utilisé pour créditer quoi que ce soit.
    try {
      const parsed: unknown = JSON.parse(rawBody.toString('utf8'));
      if (typeof parsed === 'object' && parsed !== null) {
        const source = parsed as Record<string, unknown>;
        return {
          providerEventId: typeof source.id === 'string' ? source.id : `mock_${randomUUID()}`,
          eventType: typeof source.type === 'string' ? source.type : 'unknown',
        };
      }
    } catch {
      // Corps illisible : on ne devine pas, on nomme l'événement comme tel.
    }

    return { providerEventId: `mock_${randomUUID()}`, eventType: 'unparseable' };
  }
}
