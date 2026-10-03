import { z } from 'zod';

/** Schémas propres à l'API d'authentification, complétant ceux de `@acuba/contracts`. */
/**
 * `refreshToken` est facultatif depuis F-02 : un navigateur l'envoie en cookie
 * `httpOnly` et poste un corps vide. L'application mobile continue de l'envoyer
 * ici.
 */
export const refreshSchema = z
  .object({
    refreshToken: z.string().min(32).max(256).optional(),
  })
  .strict();
