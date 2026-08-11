import { z } from 'zod';

/**
 * Schéma de configuration.
 *
 * Toute la configuration est validée au démarrage : une variable manquante, mal
 * typée ou hors bornes EMPÊCHE le démarrage. Une configuration invalide doit échouer
 * bruyamment au lancement, jamais silencieusement à la première requête d'un
 * utilisateur (docs/10-plan-de-deploiement.md §5).
 */

/** Une variable d'environnement arrive en chaîne ; les tests passent parfois un booléen. */
const bool = z
  .union([z.boolean(), z.string()])
  .default(false)
  .transform((value) => value === true || value === 'true' || value === '1');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url(),
  KYC_DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url(),

  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_GLOBAL_PREFIX: z.string().default('api/v1'),
  PROCESS_ROLE: z.enum(['api', 'worker', 'all']).default('all'),

  // Secret de hachage des empreintes recherchables (numéro, code OTP, refresh token).
  // Une valeur par défaut n'est acceptable qu'en développement : en production, la
  // laisser vide reviendrait à rendre les empreintes reproductibles par un tiers.
  HASH_SALT: z.string().min(16).default('sel-de-developpement-non-secret'),

  // ── Stockage compatible S3 — deux buckets séparés (ADR-004) ────────────────
  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_MEDIA_BUCKET: z.string().min(3).default('acuba-media'),
  S3_KYC_BUCKET: z.string().min(3).default('acuba-kyc'),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(300),
  KYC_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().max(900).default(300),

  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(8),

  // ── Ports externes ─────────────────────────────────────────────────────────
  SMS_PROVIDER: z.enum(['console', 'live']).default('console'),
  KYC_PROVIDER: z.enum(['mock', 'live']).default('mock'),
  PAYMENT_PROVIDER: z.enum(['mock', 'live']).default('mock'),
  PUSH_PROVIDER: z.enum(['mock', 'live']).default('mock'),
  MAIL_PROVIDER: z.enum(['smtp', 'live']).default('smtp'),
  CONTENT_MODERATION_PROVIDER: z.enum(['rules', 'live']).default('rules'),
  ALLOW_MOCK_PROVIDERS_IN_PRODUCTION: bool,

  // ── Règles métier (docs/03-modele-de-donnees.md §11) ───────────────────────
  MINIMUM_AGE: z.coerce.number().int().min(18).max(21).default(18),
  KYC_DOCUMENT_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  MESSAGE_RETENTION_MONTHS: z.coerce.number().int().positive().default(24),
  ACCOUNT_DELETION_GRACE_DAYS: z.coerce.number().int().positive().default(30),
  ANALYTICS_RETENTION_MONTHS: z.coerce.number().int().positive().default(14),
  WEBHOOK_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  PHOTO_SOFT_DELETE_DAYS: z.coerce.number().int().positive().default(7),

  DAILY_SUGGESTION_LIMIT_FREE: z.coerce.number().int().positive().default(10),
  DAILY_SUGGESTION_LIMIT_PREMIUM: z.coerce.number().int().positive().default(30),
  DAILY_LIKE_LIMIT_FREE: z.coerce.number().int().positive().default(10),
  DAILY_LIKE_LIMIT_PREMIUM: z.coerce.number().int().positive().default(50),
  MIN_COMPLETION_TO_PUBLISH: z.coerce.number().int().min(0).max(100).default(60),
  MAX_PHOTOS: z.coerce.number().int().min(1).max(12).default(6),
  MIN_PHOTOS_TO_PUBLISH: z.coerce.number().int().min(1).max(6).default(3),
  MAX_UPLOAD_SIZE_BYTES: z.coerce.number().int().positive().default(8_388_608),
  MAX_KYC_UPLOAD_SIZE_BYTES: z.coerce.number().int().positive().default(10_485_760),
  UNANSWERED_MESSAGE_LIMIT: z.coerce.number().int().positive().default(20),
  MATCHING_MAX_CANDIDATES: z.coerce.number().int().positive().default(500),
  MATCHING_POLICY: z.enum(['HETERO', 'OPEN']).default('HETERO'),

  // ── Modération (docs/08-backlog-mvp.md, lot D6) ────────────────────────────
  //
  // Les échéances SLA et les seuils de détection sont en configuration, jamais
  // codés en dur : ils seront ajustés sur les données réelles sans redéploiement.
  SLA_HOURS_P0: z.coerce.number().int().positive().default(2),
  SLA_HOURS_P1: z.coerce.number().int().positive().default(6),
  SLA_HOURS_P2: z.coerce.number().int().positive().default(24),
  SLA_HOURS_P3: z.coerce.number().int().positive().default(72),

  DAILY_REPORT_LIMIT: z.coerce.number().int().positive().default(10),
  DAILY_REPORT_EVIDENCE_LIMIT: z.coerce.number().int().positive().default(20),
  /** Un signalement de plus rouvre le cas résolu depuis moins de N jours. */
  CASE_REOPEN_WINDOW_DAYS: z.coerce.number().int().positive().default(30),

  // Seuils des 9 règles de détection (story D6-07).
  DETECT_MONEY_REQUEST_COUNT: z.coerce.number().int().positive().default(3),
  DETECT_MONEY_REQUEST_WINDOW_HOURS: z.coerce.number().int().positive().default(24),
  DETECT_BULK_SIMILAR_COUNT: z.coerce.number().int().positive().default(5),
  DETECT_BULK_SIMILAR_RATIO: z.coerce.number().min(0.5).max(1).default(0.9),
  DETECT_ACCOUNT_CREATION_COUNT: z.coerce.number().int().positive().default(3),
  DETECT_ACCOUNT_CREATION_WINDOW_DAYS: z.coerce.number().int().positive().default(30),
  DETECT_DEVICE_CHANGE_COUNT: z.coerce.number().int().positive().default(5),
  DETECT_DEVICE_CHANGE_WINDOW_DAYS: z.coerce.number().int().positive().default(7),
  DETECT_LIKE_VOLUME_MULTIPLIER: z.coerce.number().positive().default(3),
  DETECT_VERIFICATION_REFUSAL_COUNT: z.coerce.number().int().positive().default(3),
  DETECT_MULTIPLE_REPORTS_COUNT: z.coerce.number().int().positive().default(3),
  DETECT_MULTIPLE_REPORTS_WINDOW_DAYS: z.coerce.number().int().positive().default(7),
  DETECT_SUSPICIOUS_LINK_COUNT: z.coerce.number().int().positive().default(3),
  /** Cadence minimale considérée comme non humaine, en millisecondes entre actions. */
  DETECT_AUTOMATION_MIN_INTERVAL_MS: z.coerce.number().int().positive().default(400),
  DETECT_AUTOMATION_SAMPLE_SIZE: z.coerce.number().int().min(3).default(10),

  // ── Sécurité ───────────────────────────────────────────────────────────────
  CORS_ALLOWED_ORIGINS: z.string().default(''),
  RATE_LIMIT_GLOBAL_PER_MINUTE: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_AUTH_PER_HOUR: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_OTP_PER_10_MIN: z.coerce.number().int().positive().default(3),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  METRICS_ENABLED: bool,
});

export type Env = z.infer<typeof envSchema>;

/** Ports dont l'absence d'implémentation réelle rend la production non conforme. */
export const CRITICAL_PROVIDER_KEYS = ['SMS_PROVIDER', 'PAYMENT_PROVIDER'] as const;

export class EnvValidationError extends Error {
  constructor(issues: string[]) {
    super(`Configuration invalide :\n  - ${issues.join('\n  - ')}`);
    this.name = 'EnvValidationError';
  }
}

const SIMULATED_VALUES = new Set(['console', 'mock', 'rules']);

/**
 * Retourne la liste des ports encore simulés. Source de vérité de docs/MOCKS.md et
 * de la route GET /health/providers.
 */
export function listSimulatedProviders(env: Env): string[] {
  const entries: Array<[string, string]> = [
    ['SmsProvider', env.SMS_PROVIDER],
    ['KycProvider', env.KYC_PROVIDER],
    ['PaymentProvider', env.PAYMENT_PROVIDER],
    ['PushProvider', env.PUSH_PROVIDER],
    ['ContentModerationProvider', env.CONTENT_MODERATION_PROVIDER],
  ];
  return entries.filter(([, value]) => SIMULATED_VALUES.has(value)).map(([port]) => port);
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    throw new EnvValidationError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')} : ${issue.message}`),
    );
  }

  const env = parsed.data;

  // Garde-fou : en production, un port critique simulé empêche le démarrage.
  // On ne peut pas présenter comme fonctionnelle une intégration qui ne l'est pas.
  if (env.NODE_ENV === 'production' && !env.ALLOW_MOCK_PROVIDERS_IN_PRODUCTION) {
    const simulatedCritical = CRITICAL_PROVIDER_KEYS.filter((key) =>
      SIMULATED_VALUES.has(env[key]),
    );
    if (simulatedCritical.length > 0) {
      throw new EnvValidationError([
        `ports critiques encore simulés en production : ${simulatedCritical.join(', ')}. ` +
          'Fournissez une implémentation réelle, ou posez explicitement ' +
          'ALLOW_MOCK_PROVIDERS_IN_PRODUCTION=true en connaissance de cause (voir docs/MOCKS.md).',
      ]);
    }
  }

  // Les échéances SLA doivent rester ordonnées : un cas critique traité plus tard
  // qu'un cas de spam inverserait silencieusement toute la file de modération.
  const sla = [env.SLA_HOURS_P0, env.SLA_HOURS_P1, env.SLA_HOURS_P2, env.SLA_HOURS_P3];
  const ordonnees = sla.every((heures, index) => index === 0 || sla[index - 1]! < heures);
  if (!ordonnees) {
    throw new EnvValidationError([
      `les échéances SLA doivent être strictement croissantes de P0 à P3 (obtenu : ${sla.join(' < ')}). ` +
        'Une échéance critique plus longue qu’une échéance basse inverserait la file de modération.',
    ]);
  }

  if (env.S3_MEDIA_BUCKET === env.S3_KYC_BUCKET) {
    throw new EnvValidationError([
      'S3_MEDIA_BUCKET et S3_KYC_BUCKET doivent être deux buckets distincts : ' +
        'les pièces d’identité ne partagent jamais le stockage des photos de profil (ADR-004).',
    ]);
  }

  if (env.MIN_PHOTOS_TO_PUBLISH > env.MAX_PHOTOS) {
    throw new EnvValidationError(['MIN_PHOTOS_TO_PUBLISH ne peut pas dépasser MAX_PHOTOS.']);
  }

  return env;
}
