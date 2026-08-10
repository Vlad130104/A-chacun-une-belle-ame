import type { AccountStatusValue } from '../domain/session-policy';

/**
 * Dépendances sortantes des cas d'usage d'authentification.
 *
 * Les cas d'usage ne connaissent ni Prisma, ni Redis, ni Argon2 : ils dépendent de ces
 * interfaces, ce qui les rend testables avec des implémentations en mémoire, sans
 * infrastructure (docs/01-architecture.md §4).
 */

export const USER_REPOSITORY = Symbol('UserRepository');
export const OTP_REPOSITORY = Symbol('OtpChallengeRepository');
export const SESSION_REPOSITORY = Symbol('SessionRepository');
export const DEVICE_REPOSITORY = Symbol('DeviceRepository');
export const BLOCKED_IDENTITY_REPOSITORY = Symbol('BlockedIdentityRepository');
export const CONSENT_REPOSITORY = Symbol('ConsentRepository');
export const PASSWORD_HASHER = Symbol('PasswordHasher');
export const TOKEN_SERVICE = Symbol('TokenService');
export const RATE_LIMITER = Symbol('RateLimiter');
export const HASHER = Symbol('Hasher');

export interface UserRecord {
  id: string;
  phoneE164: string;
  phoneHash: string;
  phoneVerified: boolean;
  email: string | null;
  passwordHash: string | null;
  birthDate: Date | null;
  accountStatus: AccountStatusValue;
  verificationStatus: string;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

export interface CreateUserInput {
  phoneE164: string;
  phoneHash: string;
  birthDate: Date;
  gender: 'FEMALE' | 'MALE';
  countryCode: string | null;
  accountStatus: AccountStatusValue;
  usedInviteId: string | null;
  registrationIpV4: string | null;
}

export interface UserRepository {
  findByPhoneHash(phoneHash: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: CreateUserInput): Promise<UserRecord>;
  markPhoneVerified(userId: string): Promise<void>;
  updateAccountStatus(userId: string, status: AccountStatusValue): Promise<void>;
  touchLastActive(userId: string, at: Date): Promise<void>;
}

export type OtpPurposeValue =
  'REGISTRATION' | 'LOGIN' | 'PHONE_CHANGE' | 'ACCOUNT_RECOVERY' | 'SENSITIVE_ACTION';

export interface OtpChallengeRecord {
  id: string;
  userId: string;
  purpose: OtpPurposeValue;
  codeHash: string;
  attemptCount: number;
  maxAttempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface OtpChallengeRepository {
  create(input: {
    userId: string;
    purpose: OtpPurposeValue;
    codeHash: string;
    destination: string;
    maxAttempts: number;
    expiresAt: Date;
  }): Promise<OtpChallengeRecord>;
  findById(id: string): Promise<OtpChallengeRecord | null>;
  incrementAttempts(id: string): Promise<void>;
  consume(id: string, at: Date): Promise<void>;
  countRecentByUser(userId: string, since: Date): Promise<number>;
}

export interface SessionRecord {
  id: string;
  userId: string;
  familyId: string;
  refreshTokenHash: string;
  deviceId: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  rotatedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface SessionRepository {
  create(input: {
    userId: string;
    familyId: string;
    refreshTokenHash: string;
    deviceId: string | null;
    expiresAt: Date;
    ipV4: string | null;
    userAgent: string | null;
  }): Promise<SessionRecord>;
  findByRefreshTokenHash(hash: string): Promise<SessionRecord | null>;
  findById(id: string): Promise<SessionRecord | null>;
  listActiveByUser(userId: string): Promise<SessionRecord[]>;
  markRotated(id: string, at: Date): Promise<void>;
  revoke(id: string, at: Date, reason: string): Promise<void>;
  revokeFamily(familyId: string, at: Date, reason: string): Promise<number>;
  revokeAllForUser(userId: string, at: Date, reason: string): Promise<number>;
}

export interface DeviceRepository {
  upsert(input: {
    userId: string;
    fingerprintHash: string;
    type: 'ANDROID' | 'IOS' | 'WEB';
    model: string | null;
    osVersion: string | null;
    appVersion: string | null;
    pushToken: string | null;
    seenAt: Date;
  }): Promise<{ id: string }>;
  countDistinctForUser(userId: string, since: Date): Promise<number>;
}

export interface BlockedIdentityRepository {
  isBlocked(input: {
    phoneHash?: string;
    documentNumberHash?: string;
    deviceFingerprint?: string;
  }): Promise<boolean>;
  block(input: {
    phoneHash?: string;
    deviceFingerprint?: string;
    reason: 'BANNED' | 'UNDERAGE' | 'SELF_DELETED' | 'FRAUD';
    notes?: string;
  }): Promise<void>;
}

export interface ConsentRepository {
  recordMany(
    userId: string,
    consents: Array<{
      type: string;
      documentVersion: string;
      granted: boolean;
      ipV4: string | null;
      channel: string;
    }>,
  ): Promise<void>;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}

/** Hachage non réversible et déterministe : empreintes de numéro, de code, de token. */
export interface Hasher {
  hash(value: string): string;
  /** Comparaison à temps constant. */
  equals(hash: string, value: string): boolean;
}

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  accountStatus: string;
  verificationStatus: string;
  roles: string[];
}

export interface TokenService {
  signAccessToken(claims: AccessTokenClaims): Promise<string>;
  verifyAccessToken(token: string): Promise<AccessTokenClaims>;
  /** Refresh token opaque : une valeur aléatoire, jamais un JWT. */
  generateRefreshToken(): string;
  generateOtpCode(): string;
  newId(): string;
}

export interface RateLimiter {
  /** Incrémente et indique si la limite est franchie. */
  hit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  reset(key: string): Promise<void>;
}
