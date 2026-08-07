import { z } from 'zod';

/**
 * Schémas partagés entre l'API (validation d'entrée) et les clients (validation de
 * formulaire). Une seule définition : un changement de contrat casse la compilation
 * des consommateurs, ce qui est le comportement recherché.
 *
 * `.strict()` partout : une propriété inattendue est rejetée plutôt qu'ignorée.
 */

// ── Primitives ───────────────────────────────────────────────────────────────

/** Format E.164 : indicatif pays puis 6 à 14 chiffres. */
export const phoneE164Schema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Numéro de téléphone invalide.');

export const otpCodeSchema = z.string().regex(/^\d{6}$/, 'Le code doit comporter 6 chiffres.');

export const cuidSchema = z.string().min(20).max(40);

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.');

export const genderSchema = z.enum(['FEMALE', 'MALE']);

export const consentTypeSchema = z.enum([
  'TERMS_OF_SERVICE',
  'PRIVACY_POLICY',
  'CODE_OF_CONDUCT',
  'KYC_PROCESSING',
  'MARKETING_COMMUNICATIONS',
]);

// ── Pagination par curseur (jamais d'offset) ─────────────────────────────────

export const cursorPaginationSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().optional(),
  })
  .strict();

export type CursorPagination = z.infer<typeof cursorPaginationSchema>;

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ── Authentification ─────────────────────────────────────────────────────────

export const deviceInfoSchema = z
  .object({
    type: z.enum(['ANDROID', 'IOS', 'WEB']),
    model: z.string().max(120).optional(),
    osVersion: z.string().max(40).optional(),
    appVersion: z.string().max(40).optional(),
    pushToken: z.string().max(512).optional(),
  })
  .strict();

export const consentInputSchema = z
  .object({
    type: consentTypeSchema,
    documentVersion: z.string().min(1).max(20),
    granted: z.boolean(),
  })
  .strict();

/**
 * Inscription. La date de naissance est déclarée ici, mais l'âge est calculé
 * exclusivement côté serveur : aucun champ `age` n'existe dans ce schéma, et c'est
 * délibéré (docs/05-api.md §12).
 */
export const registerSchema = z
  .object({
    phoneE164: phoneE164Schema,
    birthDate: isoDateSchema,
    gender: genderSchema,
    firstName: z.string().min(2).max(60).optional(),
    inviteCode: z.string().min(4).max(40).optional(),
    consents: z.array(consentInputSchema).min(3),
    device: deviceInfoSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      (['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'CODE_OF_CONDUCT'] as const).every((required) =>
        value.consents.some((c) => c.type === required && c.granted),
      ),
    {
      message:
        'Les conditions générales, la politique de confidentialité et la charte doivent être acceptées.',
      path: ['consents'],
    },
  );

export type RegisterInput = z.infer<typeof registerSchema>;

export const verifyOtpSchema = z
  .object({
    challengeId: cuidSchema,
    code: otpCodeSchema,
    device: deviceInfoSchema.optional(),
  })
  .strict();

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

// ── Enveloppe d'erreur ───────────────────────────────────────────────────────

export const errorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.record(z.unknown()).nullable().optional(),
        requestId: z.string(),
        timestamp: z.string(),
      })
      .strict(),
  })
  .strict();

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
