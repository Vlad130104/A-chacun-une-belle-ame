import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type Job } from 'bullmq';
import type { Env } from '../../../config/env.schema';
import { DispatchNotificationUseCase } from '../application/notification.use-cases';
import type { NotificationJob } from '../application/ports';
import { QUEUE_NAME } from './bullmq.queue';

/**
 * Consommateur de la file d'envoi.
 *
 * Séparé du producteur pour rompre le cycle d'injection : les cas d'usage
 * déposent dans la file, ce worker les rappelle pour exécuter l'envoi. Réunir
 * les deux rôles empêcherait purement et simplement l'application de démarrer.
 *
 * Sur un déploiement à plusieurs rôles, un processus `api` ne consomme rien :
 * seul le rôle `worker` traite les envois (docs/10-plan-de-deploiement.md §3).
 */
@Injectable()
export class NotificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorker.name);
  private worker: Worker<NotificationJob> | null = null;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly dispatch: DispatchNotificationUseCase,
  ) {}

  onModuleInit(): void {
    const role = this.config.get('PROCESS_ROLE', { infer: true });
    if (role === 'api') {
      this.logger.log('Rôle « api » : la file de notifications n’est pas consommée ici.');
      return;
    }

    this.worker = new Worker<NotificationJob>(
      QUEUE_NAME,
      async (job: Job<NotificationJob>) => {
        await this.dispatch.execute(job.data);
      },
      {
        connection: { url: this.config.get('REDIS_URL', { infer: true }) },
        concurrency: 5,
      },
    );

    this.worker.on('failed', (job, error) => {
      // Ne devrait pas arriver : le cas d'usage attrape ses propres erreurs et
      // décide lui-même du réessai. Passer ici signale un défaut de code, pas un
      // échec de fournisseur — d'où le niveau `error`.
      this.logger.error(
        { err: error, jobId: job?.id },
        'Travail de notification échoué hors du chemin nominal',
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
