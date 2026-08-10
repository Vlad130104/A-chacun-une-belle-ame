import {
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '../../../common/auth/auth.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../../common/auth/auth.guard';
import { ZodBody } from '../../../common/validation/zod.pipe';
import { REFERENTIAL_REPOSITORY, type ReferentialRepository } from '../application/ports';
import { PreferenceService, ProfileService } from '../application/profile.use-cases';
import {
  DeletePhotoUseCase,
  ListModerationQueueUseCase,
  ListOwnPhotosUseCase,
  ModeratePhotoUseCase,
  ReorderPhotosUseCase,
  SetPrimaryPhotoUseCase,
  UploadPhotoUseCase,
} from '../application/photo.use-cases';
import type { ProfileStatusValue } from '../domain/profile-policy';
import {
  photoModerationSchema,
  preferencesSchema,
  profileStatusSchema,
  profileUpdateSchema,
  reorderPhotosSchema,
} from './profiles.schemas';

interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
}

/** Profil et préférences du membre (tranche D3). */
@ApiTags('profile')
@Controller('profile')
export class ProfileController {
  constructor(
    private readonly profiles: ProfileService,
    private readonly preferences: PreferenceService,
  ) {}

  @Auth({ level: 'pending' })
  @Get('me')
  @ApiOperation({ summary: 'Mon profil, son taux de complétion et ce qu’il reste à faire' })
  async getMe(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.profiles.getOwn(user.id);
  }

  @Auth({ level: 'pending' })
  @Patch('me')
  @ApiOperation({ summary: 'Créer ou mettre à jour le profil' })
  async patchMe(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(profileUpdateSchema) body: unknown,
  ): Promise<unknown> {
    return this.profiles.createOrUpdate(user.id, body as Record<string, never>);
  }

  @Auth({ level: 'pending' })
  @Post('me/publish')
  @ApiOperation({ summary: 'Publier le profil' })
  async publish(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.profiles.publish(user.id);
  }

  @Auth()
  @Patch('me/status')
  @ApiOperation({ summary: 'Activer, mettre en pause ou désactiver le profil' })
  async patchStatus(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(profileStatusSchema) body: unknown,
  ): Promise<unknown> {
    const { status } = body as { status: ProfileStatusValue };
    return this.profiles.changeStatus(user.id, status);
  }

  @Auth({ level: 'pending' })
  @Get('me/preferences')
  @ApiOperation({ summary: 'Mes critères de recherche' })
  async getPreferences(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return { preferences: await this.preferences.get(user.id) };
  }

  @Auth({ level: 'pending' })
  @Put('me/preferences')
  @ApiOperation({ summary: 'Remplacer mes critères de recherche' })
  async putPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(preferencesSchema) body: unknown,
  ): Promise<unknown> {
    // Le droit Premium est résolu côté serveur ; il arrive avec la tranche D7.
    // Jusque-là, aucun filtre avancé n'est accordé — fermé plutôt qu'ouvert.
    const premiumEntitled = false;
    return this.preferences.save(user.id, body as never, premiumEntitled);
  }
}

/** Photos de profil (tranche D3). */
@ApiTags('profile')
@Controller('media/photos')
export class PhotoController {
  constructor(
    private readonly upload: UploadPhotoUseCase,
    private readonly list: ListOwnPhotosUseCase,
    private readonly remove: DeletePhotoUseCase,
    private readonly reorder: ReorderPhotosUseCase,
    private readonly setPrimary: SetPrimaryPhotoUseCase,
  ) {}

  @Auth({ level: 'pending' })
  @Get()
  @ApiOperation({ summary: 'Mes photos, avec URL signées de courte durée' })
  async getPhotos(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return { items: await this.list.execute(user.id) };
  }

  @Auth({ level: 'pending' })
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Envoyer une photo (placée en modération avant publication)' })
  async postPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedFileLike | undefined,
  ): Promise<unknown> {
    const resultat = await this.upload.execute(user.id, file?.buffer ?? Buffer.alloc(0));

    // Le signal de doublon part vers la modération ; il n'est pas exposé au membre,
    // qui n'a pas à savoir sur quels autres comptes une image a été vue.
    return { photo: resultat.photo };
  }

  @Auth({ level: 'pending', owner: true })
  @Delete(':photoId')
  @ApiOperation({ summary: 'Supprimer une photo' })
  async deletePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('photoId') photoId: string,
  ): Promise<{ deleted: true }> {
    await this.remove.execute(user.id, photoId);
    return { deleted: true };
  }

  @Auth({ level: 'pending', owner: true })
  @Patch('order')
  @ApiOperation({ summary: 'Réordonner les photos' })
  async patchOrder(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(reorderPhotosSchema) body: unknown,
  ): Promise<{ reordered: true }> {
    const { orderedIds } = body as { orderedIds: string[] };
    await this.reorder.execute(user.id, orderedIds);
    return { reordered: true };
  }

  @Auth({ level: 'pending', owner: true })
  @Post(':photoId/primary')
  @ApiOperation({ summary: 'Définir la photo principale (doit être approuvée)' })
  async postPrimary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('photoId') photoId: string,
  ): Promise<{ primary: true }> {
    await this.setPrimary.execute(user.id, photoId);
    return { primary: true };
  }
}

/** Référentiels fermés, nécessaires à la saisie du profil (story D3-10). */
@ApiTags('profile')
@Controller('referentials')
export class ReferentialController {
  constructor(
    @Inject(REFERENTIAL_REPOSITORY) private readonly referentials: ReferentialRepository,
  ) {}

  @Auth({ level: 'pending' })
  @Get('interests')
  @ApiOperation({ summary: 'Centres d’intérêt et valeurs disponibles' })
  async getInterests(@Query('ids') ids?: string): Promise<unknown> {
    const demandes = (ids ?? '').split(',').filter(Boolean);
    return { items: await this.referentials.resolveInterests(demandes) };
  }
}

/** File de modération des photos (story D3-05). */
@ApiTags('admin')
@Controller('admin/moderation/photos')
export class AdminPhotoModerationController {
  constructor(
    private readonly queue: ListModerationQueueUseCase,
    private readonly moderate: ModeratePhotoUseCase,
  ) {}

  @Auth({ permissions: ['moderation.content'], audit: 'moderation.photo.queue' })
  @Get()
  @ApiOperation({ summary: 'Photos en attente, de la plus ancienne à la plus récente' })
  async getQueue(@Query('limit') limit?: string): Promise<unknown> {
    const taille = Math.min(Number(limit ?? 25) || 25, 50);
    const items = await this.queue.execute(taille);
    return { items, nextCursor: null, hasMore: items.length === taille };
  }

  @Auth({ permissions: ['moderation.content'], audit: 'moderation.photo.decision' })
  @Post(':photoId/decision')
  @ApiOperation({ summary: 'Approuver, refuser ou masquer une photo' })
  async postDecision(
    @CurrentUser() moderator: AuthenticatedUser,
    @Param('photoId') photoId: string,
    @ZodBody(photoModerationSchema) body: unknown,
  ): Promise<unknown> {
    const input = body as { decision: 'APPROVE' | 'REJECT' | 'HIDE'; reason?: string };

    return this.moderate.execute({
      photoId,
      moderatorId: moderator.id,
      decision: input.decision,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });
  }
}
