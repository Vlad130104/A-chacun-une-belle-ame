import { Injectable, Logger } from '@nestjs/common';
import type { SmsProvider } from './ports';

/**
 * Implémentation SIMULÉE de l'envoi de SMS.
 *
 * Aucun message n'est envoyé : le code est écrit dans les logs de développement.
 * Sans passerelle réelle, AUCUNE inscription n'est possible en production — c'est le
 * seul port dont l'absence bloque totalement l'ouverture (docs/MOCKS.md §2).
 */
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'ConsoleSmsProvider';
  readonly simulated = true;

  private readonly logger = new Logger(ConsoleSmsProvider.name);

  sendOtp(phoneE164: string, code: string): Promise<void> {
    this.logger.warn(`[MODE TEST — aucun SMS envoyé] OTP pour ${maskPhone(phoneE164)} : ${code}`);
    return Promise.resolve();
  }

  sendTransactional(phoneE164: string): Promise<void> {
    this.logger.warn(`[MODE TEST — aucun SMS envoyé] message à ${maskPhone(phoneE164)}`);
    return Promise.resolve();
  }
}

/** Un numéro complet n'apparaît jamais en clair dans les logs (SECURITY.md §4.6). */
export function maskPhone(phoneE164: string): string {
  if (phoneE164.length < 6) return '***';
  return `${phoneE164.slice(0, 4)}${'*'.repeat(phoneE164.length - 6)}${phoneE164.slice(-2)}`;
}
