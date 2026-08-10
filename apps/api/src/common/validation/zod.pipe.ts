import { Body, type PipeTransform } from '@nestjs/common';
import { ErrorCode } from '@acuba/contracts';
import type { ZodTypeAny } from 'zod';
import { BusinessError } from '../errors/business.error';

/**
 * Validation d'entrée par schéma Zod partagé.
 *
 * Toute donnée venant du client est considérée comme non fiable : les schémas sont
 * stricts (`additionalProperties: false`), donc un champ inattendu est REJETÉ plutôt
 * qu'ignoré silencieusement.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      // On expose le champ fautif et le message, jamais la structure interne attendue.
      const details: Record<string, string> = {};
      for (const issue of result.error.issues) {
        details[issue.path.join('.') || '_'] = issue.message;
      }
      throw BusinessError.badRequest(ErrorCode.VALIDATION_FAILED, details);
    }

    return result.data;
  }
}

/** Raccourci : `@ZodBody(registerSchema) body: unknown`. */
export const ZodBody = (schema: ZodTypeAny): ParameterDecorator =>
  Body(new ZodValidationPipe(schema));
