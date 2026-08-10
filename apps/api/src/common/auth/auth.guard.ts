import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@acuba/contracts';
import type { Request } from 'express';
import { BusinessError } from '../errors/business.error';
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
  type TokenService,
  type UserRepository,
} from '../../modules/auth/application/ports';
import { checkAccountAccess } from '../../modules/auth/domain/session-policy';
import { AUTH_POLICY_KEY, type AuthPolicy } from './auth.decorator';

export interface AuthenticatedUser {
  id: string;
  sessionId: string;
  accountStatus: string;
  verificationStatus: string;
  roles: string[];
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

/**
 * Chaîne d'autorisation centralisée (docs/06-roles-et-permissions.md §2).
 *
 * Point clé (ADR-006) : le statut du compte et de la vérification est RELU EN BASE,
 * jamais lu depuis le JWT. Un compte suspendu à 10 h ne doit pas continuer à naviguer
 * jusqu'à 10 h 15 parce que son jeton reste valide.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<AuthPolicy | undefined>(AUTH_POLICY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Absence de politique = refus. Une route non déclarée n'est jamais ouverte par
    // défaut ; le test d'inventaire empêche par ailleurs qu'elle atteigne la branche.
    if (policy === undefined) throw BusinessError.forbidden(ErrorCode.AUTH_FORBIDDEN);
    if (policy.level === 'public') return true;

    const request = context.switchToHttp().getRequest<Request>();
    const claims = await this.readToken(request);
    const user = await this.users.findById(claims.sub);

    if (user === null) throw BusinessError.unauthorized(ErrorCode.AUTH_TOKEN_EXPIRED);

    const access = checkAccountAccess(user.accountStatus);
    if (!access.allowed) {
      throw BusinessError.forbidden(
        access.reason === 'BANNED' || access.reason === 'UNDERAGE'
          ? ErrorCode.AUTH_ACCOUNT_BANNED
          : ErrorCode.AUTH_ACCOUNT_SUSPENDED,
      );
    }

    if (policy.level === 'verified' && user.verificationStatus !== 'VERIFIED') {
      throw BusinessError.forbidden(ErrorCode.AUTH_VERIFICATION_REQUIRED);
    }

    if (policy.permissions !== undefined && policy.permissions.length > 0) {
      // Les rôles back-office arrivent avec la tranche D9 : tant qu'ils n'existent pas,
      // ces routes sont fermées plutôt qu'ouvertes.
      const granted = new Set(claims.roles);
      const autorise = policy.permissions.every((permission) => granted.has(permission));
      if (!autorise) throw BusinessError.forbidden(ErrorCode.AUTH_FORBIDDEN);
    }

    request.user = {
      id: user.id,
      sessionId: claims.sid,
      accountStatus: user.accountStatus,
      verificationStatus: user.verificationStatus,
      roles: claims.roles,
    };

    return true;
  }

  private async readToken(
    request: Request,
  ): Promise<{ sub: string; sid: string; roles: string[] }> {
    const header = request.headers.authorization;
    if (header === undefined || !header.startsWith('Bearer ')) {
      throw BusinessError.unauthorized(ErrorCode.AUTH_TOKEN_EXPIRED);
    }

    try {
      return await this.tokens.verifyAccessToken(header.slice(7));
    } catch {
      throw BusinessError.unauthorized(ErrorCode.AUTH_TOKEN_EXPIRED);
    }
  }
}

/** Injecte l'utilisateur authentifié dans un contrôleur. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.user === undefined) {
      // Ne peut survenir que si un contrôleur oublie le garde : on échoue bruyamment.
      throw BusinessError.unauthorized(ErrorCode.AUTH_TOKEN_EXPIRED);
    }
    return request.user;
  },
);
