import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, Public } from '../../common/auth/auth.decorator';
import { listSimulatedProviders, type Env } from '../../config/env.schema';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CACHE_PROBE, type CacheProbe } from './ports';

/** Une sonde ne doit jamais faire attendre l'orchestrateur plus que sa propre échéance. */
const DELAI_SONDE_MS = 2000;

async function avecDelai<T>(promesse: Promise<T>, ms = DELAI_SONDE_MS): Promise<T> {
  let minuteur: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promesse,
      new Promise<never>((_resolve, reject) => {
        minuteur = setTimeout(() => reject(new Error('délai de sonde dépassé')), ms);
      }),
    ]);
  } finally {
    if (minuteur !== undefined) clearTimeout(minuteur);
  }
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    @Inject(CACHE_PROBE) private readonly cache: CacheProbe,
  ) {}

  /**
   * Vivacité : le processus répond.
   *
   * Elle ne teste AUCUNE dépendance, et c'est voulu. Un orchestrateur redémarre
   * le conteneur quand cette sonde échoue ; y inclure PostgreSQL ferait
   * redémarrer en boucle toutes les instances pendant une panne de base, ce qui
   * ajouterait une tempête de démarrages à l'incident au lieu de l'atténuer.
   */
  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Le processus répond' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Disponibilité : les dépendances sont joignables (story E-03).
   *
   * Jusqu'à la phase E, cette route renvoyait « ok » **sans rien vérifier**. Un
   * répartiteur de charge y aurait donc envoyé du trafic vers une instance
   * incapable de joindre PostgreSQL, et l'aurait fait sans jamais la retirer du
   * service. Une sonde qui répond toujours oui est pire qu'une sonde absente :
   * elle donne une garantie qui n'existe pas.
   *
   * Elle renvoie **503** en cas d'échec, jamais 200 avec un statut dégradé dans
   * le corps : un répartiteur lit le code, pas le corps.
   */
  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'PostgreSQL et Redis sont joignables' })
  async ready(): Promise<{ status: string; checks: Record<string, boolean> }> {
    const [postgres, redis] = await Promise.all([this.checkPostgres(), this.checkRedis()]);
    const checks = { postgres, redis };

    if (postgres && redis) return { status: 'ok', checks };

    // 503 explicite. Le détail nommé sert au diagnostic en exploitation ; il ne
    // révèle ni adresse, ni identifiant, ni message d'erreur du moteur.
    throw new ServiceUnavailableException({ status: 'unavailable', checks });
  }

  private async checkPostgres(): Promise<boolean> {
    try {
      await avecDelai(this.prisma.$queryRaw`SELECT 1`);
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      await avecDelai(this.cache.ping());
      return true;
    } catch {
      return false;
    }
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
