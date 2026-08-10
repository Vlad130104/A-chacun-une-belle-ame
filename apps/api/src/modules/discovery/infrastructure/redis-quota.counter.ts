import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Env } from '../../../config/env.schema';
import type { ClockProvider } from '../../../providers/ports';
import type { QuotaCounter } from '../application/ports';

/**
 * Quotas quotidiens (story D4-08).
 *
 * Comptés dans Redis, avec une clé par jour UTC : la remise à zéro est implicite, sans
 * tâche planifiée. Le compteur est côté serveur — un client modifié ne peut pas
 * dépasser son quota.
 */
@Injectable()
export class RedisQuotaCounter implements QuotaCounter, OnModuleDestroy {
  private readonly logger = new Logger(RedisQuotaCounter.name);
  private readonly redis: Redis;

  constructor(
    config: ConfigService<Env, true>,
    private readonly clock: ClockProvider,
  ) {
    this.redis = new Redis(config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
    this.redis.on('error', (error: Error) => {
      this.logger.error({ err: error }, 'Redis indisponible pour les quotas');
    });
  }

  async consume(
    key: string,
    limit: number,
  ): Promise<{ allowed: boolean; remaining: number; resetsAt: Date }> {
    const { redisKey, resetsAt, ttl } = this.dayWindow(key);

    const results = await this.redis.multi().incr(redisKey).expire(redisKey, ttl, 'NX').exec();

    // En cas de transaction interrompue, on refuse plutôt que de laisser passer sans
    // compter : un quota non appliqué est une porte ouverte.
    if (results === null) return { allowed: false, remaining: 0, resetsAt };

    const utilise = Number(results[0]?.[1] ?? 0);
    return {
      allowed: utilise <= limit,
      remaining: Math.max(0, limit - utilise),
      resetsAt,
    };
  }

  async peek(key: string, limit: number): Promise<{ remaining: number; resetsAt: Date }> {
    const { redisKey, resetsAt } = this.dayWindow(key);
    const valeur = await this.redis.get(redisKey);
    return { remaining: Math.max(0, limit - Number(valeur ?? 0)), resetsAt };
  }

  /** Fenêtre journalière en UTC — la même pour tous les membres, quel que soit le fuseau. */
  private dayWindow(key: string): { redisKey: string; resetsAt: Date; ttl: number } {
    const now = this.clock.now();
    const jour = now.toISOString().slice(0, 10);

    const resetsAt = new Date(`${jour}T00:00:00.000Z`);
    resetsAt.setUTCDate(resetsAt.getUTCDate() + 1);

    return {
      redisKey: `quota:${key}:${jour}`,
      resetsAt,
      ttl: Math.ceil((resetsAt.getTime() - now.getTime()) / 1000),
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
