import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@acuba/contracts';
import type { Request } from 'express';
import { BusinessError } from '../../../common/errors/business.error';
import { AUTH_POLICY_KEY, type AuthPolicy } from '../../../common/auth/auth.decorator';
import { ConversationAccessService } from '../application/conversation.use-cases';

/**
 * Rend exécutoire le drapeau `conversationMember` des politiques de route.
 *
 * Une annotation qui ne fait rien serait pire qu'aucune annotation : elle
 * donnerait l'illusion d'un contrôle. Ce garde appelle donc exactement le même
 * service que les cas d'usage.
 *
 * Oui, la vérification a lieu deux fois — ici puis dans le cas d'usage — et c'est
 * délibéré : l'événement Socket.IO `message:send` ne traverse aucun garde HTTP,
 * seule la vérification portée par le cas d'usage le protège. Retirer l'une des
 * deux ouvrirait un canal. Le coût est une lecture indexée par requête.
 */
@Injectable()
export class ConversationMemberGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: ConversationAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<AuthPolicy | undefined>(AUTH_POLICY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (policy?.conversationMember !== true) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    // Le garde d'authentification s'exécute avant celui-ci ; sans utilisateur,
    // on échoue plutôt que de laisser passer.
    if (user === undefined) throw BusinessError.unauthorized(ErrorCode.AUTH_TOKEN_EXPIRED);

    const conversationId = (request.params as Record<string, string | undefined>).conversationId;
    if (conversationId === undefined) throw BusinessError.notFound();

    await this.access.assertCanRead(user.id, conversationId);
    return true;
  }
}
