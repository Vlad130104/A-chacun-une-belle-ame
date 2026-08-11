import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Env } from '../../../config/env.schema';
import type { RateLimiter } from '../application/ports';

/**
 * Limitation de débit par fenêtre fixe, dans Redis.
 *
 * Les compteurs survivent au redémarrage de l'API et sont partagés entre instances :
 * un attaquant ne peut pas réinitialiser sa limite en provoquant un déploiement
 * (docs/08-backlog-mvp.md, story D1-08).
 */
@Injectable()
export class RedisRateLimiter implements RateLimiter, OnModuleDestroy {
  private readonly logger = new Logger(RedisRateLimiter.name);
  private readonly redis: Redis;

  constructor(config: ConfigService<Env, true>) {
    this.redis = new Redis(config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
    this.redis.on('error', (error: Error) => {
      this.logger.error({ err: error }, 'Redis indisponible pour la limitation de débit');
    });
  }

  async hit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const redisKey = `rl:${key}`;

    const results = await this.redis
      .multi()
      .incr(redisKey)
      .expire(redisKey, windowSeconds, 'NX')
      .exec();

    // `exec()` renvoie null si la transaction a été interrompue : on refuse alors la
    // requête plutôt que de laisser passer sans compter.
    if (results === null) return { allowed: false, retryAfterSeconds: windowSeconds };

    const count = Number(results[0]?.[1] ?? 0);

    if (count <= limit) return { allowed: true, retryAfterSeconds: 0 };

    const ttl = await this.redis.ttl(redisKey);
    return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : windowSeconds };
  }

  /**
   * Sonde de disponibilité (story E-03).
   *
   * Exposée ici plutôt que dans un client Redis séparé : ouvrir une seconde
   * connexion juste pour la sonde vérifierait la santé d'une connexion que le
   * service n'utilise pas. On interroge celle qui sert réellement.
   */
  async ping(): Promise<void> {
    await this.redis.ping();
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(`rl:${key}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
