import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@acuba/contracts';
import type { Request } from 'express';
import { BusinessError } from '../errors/business.error';
import { RATE_LIMITER, type RateLimiter } from '../../modules/auth/application/ports';
import { AUTH_POLICY_KEY, type AuthPolicy } from './auth.decorator';
import { counterKey, ruleFor } from './rate-limit-policy';

/**
 * Application de la limitation de débit déclarée par `@Auth({ rateLimit })`
 * (story E-02).
 *
 * Il tourne **après** le garde d'authentification, ce qui lui permet de compter
 * par compte plutôt que par adresse IP. L'ordre n'est toutefois pas une
 * hypothèse dont il dépend : si `request.user` est absent, il retombe sur l'IP.
 * Un garde dont la correction dépendrait d'un ordre d'enregistrement serait un
 * garde fragile.
 *
 * **Une panne de Redis ne ferme pas le service.** L'arbitrage est délibéré et
 * n'est pas celui qu'on prend d'ordinaire en sécurité : refuser toutes les
 * requêtes parce que le compteur est injoignable transformerait un incident
 * d'infrastructure en interruption totale, alors que la limitation de débit est
 * une protection de confort — les vraies barrières (authentification,
 * autorisation, quotas métier) sont ailleurs et, elles, ne dépendent pas de
 * Redis. L'échec est journalisé par l'adaptateur.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const policy = this.reflector.getAllAndOverride<AuthPolicy | undefined>(AUTH_POLICY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const routeKey = policy?.rateLimit;
    if (routeKey === undefined) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const rule = ruleFor(routeKey);
    const key = counterKey(routeKey, rule, {
      userId: request.user?.id ?? null,
      ip: request.ip ?? null,
    });

    let verdict: { allowed: boolean; retryAfterSeconds: number };
    try {
      verdict = await this.limiter.hit(key, rule.limit, rule.windowSeconds);
    } catch {
      return true;
    }

    if (!verdict.allowed) {
      throw new BusinessError(ErrorCode.RATE_LIMITED, 429, {
        retryAfterSeconds: verdict.retryAfterSeconds,
      });
    }

    return true;
  }
}
