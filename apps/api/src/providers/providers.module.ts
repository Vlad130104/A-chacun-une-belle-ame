import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { listSimulatedProviders } from '../config/env.schema';
import { ConsoleSmsProvider } from './console-sms.provider';
import { SystemClock } from './system-clock.provider';
import { CLOCK_PROVIDER, SMS_PROVIDER, type SmsProvider } from './ports';

/**
 * Sélection des implémentations de ports.
 *
 * C'est le SEUL endroit du code où le nom d'un fournisseur apparaît. Remplacer une
 * implémentation simulée par une implémentation réelle ne touche ni `domain/` ni
 * `application/`.
 *
 * Les implémentations réelles seront ajoutées ici au fur et à mesure des contrats
 * signés (voir docs/MOCKS.md et questions Q2, Q3, Q4).
 */
@Global()
@Module({
  providers: [
    ConsoleSmsProvider,
    SystemClock,
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService, ConsoleSmsProvider],
      useFactory: (
        config: ConfigService<Env, true>,
        consoleSms: ConsoleSmsProvider,
      ): SmsProvider => {
        const selected = config.get('SMS_PROVIDER', { infer: true });
        switch (selected) {
          case 'console':
            return consoleSms;
          case 'live':
            // Aucun prestataire n'est contractualisé : ne pas inventer d'intégration.
            throw new Error(
              "SMS_PROVIDER=live demandé mais aucune implémentation réelle n'existe encore. " +
                'Voir docs/MOCKS.md et la question Q4 du cadrage.',
            );
        }
      },
    },
    { provide: CLOCK_PROVIDER, useExisting: SystemClock },
  ],
  exports: [SMS_PROVIDER, CLOCK_PROVIDER],
})
export class ProvidersModule {
  private readonly logger = new Logger(ProvidersModule.name);

  constructor(private readonly config: ConfigService<Env, true>) {
    const simulated = listSimulatedProviders({
      SMS_PROVIDER: this.config.get('SMS_PROVIDER', { infer: true }),
      KYC_PROVIDER: this.config.get('KYC_PROVIDER', { infer: true }),
      PAYMENT_PROVIDER: this.config.get('PAYMENT_PROVIDER', { infer: true }),
      PUSH_PROVIDER: this.config.get('PUSH_PROVIDER', { infer: true }),
      CONTENT_MODERATION_PROVIDER: this.config.get('CONTENT_MODERATION_PROVIDER', {
        infer: true,
      }),
    } as Env);

    if (simulated.length > 0) {
      this.logger.warn(
        `Intégrations encore SIMULÉES : ${simulated.join(', ')}. ` +
          'Aucune de ces intégrations ne doit être présentée comme fonctionnelle (docs/MOCKS.md).',
      );
    }
  }
}
