import { z } from 'zod';

export const uploadDocumentSchema = z
  .object({
    type: z.enum([
      'NATIONAL_ID',
      'PASSPORT',
      'DRIVER_LICENSE',
      'CONSULAR_CARD',
      'SELFIE',
      'LIVENESS_CAPTURE',
    ]),
  })
  .strict();

export const decisionSchema = z
  .object({
    outcome: z.enum(['APPROVE', 'REJECT', 'REQUEST_ADDITIONAL']),
    /** Motif normalisé : jamais de texte libre en première intention. */
    reasonCode: z.string().min(3).max(60),
    reasonNote: z.string().max(500).optional(),
  })
  .strict();
