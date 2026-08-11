import { Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Auth } from '../../../common/auth/auth.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../../common/auth/auth.guard';
import { ZodBody } from '../../../common/validation/zod.pipe';
import type { PreferenceEntry } from '../domain/notification-policy';
import {
  GetPreferencesUseCase,
  ListInboxUseCase,
  MarkNotificationReadUseCase,
  RegisterDeviceUseCase,
  UpdatePreferencesUseCase,
} from '../application/notification.use-cases';

const NOTIFICATION_TYPES = [
  'OTP_CODE',
  'VERIFICATION_APPROVED',
  'VERIFICATION_REJECTED',
  'VERIFICATION_ADDITIONAL',
  'NEW_MATCH',
  'NEW_MESSAGE',
  'NEW_INTEREST',
  'PROFILE_INCOMPLETE',
  'PHOTO_APPROVED',
  'PHOTO_REJECTED',
  'REPORT_UPDATED',
  'MODERATION_ACTION',
  'SUBSCRIPTION_RENEWED',
  'SUBSCRIPTION_FAILED',
  'SUBSCRIPTION_EXPIRING',
  'SECURITY_ALERT',
  'ACCOUNT_DELETION_REMINDER',
] as const;

const preferencesSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            type: z.enum(NOTIFICATION_TYPES),
            channel: z.enum(['IN_APP', 'PUSH', 'EMAIL', 'SMS']),
            enabled: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(80),
  })
  .strict();

const deviceSchema = z
  .object({
    /** Signaux client agrégés ; l'empreinte est recalculée côté serveur. */
    fingerprint: z.string().min(8).max(200),
    type: z.enum(['ANDROID', 'IOS', 'WEB']),
    model: z.string().max(120).nullable().default(null),
    osVersion: z.string().max(40).nullable().default(null),
    appVersion: z.string().max(40).nullable().default(null),
    pushToken: z.string().min(8).max(512).nullable().default(null),
  })
  .strict();

const limite = (valeur: string | undefined, defaut: number, max: number): number =>
  Math.min(Number(valeur ?? defaut) || defaut, max);

/**
 * Centre de notifications et préférences (tranche D8).
 *
 * Le niveau requis est `auth` partout : un membre en cours d'onboarding reçoit
 * déjà des notifications de vérification, il doit pouvoir les lire.
 */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly inbox: ListInboxUseCase,
    private readonly markRead: MarkNotificationReadUseCase,
    private readonly getPreferences: GetPreferencesUseCase,
    private readonly updatePreferences: UpdatePreferencesUseCase,
  ) {}

  @Auth({ rateLimit: 'notifications.list' })
  @Get()
  @ApiOperation({ summary: 'Centre de notifications, paginé, avec le compte de non-lues' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('unread') unread?: string,
  ): Promise<unknown> {
    return this.inbox.execute({
      userId: user.id,
      limit: limite(limit, 20, 50),
      cursor,
      unreadOnly: unread === 'true',
    });
  }

  @Auth({ owner: true })
  @Post(':notificationId/read')
  @ApiOperation({ summary: 'Marquer une notification comme lue' })
  async read(
    @CurrentUser() user: AuthenticatedUser,
    @Param('notificationId') notificationId: string,
  ): Promise<{ read: true }> {
    return this.markRead.execute(user.id, notificationId);
  }

  @Auth()
  @Post('read-all')
  @ApiOperation({ summary: 'Tout marquer comme lu' })
  async readAll(@CurrentUser() user: AuthenticatedUser): Promise<{ updated: number }> {
    return this.markRead.all(user.id);
  }

  @Auth()
  @Get('preferences')
  @ApiOperation({
    summary: 'Préférences par type et canal — les types de sécurité sont verrouillés',
  })
  async preferences(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.getPreferences.execute(user.id);
  }

  /**
   * Le verrou `locked` rendu par le GET sert l'affichage. Le refus réel est
   * appliqué ICI, côté serveur : un appel direct qui tenterait de désactiver
   * une notification de sécurité reçoit 403 `NOTIF_MANDATORY_TYPE`,
   * indépendamment de ce que fait l'interface (story D8-04).
   */
  @Auth({ rateLimit: 'notifications.preferences' })
  @Put('preferences')
  @ApiOperation({ summary: 'Mettre à jour — les types de sécurité sont rejetés côté serveur' })
  async savePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(preferencesSchema) body: unknown,
  ): Promise<{ updated: number }> {
    const input = body as { entries: PreferenceEntry[] };
    return this.updatePreferences.execute(user.id, input.entries);
  }
}

/**
 * Appareils et jetons push.
 *
 * Le jeton push n'est **jamais** rendu par une route : seule sa présence est
 * signalée. Un jeton exfiltré permettrait d'envoyer des notifications à la place
 * de la plateforme.
 */
@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: RegisterDeviceUseCase) {}

  @Auth()
  @Get()
  @ApiOperation({ summary: 'Mes appareils — le jeton push n’est jamais rendu' })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.devices.list(user.id);
  }

  @Auth({ rateLimit: 'devices.register' })
  @Post()
  @ApiOperation({ summary: 'Enregistrer un appareil et son jeton push' })
  async register(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(deviceSchema) body: unknown,
  ): Promise<{ id: string }> {
    const input = body as z.infer<typeof deviceSchema>;

    return this.devices.execute({
      userId: user.id,
      // Transmise brute : c'est le cas d'usage qui la hache, avec le sel du
      // serveur. Elle n'est jamais stockée en clair.
      fingerprint: input.fingerprint,
      type: input.type,
      model: input.model,
      osVersion: input.osVersion,
      appVersion: input.appVersion,
      pushToken: input.pushToken,
    });
  }

  @Auth({ owner: true })
  @Delete(':deviceId')
  @ApiOperation({ summary: 'Retirer un appareil et effacer son jeton' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deviceId') deviceId: string,
  ): Promise<{ removed: true }> {
    return this.devices.remove(user.id, deviceId);
  }
}
