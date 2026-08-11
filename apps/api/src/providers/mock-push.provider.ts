import { Injectable, Logger } from '@nestjs/common';
import type { PushProvider } from './ports';

/**
 * Implémentation SIMULÉE des notifications push.
 *
 * Aucune notification n'atteint un téléphone : l'envoi est journalisé. Le repli
 * est réel et suffisant au MVP — la notification `IN_APP` est écrite en base et
 * visible dans le centre de notifications, quel que soit le sort du push.
 *
 * Le jeton n'apparaît jamais en clair dans les logs : c'est un identifiant
 * d'appareil, il permettrait d'envoyer des notifications à sa place.
 */
@Injectable()
export class MockPushProvider implements PushProvider {
  readonly name = 'MockPushProvider';
  readonly simulated = true;

  private readonly logger = new Logger(MockPushProvider.name);

  sendToDevice(pushToken: string, title: string): Promise<void> {
    this.logger.warn(`[MODE TEST — aucun push envoyé] « ${title} » vers ${maskToken(pushToken)}.`);
    return Promise.resolve();
  }
}

/** Un jeton push complet ne figure jamais dans un log (SECURITY.md §4.6). */
export function maskToken(pushToken: string): string {
  if (pushToken.length < 8) return '***';
  return `${pushToken.slice(0, 4)}…${pushToken.slice(-4)}`;
}
