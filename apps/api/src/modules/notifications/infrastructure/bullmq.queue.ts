import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { Env } from '../../../config/env.schema';
import type { NotificationJob, NotificationQueue } from '../application/ports';

export const QUEUE_NAME = 'notifications';

/**
 * Producteur de la file d'envoi (story D8-01 · ADR-010).
 *
 * **Producteur uniquement.** La consommation vit dans `NotificationWorker`, et
 * cette séparation n'est pas cosmétique : les cas d'usage dépendent de la file
 * pour y déposer un travail, et le consommateur dépend des cas d'usage pour
 * l'exécuter. Réunir les deux rôles dans une seule classe crée un cycle
 * d'injection `file → dispatch → file` — exactement celui rencontré en D5 sur
 * la passerelle temps réel, et le test de résolution du conteneur le rattrape
 * de la même façon.
 *
 * Deux points de conception :
 *
 *  1. **Le `jobId` est déterministe** : `notificationId:canal:tentative`. Un
 *     même travail déposé deux fois est dédupliqué par BullMQ lui-même.
 *  2. **Les réessais sont pilotés par le domaine, pas par BullMQ.** L'option
 *     `attempts` réessaierait aussi un jeton push définitivement révoqué. On
 *     redépose donc nous-mêmes, avec le délai décidé par `decideRetry`.
 *
 * La connexion Redis n'est ouverte qu'à `onModuleInit` : construire le conteneur
 * ne contacte aucun service.
 */
@Injectable()
export class BullMqNotificationQueue implements NotificationQueue, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BullMqNotificationQueue.name);
  private queue: Queue<NotificationJob> | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    this.queue = new Queue<NotificationJob>(QUEUE_NAME, {
      connection: { url: this.config.get('REDIS_URL', { infer: true }) },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  async enqueue(job: NotificationJob, delayMs: number): Promise<void> {
    if (this.queue === null) {
      // Arrive en test unitaire et pendant l'arrêt : la notification in-app est
      // déjà écrite, seul le canal sortant est perdu. On le trace sans faire
      // échouer l'action métier qui a déclenché l'envoi.
      this.logger.debug('File indisponible : envoi sortant ignoré.');
      return;
    }

    await this.queue.add(QUEUE_NAME, job, {
      jobId: `${job.notificationId}:${job.channel}:${job.attempt}`,
      delay: delayMs,
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 86_400 },
    });
  }
}
