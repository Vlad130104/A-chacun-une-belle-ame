import { z } from 'zod';

/** Schémas d'entrée du module profils. `.strict()` : un champ inattendu est rejeté. */

export const profileUpdateSchema = z
  .object({
    firstName: z.string().min(2).max(60).optional(),
    cityId: z.string().min(10).max(40).optional(),
    profession: z.string().max(120).nullable().optional(),
    educationLevel: z
      .enum(['NONE', 'SECONDARY', 'VOCATIONAL', 'BACHELOR', 'MASTER', 'DOCTORATE'])
      .nullable()
      .optional(),
    relationshipStatus: z
      .enum(['SINGLE', 'DIVORCED', 'WIDOWED', 'SEPARATED'])
      .nullable()
      .optional(),
    hasChildren: z.boolean().nullable().optional(),
    bio: z.string().max(1000).nullable().optional(),
    lookingFor: z.string().max(600).nullable().optional(),
    personalValues: z.string().max(600).nullable().optional(),
    interestIds: z.array(z.string().min(2).max(40)).max(30).optional(),
  })
  .strict();

export const profileStatusSchema = z
  .object({
    // `HIDDEN_BY_MODERATION` est volontairement absent : un membre ne peut ni se
    // masquer ni se démasquer lui-même par cette route.
    status: z.enum(['ACTIVE', 'PAUSED', 'DEACTIVATED']),
  })
  .strict();

export const preferencesSchema = z
  .object({
    seekingGender: z.enum(['FEMALE', 'MALE']),
    minAge: z.number().int().min(18).max(99),
    maxAge: z.number().int().min(18).max(99),
    cityIds: z.array(z.string().min(10).max(40)).max(20).default([]),
    sameCountryOnly: z.boolean().default(true),
    acceptedRelationshipStatuses: z
      .array(z.enum(['SINGLE', 'DIVORCED', 'WIDOWED', 'SEPARATED']))
      .default([]),
    acceptsChildren: z.boolean().nullable().default(null),
    minEducationLevel: z
      .enum(['NONE', 'SECONDARY', 'VOCATIONAL', 'BACHELOR', 'MASTER', 'DOCTORATE'])
      .nullable()
      .default(null),
    requiredInterestIds: z.array(z.string().min(2).max(40)).max(10).default([]),
  })
  .strict();

export const reorderPhotosSchema = z
  .object({
    orderedIds: z.array(z.string().min(10).max(40)).min(1).max(6),
  })
  .strict();

export const photoModerationSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT', 'HIDE']),
    /** Obligatoire pour un refus ou un masquage — contrôlé aussi côté cas d'usage. */
    reason: z.string().min(5).max(300).optional(),
  })
  .strict();
