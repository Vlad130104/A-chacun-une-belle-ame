/**
 * Catalogue des codes d'erreur métier.
 *
 * Ces codes font partie du contrat public de l'API : ils sont consommés par le web,
 * le mobile et le back-office. Un code peut être ajouté ou déprécié, JAMAIS renommé
 * ni réutilisé pour une autre signification (docs/01-architecture.md §8).
 */
export const ErrorCode = {
  // ── Validation et générique ────────────────────────────────────────────────
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',

  // ── Authentification ───────────────────────────────────────────────────────
  /** Refus définitif : l'âge calculé côté serveur est inférieur au minimum légal. */
  AUTH_UNDERAGE: 'AUTH_UNDERAGE',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_OTP_INVALID: 'AUTH_OTP_INVALID',
  AUTH_OTP_EXPIRED: 'AUTH_OTP_EXPIRED',
  AUTH_OTP_MAX_ATTEMPTS: 'AUTH_OTP_MAX_ATTEMPTS',
  AUTH_ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  AUTH_ACCOUNT_SUSPENDED: 'AUTH_ACCOUNT_SUSPENDED',
  AUTH_ACCOUNT_BANNED: 'AUTH_ACCOUNT_BANNED',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  /** Refresh token déjà consommé : vol présumé, toute la famille est révoquée. */
  AUTH_TOKEN_REUSED: 'AUTH_TOKEN_REUSED',
  AUTH_PHONE_ALREADY_USED: 'AUTH_PHONE_ALREADY_USED',
  AUTH_IDENTITY_BLOCKED: 'AUTH_IDENTITY_BLOCKED',
  AUTH_VERIFICATION_REQUIRED: 'AUTH_VERIFICATION_REQUIRED',
  AUTH_FORBIDDEN: 'AUTH_FORBIDDEN',

  // ── Vérification d'identité ────────────────────────────────────────────────
  KYC_ALREADY_VERIFIED: 'KYC_ALREADY_VERIFIED',
  KYC_DOCUMENT_TOO_LARGE: 'KYC_DOCUMENT_TOO_LARGE',
  KYC_DOCUMENT_INVALID_TYPE: 'KYC_DOCUMENT_INVALID_TYPE',
  KYC_DUPLICATE_DOCUMENT: 'KYC_DUPLICATE_DOCUMENT',
  KYC_BIRTHDATE_LOCKED: 'KYC_BIRTHDATE_LOCKED',
  KYC_REVIEW_PENDING: 'KYC_REVIEW_PENDING',
  KYC_INVALID_TRANSITION: 'KYC_INVALID_TRANSITION',

  // ── Profil et médias ───────────────────────────────────────────────────────
  PROFILE_INCOMPLETE: 'PROFILE_INCOMPLETE',
  PROFILE_NOT_VERIFIED: 'PROFILE_NOT_VERIFIED',
  MEDIA_TOO_LARGE: 'MEDIA_TOO_LARGE',
  MEDIA_INVALID_TYPE: 'MEDIA_INVALID_TYPE',
  MEDIA_MAX_PHOTOS: 'MEDIA_MAX_PHOTOS',
  MEDIA_NOT_APPROVED: 'MEDIA_NOT_APPROVED',

  // ── Découverte et matching ─────────────────────────────────────────────────
  DISCOVERY_QUOTA_EXCEEDED: 'DISCOVERY_QUOTA_EXCEEDED',
  MATCH_ALREADY_DECIDED: 'MATCH_ALREADY_DECIDED',
  MATCH_TARGET_NOT_ELIGIBLE: 'MATCH_TARGET_NOT_ELIGIBLE',
  MATCH_SELF: 'MATCH_SELF',
  MATCH_BLOCKED: 'MATCH_BLOCKED',

  // ── Messagerie ─────────────────────────────────────────────────────────────
  /** La règle centrale du produit : aucune messagerie sans accord mutuel actif. */
  MSG_NO_MATCH: 'MSG_NO_MATCH',
  MSG_CONVERSATION_LOCKED: 'MSG_CONVERSATION_LOCKED',
  MSG_AWAITING_REPLY: 'MSG_AWAITING_REPLY',
  MSG_TOO_LONG: 'MSG_TOO_LONG',

  // ── Modération ─────────────────────────────────────────────────────────────
  MOD_REPORT_LIMIT: 'MOD_REPORT_LIMIT',
  MOD_CASE_ALREADY_RESOLVED: 'MOD_CASE_ALREADY_RESOLVED',
  /** Bannissement et remboursement exigent un second valideur distinct. */
  MOD_SECOND_APPROVER_REQUIRED: 'MOD_SECOND_APPROVER_REQUIRED',

  // ── Abonnement et paiement ─────────────────────────────────────────────────
  SUB_ALREADY_ACTIVE: 'SUB_ALREADY_ACTIVE',
  SUB_PLAN_UNAVAILABLE: 'SUB_PLAN_UNAVAILABLE',
  PAY_PROVIDER_ERROR: 'PAY_PROVIDER_ERROR',
  PAY_DUPLICATE_IDEMPOTENCY_KEY: 'PAY_DUPLICATE_IDEMPOTENCY_KEY',
  PAY_AMOUNT_MISMATCH: 'PAY_AMOUNT_MISMATCH',
  PAY_CURRENCY_UNSUPPORTED: 'PAY_CURRENCY_UNSUPPORTED',
  PAY_REFUND_NOT_ALLOWED: 'PAY_REFUND_NOT_ALLOWED',

  // ── Notifications et confidentialité ───────────────────────────────────────
  NOTIF_MANDATORY_TYPE: 'NOTIF_MANDATORY_TYPE',
  PRIVACY_EXPORT_TOO_SOON: 'PRIVACY_EXPORT_TOO_SOON',
  PRIVACY_NO_PENDING_DELETION: 'PRIVACY_NO_PENDING_DELETION',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Messages destinés à l'utilisateur, en français.
 * Ils ne contiennent jamais de détail technique ni d'information révélant
 * l'existence d'une ressource (docs/05-api.md §12).
 */
export const ERROR_MESSAGES_FR: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'Certaines informations saisies sont invalides.',
  INTERNAL_ERROR: 'Une erreur est survenue. Réessayez dans quelques instants.',
  NOT_FOUND: 'Cette ressource est introuvable.',
  RATE_LIMITED: 'Trop de tentatives. Réessayez plus tard.',

  AUTH_UNDERAGE: "L'accès à ce service est réservé aux personnes majeures.",
  AUTH_INVALID_CREDENTIALS: 'Identifiants incorrects.',
  AUTH_OTP_INVALID: 'Ce code est incorrect.',
  AUTH_OTP_EXPIRED: 'Ce code a expiré. Demandez-en un nouveau.',
  AUTH_OTP_MAX_ATTEMPTS: 'Trop de tentatives. Demandez un nouveau code.',
  AUTH_ACCOUNT_LOCKED: 'Votre compte est temporairement verrouillé.',
  AUTH_ACCOUNT_SUSPENDED: 'Votre compte est suspendu. Contactez le support.',
  AUTH_ACCOUNT_BANNED: "Votre compte n'est plus actif.",
  AUTH_TOKEN_EXPIRED: 'Votre session a expiré. Reconnectez-vous.',
  AUTH_TOKEN_REUSED: 'Votre session a été fermée par sécurité. Reconnectez-vous.',
  AUTH_PHONE_ALREADY_USED: 'Ce numéro est déjà associé à un compte.',
  AUTH_IDENTITY_BLOCKED: 'Cette inscription ne peut pas être finalisée.',
  AUTH_VERIFICATION_REQUIRED: 'Vérifiez votre identité pour accéder à cette fonctionnalité.',
  AUTH_FORBIDDEN: "Vous n'avez pas accès à cette ressource.",

  KYC_ALREADY_VERIFIED: 'Votre identité est déjà vérifiée.',
  KYC_DOCUMENT_TOO_LARGE: 'Ce fichier est trop volumineux.',
  KYC_DOCUMENT_INVALID_TYPE: "Ce format de fichier n'est pas accepté.",
  KYC_DUPLICATE_DOCUMENT: 'Cette pièce ne peut pas être utilisée.',
  KYC_BIRTHDATE_LOCKED: 'Votre date de naissance ne peut plus être modifiée après vérification.',
  KYC_REVIEW_PENDING: 'Votre vérification est en cours de traitement.',
  KYC_INVALID_TRANSITION: 'Cette action est impossible à ce stade de la vérification.',

  PROFILE_INCOMPLETE: 'Complétez votre profil pour continuer.',
  PROFILE_NOT_VERIFIED: 'Votre identité doit être vérifiée pour publier votre profil.',
  MEDIA_TOO_LARGE: 'Cette photo est trop volumineuse.',
  MEDIA_INVALID_TYPE: "Ce format d'image n'est pas accepté.",
  MEDIA_MAX_PHOTOS: 'Vous avez atteint le nombre maximal de photos.',
  MEDIA_NOT_APPROVED: "Cette photo n'a pas encore été validée.",

  DISCOVERY_QUOTA_EXCEEDED: 'Vous avez vu toutes vos suggestions du jour.',
  MATCH_ALREADY_DECIDED: 'Vous avez déjà répondu à ce profil.',
  MATCH_TARGET_NOT_ELIGIBLE: "Ce profil n'est plus disponible.",
  MATCH_SELF: 'Action impossible sur votre propre profil.',
  MATCH_BLOCKED: "Ce profil n'est plus disponible.",

  MSG_NO_MATCH: 'Vous ne pouvez écrire qu’après un accord mutuel.',
  MSG_CONVERSATION_LOCKED: 'Cette conversation est fermée.',
  MSG_AWAITING_REPLY: 'Attendez une réponse avant d’envoyer un nouveau message.',
  MSG_TOO_LONG: 'Ce message est trop long.',

  MOD_REPORT_LIMIT: 'Vous avez atteint la limite de signalements pour aujourd’hui.',
  MOD_CASE_ALREADY_RESOLVED: 'Ce dossier a déjà été traité.',
  MOD_SECOND_APPROVER_REQUIRED: 'Cette action nécessite la validation d’une seconde personne.',

  SUB_ALREADY_ACTIVE: 'Vous avez déjà un abonnement actif.',
  SUB_PLAN_UNAVAILABLE: "Cette offre n'est pas disponible.",
  PAY_PROVIDER_ERROR: 'Le paiement n’a pas pu aboutir. Réessayez.',
  PAY_DUPLICATE_IDEMPOTENCY_KEY: 'Ce paiement a déjà été enregistré.',
  PAY_AMOUNT_MISMATCH: 'Le montant ne correspond pas à l’offre choisie.',
  PAY_CURRENCY_UNSUPPORTED: "Cette devise n'est pas prise en charge.",
  PAY_REFUND_NOT_ALLOWED: 'Ce paiement ne peut pas être remboursé.',

  NOTIF_MANDATORY_TYPE:
    'Ces notifications concernent la sécurité de votre compte et ne peuvent pas être désactivées.',
  PRIVACY_EXPORT_TOO_SOON: 'Une demande d’export a déjà été effectuée récemment.',
  PRIVACY_NO_PENDING_DELETION: 'Aucune demande de suppression en cours.',
};
