import { Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { registerSchema, verifyOtpSchema } from '@acuba/contracts';
import type { Request } from 'express';
import { Auth, Public } from '../../../common/auth/auth.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../../common/auth/auth.guard';
import { ZodBody } from '../../../common/validation/zod.pipe';
import { RegisterUseCase } from '../application/register.use-case';
import { VerifyOtpUseCase } from '../application/verify-otp.use-case';
import { RefreshTokenUseCase } from '../application/refresh-token.use-case';
import {
  ListSessionsUseCase,
  LogoutAllUseCase,
  LogoutUseCase,
  RevokeSessionUseCase,
} from '../application/session.use-cases';
import { refreshSchema } from './auth.schemas';

/**
 * Routes d'authentification (tranche D1).
 *
 * Chaque route déclare sa politique — le test d'inventaire échoue sinon
 * (docs/06-roles-et-permissions.md §6).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly register: RegisterUseCase,
    private readonly verifyOtp: VerifyOtpUseCase,
    private readonly refresh: RefreshTokenUseCase,
    private readonly logout: LogoutUseCase,
    private readonly logoutAll: LogoutAllUseCase,
    private readonly listSessions: ListSessionsUseCase,
    private readonly revokeSession: RevokeSessionUseCase,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(202)
  @ApiOperation({ summary: 'Inscription par numéro de téléphone' })
  async postRegister(
    @ZodBody(registerSchema) body: unknown,
    @Req() request: Request,
  ): Promise<unknown> {
    const input = body as {
      phoneE164: string;
      birthDate: string;
      gender: 'FEMALE' | 'MALE';
      inviteCode?: string;
      consents: Array<{ type: string; documentVersion: string; granted: boolean }>;
      device?: { fingerprint?: string };
    };

    return this.register.execute({
      phoneE164: input.phoneE164,
      birthDate: input.birthDate,
      gender: input.gender,
      inviteCode: input.inviteCode ?? null,
      consents: input.consents,
      ipV4: truncateIp(request.ip),
      deviceFingerprint: input.device?.fingerprint ?? null,
    });
  }

  @Public()
  @Post('otp/verify')
  @ApiOperation({ summary: 'Valider un code OTP et ouvrir une session' })
  async postVerifyOtp(
    @ZodBody(verifyOtpSchema) body: unknown,
    @Req() request: Request,
  ): Promise<unknown> {
    const input = body as {
      challengeId: string;
      code: string;
      device?: {
        type: 'ANDROID' | 'IOS' | 'WEB';
        fingerprint?: string;
        model?: string;
        osVersion?: string;
        appVersion?: string;
        pushToken?: string;
      };
    };

    return this.verifyOtp.execute({
      challengeId: input.challengeId,
      code: input.code,
      device:
        input.device !== undefined && input.device.fingerprint !== undefined
          ? { ...input.device, fingerprint: input.device.fingerprint }
          : null,
      ipV4: truncateIp(request.ip),
      userAgent: request.headers['user-agent'] ?? null,
    });
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rotation du refresh token' })
  async postRefresh(
    @ZodBody(refreshSchema) body: unknown,
    @Req() request: Request,
  ): Promise<unknown> {
    const input = body as { refreshToken: string };
    return this.refresh.execute({
      refreshToken: input.refreshToken,
      ipV4: truncateIp(request.ip),
      userAgent: request.headers['user-agent'] ?? null,
    });
  }

  @Auth({ level: 'pending' })
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Déconnecter la session courante' })
  async postLogout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.logout.execute(user.sessionId);
  }

  @Auth({ level: 'pending' })
  @Post('logout-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Déconnecter tous les appareils' })
  async postLogoutAll(@CurrentUser() user: AuthenticatedUser): Promise<{ revoked: number }> {
    return this.logoutAll.execute(user.id);
  }

  @Auth({ level: 'pending' })
  @Get('sessions')
  @ApiOperation({ summary: 'Lister les sessions et appareils actifs' })
  async getSessions(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    const items = await this.listSessions.execute(user.id, user.sessionId);
    return { items, nextCursor: null, hasMore: false };
  }

  @Auth({ level: 'pending', owner: true })
  @Delete('sessions/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Déconnecter un appareil' })
  async deleteSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') sessionId: string,
  ): Promise<void> {
    await this.revokeSession.execute(user.id, sessionId);
  }

  @Auth({ level: 'pending' })
  @Get('me')
  @ApiOperation({ summary: 'Compte courant et étape d’onboarding suivante' })
  getMe(@CurrentUser() user: AuthenticatedUser): unknown {
    return {
      id: user.id,
      accountStatus: user.accountStatus,
      verificationStatus: user.verificationStatus,
      nextOnboardingStep:
        user.verificationStatus === 'VERIFIED' ? 'COMPLETE_PROFILE' : 'VERIFY_IDENTITY',
    };
  }
}

/**
 * Une IP est une donnée personnelle : on ne conserve que les trois premiers octets
 * (SECURITY.md §4.3).
 */
function truncateIp(ip: string | undefined): string | null {
  if (ip === undefined) return null;
  const parts = ip.replace('::ffff:', '').split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0` : null;
}
