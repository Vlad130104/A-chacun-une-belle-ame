import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorCode, ERROR_MESSAGES_FR } from '@acuba/contracts';
import { BusinessError } from './business.error';

/**
 * Filtre d'exception global.
 *
 * Toutes les erreurs sortent sous la même enveloppe. Aucune trace, aucun nom de
 * table, aucune requête SQL, aucune valeur interne n'atteint jamais le client :
 * une exception non typée devient un INTERNAL_ERROR neutre, et le détail reste
 * dans les logs, corrélé par requestId (docs/01-architecture.md §8).
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request.headers['x-request-id'] as string | undefined) ?? 'inconnu';

    const { status, code, message, details } = this.describe(exception);

    if (status >= 500) {
      this.logger.error(
        { requestId, err: exception, route: `${request.method} ${request.url}` },
        'Erreur non gérée',
      );
    } else {
      this.logger.warn({ requestId, code, status }, 'Erreur métier');
    }

    response.status(status).json({
      error: {
        code,
        message,
        details: details ?? null,
        requestId,
        // Horodatage de journalisation en bordure : il ne participe à aucune règle
        // métier, et injecter une horloge ici rendrait le filtre d'erreur tributaire
        // du conteneur d'injection — précisément ce qui doit rester disponible quand
        // tout le reste échoue.
        // eslint-disable-next-line no-restricted-syntax -- voir ci-dessus
        timestamp: new Date().toISOString(),
      },
    });
  }

  private describe(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
  } {
    if (exception instanceof BusinessError) {
      return {
        status: exception.httpStatus,
        code: exception.code,
        message: exception.message,
        ...(exception.details ? { details: exception.details } : {}),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code =
        status === 404
          ? ErrorCode.NOT_FOUND
          : status === 429
            ? ErrorCode.RATE_LIMITED
            : status === 401
              ? ErrorCode.AUTH_TOKEN_EXPIRED
              : status === 403
                ? ErrorCode.AUTH_FORBIDDEN
                : ErrorCode.VALIDATION_FAILED;
      return { status, code, message: ERROR_MESSAGES_FR[code] };
    }

    return {
      status: 500,
      code: ErrorCode.INTERNAL_ERROR,
      message: ERROR_MESSAGES_FR[ErrorCode.INTERNAL_ERROR],
    };
  }
}
