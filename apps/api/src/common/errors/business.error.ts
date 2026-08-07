import { ErrorCode, ERROR_MESSAGES_FR } from '@acuba/contracts';

/**
 * Erreur métier. Le domaine lève cette erreur ; l'infrastructure la traduit en
 * réponse HTTP. Le domaine n'importe donc jamais NestJS ni Express.
 */
export class BusinessError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly httpStatus: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(ERROR_MESSAGES_FR[code]);
    this.name = 'BusinessError';
  }

  static badRequest(code: ErrorCode, details?: Record<string, unknown>): BusinessError {
    return new BusinessError(code, 400, details);
  }

  static unauthorized(code: ErrorCode): BusinessError {
    return new BusinessError(code, 401);
  }

  static forbidden(code: ErrorCode, details?: Record<string, unknown>): BusinessError {
    return new BusinessError(code, 403, details);
  }

  /**
   * 404 volontairement indistinct : la plateforme ne révèle jamais si une ressource
   * existe mais est inaccessible (blocage, suspension) ou n'existe pas.
   */
  static notFound(code: ErrorCode = ErrorCode.NOT_FOUND): BusinessError {
    return new BusinessError(code, 404);
  }

  static conflict(code: ErrorCode, details?: Record<string, unknown>): BusinessError {
    return new BusinessError(code, 409, details);
  }

  static unprocessable(code: ErrorCode, details?: Record<string, unknown>): BusinessError {
    return new BusinessError(code, 422, details);
  }

  static rateLimited(code: ErrorCode = ErrorCode.RATE_LIMITED): BusinessError {
    return new BusinessError(code, 429);
  }
}
