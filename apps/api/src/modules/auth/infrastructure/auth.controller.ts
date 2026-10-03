import { Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorCode, registerSchema, verifyOtpSchema } from '@acuba/contracts';
import type { Request, Response } from 'express';
import { Auth } from '../../../common/auth/auth.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../../common/auth/auth.guard';
import { ZodBody } from '../../../common/validation/zod.pipe';
import { RegisterUseCase } from '../application/register.use-case';
import { VerifyOtpUseCase, type AuthTokens } from '../application/verify-otp.use-case';
import { RefreshTokenUseCase } from '../application/refresh-token.use-case';
import {
  ListSessionsUseCase,
  LogoutAllUseCase,
  LogoutUseCase,
  RevokeSessionUseCase,
} from '../application/session.use-cases';
import { BusinessError } from '../../../common/errors/business.error';
import { refreshSchema } from './auth.schemas';
import { SessionCookie } from './session-cookie';

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
    private readonly cookie: SessionCookie,
  ) {}

  // Limitation par IP : avant l'inscription il n'y a pas de compte à qui imputer
  // les appels. Un second compteur, par empreinte de NUMÉRO, vit dans le cas
  // d'usage — les deux sont nécessaires : l'un freine le balayage depuis une
  // machine, l'autre le harcèlement d'un numéro depuis plusieurs.
  @Auth({ level: 'public', rateLimit: 'auth.register' })
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

  @Auth({ level: 'public', rateLimit: 'auth.otp.verify' })
  @Post('otp/verify')
  @ApiOperation({ summary: 'Valider un code OTP et ouvrir une session' })
  async postVerifyOtp(
    @ZodBody(verifyOtpSchema) body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
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

    // Un navigateur reçoit le jeton de rafraîchissement en cookie `httpOnly`,
    // jamais dans le corps (story F-02). L'origine est contrôlée AVANT de
    // consommer le code : refuser après coup brûlerait un code valide.
    const web = input.device?.type === 'WEB';
    if (web) this.cookie.exigerOrigineAutorisee(request);

    const tokens = await this.verifyOtp.execute({
      challengeId: input.challengeId,
      code: input.code,
      device:
        input.device !== undefined && input.device.fingerprint !== undefined
          ? { ...input.device, fingerprint: input.device.fingerprint }
          : null,
      ipV4: truncateIp(request.ip),
      userAgent: request.headers['user-agent'] ?? null,
    });

    if (!web) return tokens;
    this.cookie.poser(response, tokens.refreshToken);
    return sansJetonDeRafraichissement(tokens);
  }

  @Auth({ level: 'public', rateLimit: 'auth.refresh' })
  @Post('refresh')
  @ApiOperation({ summary: 'Rotation du refresh token' })
  async postRefresh(
    @ZodBody(refreshSchema) body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<unknown> {
    const input = body as { refreshToken?: string };
    const contexte = {
      ipV4: truncateIp(request.ip),
      userAgent: request.headers['user-agent'] ?? null,
    };

    // Transport par corps : application mobile. Inchangé.
    if (input.refreshToken !== undefined) {
      return this.refresh.execute({ refreshToken: input.refreshToken, ...contexte });
    }

    // Transport par cookie : navigateur.
    this.cookie.exigerOrigineAutorisee(request);
    const refreshToken = this.cookie.lire(request);
    if (refreshToken === null) throw BusinessError.unauthorized(ErrorCode.AUTH_TOKEN_EXPIRED);

    let tokens: AuthTokens;
    try {
      tokens = await this.refresh.execute({ refreshToken, ...contexte });
    } catch (error) {
      // Refus métier — jeton expiré, révoqué, réutilisé, compte suspendu : il
      // ne servira plus jamais. Le laisser ferait échouer chaque chargement de
      // page sur la même erreur. Une panne passagère (base injoignable), en
      // revanche, ne dit RIEN du jeton : l'effacer déconnecterait la personne
      // pour un incident qui n'est pas le sien.
      if (error instanceof BusinessError) this.cookie.effacer(response);
      throw error;
    }

    this.cookie.poser(response, tokens.refreshToken);
    return sansJetonDeRafraichissement(tokens);
  }

  @Auth({ level: 'pending' })
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Déconnecter la session courante' })
  async postLogout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.logout.execute(user.sessionId);
    // Effacé APRÈS la révocation : si elle échoue, le cookie reste, et la
    // personne n'a pas l'illusion d'être déconnectée alors que la session vit.
    this.cookie.effacer(response);
  }

  @Auth({ level: 'pending' })
  @Post('logout-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Déconnecter tous les appareils' })
  async postLogoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ revoked: number }> {
    const resultat = await this.logoutAll.execute(user.id);
    this.cookie.effacer(response);
    return resultat;
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
 * Corps de réponse d'une session web : tout sauf le jeton de rafraîchissement,
 * qui voyage dans le cookie. Le renvoyer AUSSI dans le corps annulerait l'intérêt
 * du cookie — le script injecté le lirait là.
 */
function sansJetonDeRafraichissement(tokens: AuthTokens): Omit<AuthTokens, 'refreshToken'> {
  const { refreshToken: _retire, ...reste } = tokens;
  return reste;
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
