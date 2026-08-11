import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import type { ClockProvider, SmsProvider } from '../../../providers/ports';
import type { AnalyticsTracker, InviteResolver } from '../../analytics/application/ports';
import { PhoneNumber } from '../domain/phone-number';
import { decideRegistration } from '../domain/registration-policy';
import type {
  BlockedIdentityRepository,
  ConsentRepository,
  Hasher,
  OtpChallengeRepository,
  RateLimiter,
  TokenService,
  UserRepository,
} from './ports';

export interface RegisterCommand {
  phoneE164: string;
  birthDate: string;
  gender: 'FEMALE' | 'MALE';
  /** Code d'invitation saisi ou porté par le lien ; résolu côté serveur (story D10-02). */
  inviteCode: string | null;
  consents: Array<{ type: string; documentVersion: string; granted: boolean }>;
  ipV4: string | null;
  deviceFingerprint: string | null;
}

export interface RegisterResult {
  challengeId: string;
  expiresAt: Date;
  resendAvailableAt: Date;
  /** Vrai tant que l'envoi de SMS est simulé (docs/MOCKS.md). */
  testMode: boolean;
}

export interface RegisterConfig {
  minimumAge: number;
  otpTtlSeconds: number;
  otpMaxAttempts: number;
  otpRateLimitPerWindow: number;
  otpRateWindowSeconds: number;
}

/**
 * Inscription par numéro de téléphone (story D1-02) et refus des mineurs (story D1-03).
 *
 * Trois garanties portées par ce cas d'usage :
 *   1. l'âge est calculé côté serveur ; aucune valeur d'âge cliente n'est lue ;
 *   2. un refus pour minorité est DÉFINITIF : compte marqué `BLOCKED_UNDERAGE` et
 *      empreinte du numéro versée en liste noire, ce qui empêche la ré-inscription ;
 *   3. les réponses ne révèlent jamais si un numéro est déjà connu.
 */
export class RegisterUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly otp: OtpChallengeRepository,
    private readonly blocked: BlockedIdentityRepository,
    private readonly consents: ConsentRepository,
    private readonly hasher: Hasher,
    private readonly tokens: TokenService,
    private readonly sms: SmsProvider,
    private readonly clock: ClockProvider,
    private readonly limiter: RateLimiter,
    private readonly invites: InviteResolver,
    private readonly analytics: AnalyticsTracker,
    private readonly config: RegisterConfig,
  ) {}

  async execute(command: RegisterCommand): Promise<RegisterResult> {
    const phone = PhoneNumber.create(command.phoneE164);
    const phoneHash = this.hasher.hash(phone.value);
    const now = this.clock.now();

    const quota = await this.limiter.hit(
      `otp:${phoneHash}`,
      this.config.otpRateLimitPerWindow,
      this.config.otpRateWindowSeconds,
    );
    if (!quota.allowed) throw BusinessError.rateLimited();

    const identityBlocked = await this.blocked.isBlocked({
      phoneHash,
      ...(command.deviceFingerprint ? { deviceFingerprint: command.deviceFingerprint } : {}),
    });

    const decision = decideRegistration({
      birthDate: new Date(`${command.birthDate}T00:00:00.000Z`),
      now,
      minimumAge: this.config.minimumAge,
      identityBlocked,
    });

    if (!decision.eligible) {
      await this.handleRefusal(decision.reason, phone, phoneHash, command);
      // Message volontairement neutre : il ne dit pas si le numéro est déjà connu.
      throw BusinessError.forbidden(
        decision.reason === 'UNDERAGE'
          ? ErrorCode.AUTH_UNDERAGE
          : decision.reason === 'BLOCKED_IDENTITY'
            ? ErrorCode.AUTH_IDENTITY_BLOCKED
            : ErrorCode.VALIDATION_FAILED,
      );
    }

    const existing = await this.users.findByPhoneHash(phoneHash);
    if (existing !== null && existing.phoneVerified) {
      throw BusinessError.conflict(ErrorCode.AUTH_PHONE_ALREADY_USED);
    }

    // Le code est résolu ICI, jamais accepté tel quel : le client envoie une
    // chaîne, le serveur décide si elle correspond à un lien utilisable. Un code
    // invalide n'empêche pas l'inscription — il est simplement ignoré. Refuser
    // l'inscription pour un code périmé ferait perdre la personne, alors que le
    // seul enjeu est de savoir d'où elle vient.
    const invitation =
      command.inviteCode === null ? null : await this.invites.resolveForSignup(command.inviteCode);

    const user =
      existing ??
      (await this.users.create({
        phoneE164: phone.value,
        phoneHash,
        birthDate: new Date(`${command.birthDate}T00:00:00.000Z`),
        gender: command.gender,
        countryCode: phone.countryCode?.replace('+', '') ?? null,
        accountStatus: 'PENDING_OTP',
        usedInviteId: invitation?.inviteId ?? null,
        registrationIpV4: command.ipV4,
      }));

    await this.analytics.track({
      userId: user.id,
      name: 'signup.started',
      campaignCode: invitation?.campaignCode ?? null,
      ...(invitation?.campaignCode == null
        ? {}
        : { properties: { campaignCode: invitation.campaignCode } }),
    });

    await this.consents.recordMany(
      user.id,
      command.consents.map((consent) => ({
        ...consent,
        ipV4: command.ipV4,
        channel: 'api',
      })),
    );

    return this.issueChallenge(user.id, phone, now);
  }

  private async handleRefusal(
    reason: 'UNDERAGE' | 'BLOCKED_IDENTITY' | 'IMPLAUSIBLE_BIRTHDATE',
    phone: PhoneNumber,
    phoneHash: string,
    command: RegisterCommand,
  ): Promise<void> {
    if (reason !== 'UNDERAGE') return;

    // Le refus doit survivre à la tentative : on conserve une empreinte, jamais le
    // numéro en clair, et le compte éventuellement créé devient définitivement inerte.
    const existing = await this.users.findByPhoneHash(phoneHash);
    if (existing !== null) {
      await this.users.updateAccountStatus(existing.id, 'BLOCKED_UNDERAGE');
    } else {
      await this.users.create({
        phoneE164: phone.value,
        phoneHash,
        birthDate: new Date(`${command.birthDate}T00:00:00.000Z`),
        gender: command.gender,
        countryCode: phone.countryCode?.replace('+', '') ?? null,
        accountStatus: 'BLOCKED_UNDERAGE',
        usedInviteId: null,
        registrationIpV4: command.ipV4,
      });
    }

    await this.blocked.block({
      phoneHash,
      ...(command.deviceFingerprint ? { deviceFingerprint: command.deviceFingerprint } : {}),
      reason: 'UNDERAGE',
      notes: 'Refus automatique : âge minimum non atteint.',
    });
  }

  private async issueChallenge(
    userId: string,
    phone: PhoneNumber,
    now: Date,
  ): Promise<RegisterResult> {
    const code = this.tokens.generateOtpCode();
    const expiresAt = new Date(now.getTime() + this.config.otpTtlSeconds * 1000);

    const challenge = await this.otp.create({
      userId,
      purpose: 'REGISTRATION',
      codeHash: this.hasher.hash(code),
      destination: phone.value,
      maxAttempts: this.config.otpMaxAttempts,
      expiresAt,
    });

    await this.sms.sendOtp(phone.value, code);

    return {
      challengeId: challenge.id,
      expiresAt,
      resendAvailableAt: new Date(now.getTime() + 60_000),
      testMode: this.sms.simulated,
    };
  }
}
