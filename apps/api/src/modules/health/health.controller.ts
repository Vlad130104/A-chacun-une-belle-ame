import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, Public } from '../../common/auth/auth.decorator';
import { listSimulatedProviders, type Env } from '../../config/env.schema';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Le processus répond' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Les dépendances sont joignables' })
  ready(): { status: 'ok' } {
    // TODO(D1-01): brancher les vérifications PostgreSQL, Redis et stockage via Terminus.
    return { status: 'ok' };
  }

  /**
   * État RÉEL des intégrations — source de vérité de docs/MOCKS.md.
   * En cas de divergence avec la documentation, c'est cette route qui fait foi.
   */
  @Auth({ permissions: ['system.read'] })
  @Get('providers')
  @ApiOperation({ summary: 'État réel ou simulé de chaque intégration externe' })
  providers(): { providers: Array<{ port: string; simulated: boolean }> } {
    const env = {
      SMS_PROVIDER: this.config.get('SMS_PROVIDER', { infer: true }),
      KYC_PROVIDER: this.config.get('KYC_PROVIDER', { infer: true }),
      PAYMENT_PROVIDER: this.config.get('PAYMENT_PROVIDER', { infer: true }),
      PUSH_PROVIDER: this.config.get('PUSH_PROVIDER', { infer: true }),
      CONTENT_MODERATION_PROVIDER: this.config.get('CONTENT_MODERATION_PROVIDER', {
        infer: true,
      }),
    } as Env;

    const simulated = new Set(listSimulatedProviders(env));
    const allPorts = [
      'SmsProvider',
      'KycProvider',
      'PaymentProvider',
      'PushProvider',
      'MailProvider',
      'StorageProvider',
      'ContentModerationProvider',
    ];

    return {
      providers: allPorts.map((port) => ({ port, simulated: simulated.has(port) })),
    };
  }
}
