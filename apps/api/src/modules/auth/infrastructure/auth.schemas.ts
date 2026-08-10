import { z } from 'zod';

/** Schémas propres à l'API d'authentification, complétant ceux de `@acuba/contracts`. */
export const refreshSchema = z
  .object({
    refreshToken: z.string().min(32).max(256),
  })
  .strict();
