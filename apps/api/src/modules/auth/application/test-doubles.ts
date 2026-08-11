import { createHash } from 'node:crypto';
import type { ClockProvider, SmsProvider } from '../../../providers/ports';
import type { AnalyticsTracker, InviteResolver } from '../../analytics/application/ports';
import type { EventName } from '../../analytics/domain/event-schema';
import type {
  BlockedIdentityRepository,
  ConsentRepository,
  CreateUserInput,
  DeviceRepository,
  Hasher,
  OtpChallengeRecord,
  OtpChallengeRepository,
  OtpPurposeValue,
  RateLimiter,
  SessionRecord,
  SessionRepository,
  TokenService,
  UserRecord,
  UserRepository,
} from './ports';

/**
 * Implémentations en mémoire des ports d'authentification.
 *
 * Elles permettent de tester les règles critiques — refus des mineurs, détection de
 * réutilisation de token, quotas OTP — sans base de données, en millisecondes
 * (docs/09-plan-de-tests.md §1).
 */

export class FakeClock implements ClockProvider {
  constructor(private current = new Date('2026-08-06T12:00:00.000Z')) {}
  now(): Date {
    return new Date(this.current.getTime());
  }
  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
  advanceDays(days: number): void {
    this.advanceSeconds(days * 86_400);
  }
}

export class FakeHasher implements Hasher {
  hash(value: string): string {
    return createHash('sha256').update(`sel-de-test:${value}`).digest('hex');
  }
  equals(hash: string, value: string): boolean {
    return hash === this.hash(value);
  }
}

export class FakeTokenService implements TokenService {
  private counter = 0;
  readonly signed: string[] = [];

  signAccessToken(claims: Parameters<TokenService['signAccessToken']>[0]): Promise<string> {
    const token = `access.${claims.sub}.${claims.sid}`;
    this.signed.push(token);
    return Promise.resolve(token);
  }
  verifyAccessToken(): Promise<never> {
    return Promise.reject(new Error('non utilisé en test'));
  }
  generateRefreshToken(): string {
    return `refresh-${++this.counter}`;
  }
  generateOtpCode(): string {
    return '123456';
  }
  newId(): string {
    return `id-${++this.counter}`;
  }
}

export class RecordingSmsProvider implements SmsProvider {
  readonly name = 'RecordingSmsProvider';
  readonly simulated = true;
  readonly sent: Array<{ phone: string; code: string }> = [];

  sendOtp(phoneE164: string, code: string): Promise<void> {
    this.sent.push({ phone: phoneE164, code });
    return Promise.resolve();
  }
  sendTransactional(): Promise<void> {
    return Promise.resolve();
  }
}

export class InMemoryUserRepository implements UserRepository {
  readonly users = new Map<string, UserRecord>();
  private counter = 0;

  findByPhoneHash(phoneHash: string): Promise<UserRecord | null> {
    return Promise.resolve(
      [...this.users.values()].find((user) => user.phoneHash === phoneHash) ?? null,
    );
  }
  findById(id: string): Promise<UserRecord | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }
  create(input: CreateUserInput): Promise<UserRecord> {
    const user: UserRecord = {
      id: `user-${++this.counter}`,
      phoneE164: input.phoneE164,
      phoneHash: input.phoneHash,
      phoneVerified: false,
      email: null,
      passwordHash: null,
      birthDate: input.birthDate,
      accountStatus: input.accountStatus,
      verificationStatus: 'NOT_STARTED',
      failedLoginCount: 0,
      lockedUntil: null,
      usedInviteId: input.usedInviteId,
    };
    this.users.set(user.id, user);
    return Promise.resolve(user);
  }
  markPhoneVerified(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) this.users.set(userId, { ...user, phoneVerified: true });
    return Promise.resolve();
  }
  updateAccountStatus(userId: string, status: UserRecord['accountStatus']): Promise<void> {
    const user = this.users.get(userId);
    if (user) this.users.set(userId, { ...user, accountStatus: status });
    return Promise.resolve();
  }
  touchLastActive(): Promise<void> {
    return Promise.resolve();
  }
}

export class InMemoryOtpRepository implements OtpChallengeRepository {
  readonly challenges = new Map<string, OtpChallengeRecord>();
  private counter = 0;

  create(input: {
    userId: string;
    purpose: OtpPurposeValue;
    codeHash: string;
    destination: string;
    maxAttempts: number;
    expiresAt: Date;
  }): Promise<OtpChallengeRecord> {
    const challenge: OtpChallengeRecord = {
      id: `otp-${++this.counter}`,
      userId: input.userId,
      purpose: input.purpose,
      codeHash: input.codeHash,
      attemptCount: 0,
      maxAttempts: input.maxAttempts,
      expiresAt: input.expiresAt,
      consumedAt: null,
    };
    this.challenges.set(challenge.id, challenge);
    return Promise.resolve(challenge);
  }
  findById(id: string): Promise<OtpChallengeRecord | null> {
    return Promise.resolve(this.challenges.get(id) ?? null);
  }
  incrementAttempts(id: string): Promise<void> {
    const challenge = this.challenges.get(id);
    if (challenge) {
      this.challenges.set(id, { ...challenge, attemptCount: challenge.attemptCount + 1 });
    }
    return Promise.resolve();
  }
  consume(id: string, at: Date): Promise<void> {
    const challenge = this.challenges.get(id);
    if (challenge) this.challenges.set(id, { ...challenge, consumedAt: at });
    return Promise.resolve();
  }
  countRecentByUser(): Promise<number> {
    return Promise.resolve(0);
  }
}

export class InMemorySessionRepository implements SessionRepository {
  readonly sessions = new Map<string, SessionRecord>();
  private counter = 0;

  create(input: Parameters<SessionRepository['create']>[0]): Promise<SessionRecord> {
    const session: SessionRecord = {
      id: `session-${++this.counter}`,
      userId: input.userId,
      familyId: input.familyId,
      refreshTokenHash: input.refreshTokenHash,
      deviceId: input.deviceId,
      expiresAt: input.expiresAt,
      revokedAt: null,
      rotatedAt: null,
      lastUsedAt: null,
      createdAt: new Date('2026-08-06T12:00:00.000Z'),
    };
    this.sessions.set(session.id, session);
    return Promise.resolve(session);
  }
  findByRefreshTokenHash(hash: string): Promise<SessionRecord | null> {
    return Promise.resolve(
      [...this.sessions.values()].find((s) => s.refreshTokenHash === hash) ?? null,
    );
  }
  findById(id: string): Promise<SessionRecord | null> {
    return Promise.resolve(this.sessions.get(id) ?? null);
  }
  listActiveByUser(userId: string): Promise<SessionRecord[]> {
    return Promise.resolve(
      [...this.sessions.values()].filter(
        (s) => s.userId === userId && s.revokedAt === null && s.rotatedAt === null,
      ),
    );
  }
  markRotated(id: string, at: Date): Promise<void> {
    const session = this.sessions.get(id);
    if (session) this.sessions.set(id, { ...session, rotatedAt: at });
    return Promise.resolve();
  }
  revoke(id: string, at: Date): Promise<void> {
    const session = this.sessions.get(id);
    if (session) this.sessions.set(id, { ...session, revokedAt: at });
    return Promise.resolve();
  }
  revokeFamily(familyId: string, at: Date): Promise<number> {
    let count = 0;
    for (const [id, session] of this.sessions) {
      if (session.familyId === familyId && session.revokedAt === null) {
        this.sessions.set(id, { ...session, revokedAt: at });
        count += 1;
      }
    }
    return Promise.resolve(count);
  }
  revokeAllForUser(userId: string, at: Date): Promise<number> {
    let count = 0;
    for (const [id, session] of this.sessions) {
      if (session.userId === userId && session.revokedAt === null) {
        this.sessions.set(id, { ...session, revokedAt: at });
        count += 1;
      }
    }
    return Promise.resolve(count);
  }
}

export class InMemoryDeviceRepository implements DeviceRepository {
  readonly devices: Array<{ id: string; userId: string; fingerprintHash: string }> = [];

  upsert(input: { userId: string; fingerprintHash: string }): Promise<{ id: string }> {
    const existing = this.devices.find(
      (d) => d.userId === input.userId && d.fingerprintHash === input.fingerprintHash,
    );
    if (existing) return Promise.resolve({ id: existing.id });

    const device = {
      id: `device-${this.devices.length + 1}`,
      userId: input.userId,
      fingerprintHash: input.fingerprintHash,
    };
    this.devices.push(device);
    return Promise.resolve({ id: device.id });
  }
  countDistinctForUser(userId: string): Promise<number> {
    return Promise.resolve(this.devices.filter((d) => d.userId === userId).length);
  }
}

export class InMemoryBlockedIdentityRepository implements BlockedIdentityRepository {
  readonly entries: Array<{
    phoneHash?: string;
    deviceFingerprint?: string;
    reason: string;
  }> = [];

  isBlocked(input: { phoneHash?: string; deviceFingerprint?: string }): Promise<boolean> {
    return Promise.resolve(
      this.entries.some(
        (entry) =>
          (input.phoneHash !== undefined && entry.phoneHash === input.phoneHash) ||
          (input.deviceFingerprint !== undefined &&
            entry.deviceFingerprint === input.deviceFingerprint),
      ),
    );
  }
  block(input: {
    phoneHash?: string;
    deviceFingerprint?: string;
    reason: 'BANNED' | 'UNDERAGE' | 'SELF_DELETED' | 'FRAUD';
  }): Promise<void> {
    this.entries.push(input);
    return Promise.resolve();
  }
}

export class InMemoryConsentRepository implements ConsentRepository {
  readonly recorded: Array<{ userId: string; type: string; documentVersion: string }> = [];

  recordMany(
    userId: string,
    consents: Array<{ type: string; documentVersion: string }>,
  ): Promise<void> {
    for (const consent of consents) {
      this.recorded.push({ userId, ...consent });
    }
    return Promise.resolve();
  }
}

export class PermissiveRateLimiter implements RateLimiter {
  readonly hits: string[] = [];
  private blockedKeys = new Set<string>();

  block(key: string): void {
    this.blockedKeys.add(key);
  }
  hit(key: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    this.hits.push(key);
    return Promise.resolve(
      this.blockedKeys.has(key)
        ? { allowed: false, retryAfterSeconds: 60 }
        : { allowed: true, retryAfterSeconds: 0 },
    );
  }
  reset(key: string): Promise<void> {
    this.blockedKeys.delete(key);
    return Promise.resolve();
  }
}

/**
 * Traceur analytique de test.
 *
 * Il enregistre les événements sans jamais échouer : les tests d'inscription
 * vérifient le parcours, pas l'analytique. Une doublure qui rejetterait
 * masquerait la garantie même du traceur réel — ne pas interrompre le service.
 */
export class RecordingAnalyticsTracker implements AnalyticsTracker {
  readonly events: { userId: string | null; name: EventName }[] = [];

  track(input: { userId: string | null; name: EventName }): Promise<void> {
    this.events.push({ userId: input.userId, name: input.name });
    return Promise.resolve();
  }
}

/** Résolveur d'invitation de test : rend ce qu'on lui a demandé de rendre. */
export class StubInviteResolver implements InviteResolver {
  readonly demandes: string[] = [];
  reponse: { inviteId: string; campaignCode: string | null } | null = null;

  resolveForSignup(
    code: string,
  ): Promise<{ inviteId: string; campaignCode: string | null } | null> {
    this.demandes.push(code);
    return Promise.resolve(this.reponse);
  }
}
