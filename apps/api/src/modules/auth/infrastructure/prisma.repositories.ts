import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { CLOCK_PROVIDER, type ClockProvider } from '../../../providers/ports';
import type { AccountStatusValue } from '../domain/session-policy';
import type {
  BlockedIdentityRepository,
  ConsentRepository,
  CreateUserInput,
  DeviceRepository,
  OtpChallengeRecord,
  OtpChallengeRepository,
  SessionRecord,
  SessionRepository,
  UserRecord,
  UserRepository,
} from '../application/ports';

/**
 * Repositories Prisma du module `auth`.
 *
 * Frontière de module (docs/01-architecture.md §3) : ces repositories ne touchent que
 * les tables du domaine d'authentification. Aucun accès aux tables d'un autre module.
 */

/** Champs strictement nécessaires : on ne charge jamais un utilisateur entier « au cas où ». */
const USER_FIELDS = {
  id: true,
  phoneE164: true,
  phoneHash: true,
  phoneVerified: true,
  email: true,
  passwordHash: true,
  birthDate: true,
  accountStatus: true,
  verificationStatus: true,
  failedLoginCount: true,
  lockedUntil: true,
} as const;

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByPhoneHash(phoneHash: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { phoneHash },
      select: USER_FIELDS,
    });
    return user;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_FIELDS });
    return user;
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const user = await this.prisma.user.create({
      data: {
        phoneE164: input.phoneE164,
        phoneHash: input.phoneHash,
        birthDate: input.birthDate,
        gender: input.gender,
        countryCode: input.countryCode,
        accountStatus: input.accountStatus,
        usedInviteId: input.usedInviteId,
        registrationIpV4: input.registrationIpV4,
      },
      select: USER_FIELDS,
    });
    return user;
  }

  async markPhoneVerified(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { phoneVerified: true } });
  }

  async updateAccountStatus(userId: string, status: AccountStatusValue): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { accountStatus: status } });
  }

  async touchLastActive(userId: string, at: Date): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { lastActiveAt: at } });
  }
}

@Injectable()
export class PrismaOtpRepository implements OtpChallengeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: Parameters<OtpChallengeRepository['create']>[0],
  ): Promise<OtpChallengeRecord> {
    const challenge = await this.prisma.otpChallenge.create({
      data: {
        userId: input.userId,
        purpose: input.purpose,
        codeHash: input.codeHash,
        destination: input.destination,
        maxAttempts: input.maxAttempts,
        expiresAt: input.expiresAt,
      },
    });
    return challenge;
  }

  async findById(id: string): Promise<OtpChallengeRecord | null> {
    const challenge = await this.prisma.otpChallenge.findUnique({ where: { id } });
    return challenge;
  }

  async incrementAttempts(id: string): Promise<void> {
    await this.prisma.otpChallenge.update({
      where: { id },
      data: { attemptCount: { increment: 1 } },
    });
  }

  async consume(id: string, at: Date): Promise<void> {
    await this.prisma.otpChallenge.update({ where: { id }, data: { consumedAt: at } });
  }

  countRecentByUser(userId: string, since: Date): Promise<number> {
    return this.prisma.otpChallenge.count({
      where: { userId, createdAt: { gte: since } },
    });
  }
}

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK_PROVIDER) private readonly clock: ClockProvider,
  ) {}

  async create(input: Parameters<SessionRepository['create']>[0]): Promise<SessionRecord> {
    const session = await this.prisma.userSession.create({
      data: {
        userId: input.userId,
        familyId: input.familyId,
        refreshTokenHash: input.refreshTokenHash,
        deviceId: input.deviceId,
        expiresAt: input.expiresAt,
        ipV4: input.ipV4,
        userAgent: input.userAgent,
      },
    });
    return this.toRecord(session);
  }

  async findByRefreshTokenHash(hash: string): Promise<SessionRecord | null> {
    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash: hash },
    });
    return session === null ? null : this.toRecord(session);
  }

  async findById(id: string): Promise<SessionRecord | null> {
    const session = await this.prisma.userSession.findUnique({ where: { id } });
    return session === null ? null : this.toRecord(session);
  }

  async listActiveByUser(userId: string): Promise<SessionRecord[]> {
    const sessions = await this.prisma.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: this.clock.now() } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return sessions.map((session) => this.toRecord(session));
  }

  async markRotated(id: string, at: Date): Promise<void> {
    await this.prisma.userSession.update({ where: { id }, data: { lastUsedAt: at } });
  }

  async revoke(id: string, at: Date, reason: string): Promise<void> {
    await this.prisma.userSession.update({
      where: { id },
      data: { revokedAt: at, revokedReason: reason },
    });
  }

  async revokeFamily(familyId: string, at: Date, reason: string): Promise<number> {
    const result = await this.prisma.userSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: at, revokedReason: reason },
    });
    return result.count;
  }

  async revokeAllForUser(userId: string, at: Date, reason: string): Promise<number> {
    const result = await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: at, revokedReason: reason },
    });
    return result.count;
  }

  /**
   * `lastUsedAt` fait office de marqueur de rotation : il n'est renseigné que lorsque
   * le refresh token a effectivement servi à en produire un nouveau.
   */
  private toRecord(session: {
    id: string;
    userId: string;
    familyId: string;
    refreshTokenHash: string;
    deviceId: string | null;
    expiresAt: Date;
    revokedAt: Date | null;
    lastUsedAt: Date | null;
    createdAt: Date;
  }): SessionRecord {
    return {
      id: session.id,
      userId: session.userId,
      familyId: session.familyId,
      refreshTokenHash: session.refreshTokenHash,
      deviceId: session.deviceId,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      rotatedAt: session.lastUsedAt,
      lastUsedAt: session.lastUsedAt,
      createdAt: session.createdAt,
    };
  }
}

@Injectable()
export class PrismaDeviceRepository implements DeviceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: Parameters<DeviceRepository['upsert']>[0]): Promise<{ id: string }> {
    const device = await this.prisma.device.upsert({
      where: {
        userId_fingerprintHash: {
          userId: input.userId,
          fingerprintHash: input.fingerprintHash,
        },
      },
      update: {
        lastSeenAt: input.seenAt,
        pushToken: input.pushToken,
        appVersion: input.appVersion,
        osVersion: input.osVersion,
      },
      create: {
        userId: input.userId,
        fingerprintHash: input.fingerprintHash,
        type: input.type,
        model: input.model,
        osVersion: input.osVersion,
        appVersion: input.appVersion,
        pushToken: input.pushToken,
        lastSeenAt: input.seenAt,
      },
      select: { id: true },
    });
    return device;
  }

  countDistinctForUser(userId: string, since: Date): Promise<number> {
    return this.prisma.device.count({ where: { userId, createdAt: { gte: since } } });
  }
}

@Injectable()
export class PrismaBlockedIdentityRepository implements BlockedIdentityRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK_PROVIDER) private readonly clock: ClockProvider,
  ) {}

  async isBlocked(input: {
    phoneHash?: string;
    documentNumberHash?: string;
    deviceFingerprint?: string;
  }): Promise<boolean> {
    const conditions: Array<{
      phoneHash?: string;
      documentNumberHash?: string;
      deviceFingerprint?: string;
    }> = [];
    if (input.phoneHash !== undefined) conditions.push({ phoneHash: input.phoneHash });
    if (input.documentNumberHash !== undefined) {
      conditions.push({ documentNumberHash: input.documentNumberHash });
    }
    if (input.deviceFingerprint !== undefined) {
      conditions.push({ deviceFingerprint: input.deviceFingerprint });
    }

    if (conditions.length === 0) return false;

    const found = await this.prisma.blockedIdentity.findFirst({
      where: {
        AND: [
          { OR: conditions },
          // Une entrée expirée ne bloque plus ; un bannissement, lui, n'expire jamais.
          { OR: [{ expiresAt: null }, { expiresAt: { gt: this.clock.now() } }] },
        ],
      },
      select: { id: true },
    });
    return found !== null;
  }

  async block(input: Parameters<BlockedIdentityRepository['block']>[0]): Promise<void> {
    // Le blocage par numéro est unique et idempotent ; le blocage par appareil seul
    // n'a pas de clé unique et se contente d'ajouter une entrée.
    if (input.phoneHash !== undefined) {
      await this.prisma.blockedIdentity.upsert({
        where: { phoneHash: input.phoneHash },
        update: { reason: input.reason, notes: input.notes },
        create: {
          phoneHash: input.phoneHash,
          deviceFingerprint: input.deviceFingerprint,
          reason: input.reason,
          notes: input.notes,
        },
      });
      return;
    }

    await this.prisma.blockedIdentity.create({
      data: {
        deviceFingerprint: input.deviceFingerprint,
        reason: input.reason,
        notes: input.notes,
      },
    });
  }
}

@Injectable()
export class PrismaConsentRepository implements ConsentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordMany(
    userId: string,
    consents: Array<{
      type: string;
      documentVersion: string;
      granted: boolean;
      ipV4: string | null;
      channel: string;
    }>,
  ): Promise<void> {
    if (consents.length === 0) return;

    await this.prisma.consentRecord.createMany({
      data: consents.map((consent) => ({
        userId,
        type: consent.type as never,
        documentVersion: consent.documentVersion,
        granted: consent.granted,
        ipV4: consent.ipV4,
        channel: consent.channel,
      })),
    });
  }
}
