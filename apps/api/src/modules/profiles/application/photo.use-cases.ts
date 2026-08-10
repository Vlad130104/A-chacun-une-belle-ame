import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import type { ClockProvider } from '../../../providers/ports';
import {
  canAddPhoto,
  canBePrimary,
  computeReorder,
  looksLikeSameImage,
  nextPosition,
  type PhotoStatusValue,
} from '../domain/photo-policy';
import type {
  MediaPipeline,
  MediaStorage,
  PhotoRecord,
  PhotoRepository,
  ProfileRepository,
} from './ports';

export interface PhotoConfig {
  maxPhotos: number;
  signedUrlTtlSeconds: number;
  softDeleteDays: number;
}

export interface PhotoView {
  id: string;
  position: number;
  status: PhotoStatusValue;
  url: string | null;
  thumbnailUrl: string | null;
  moderationReason: string | null;
}

/** Résultat d'un envoi, incluant les signaux transmis à la modération. */
export interface UploadResult {
  photo: PhotoView;
  /** Vrai si la même image existe déjà sur un autre compte (story D3-11). */
  duplicateAcrossAccounts: boolean;
}

/**
 * Envoi d'une photo de profil (stories D3-03, D3-04, D3-09, D3-11).
 *
 * Ordre volontaire : traitement de l'image AVANT toute écriture. Un fichier invalide
 * ne doit jamais atteindre le stockage — ni consommer une place dans la grille.
 */
export class UploadPhotoUseCase {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly storage: MediaStorage,
    private readonly pipeline: MediaPipeline,
    private readonly config: PhotoConfig,
  ) {}

  async execute(userId: string, bytes: Buffer): Promise<UploadResult> {
    const existantes = await this.photos.listByUser(userId);

    if (!canAddPhoto(existantes, this.config.maxPhotos)) {
      throw BusinessError.conflict(ErrorCode.MEDIA_MAX_PHOTOS, { maximum: this.config.maxPhotos });
    }

    const position = nextPosition(existantes, this.config.maxPhotos);
    if (position === null) throw BusinessError.conflict(ErrorCode.MEDIA_MAX_PHOTOS);

    // Le pipeline valide le format réel, retire les métadonnées et ré-encode :
    // il lève une erreur métier avant toute écriture si l'image est inexploitable.
    const traitee = await this.pipeline.process(bytes);

    const doublons = await this.photos.findByPerceptualHash(traitee.perceptualHash, userId);
    const duplicateAcrossAccounts = doublons.some((autre) =>
      looksLikeSameImage(autre.perceptualHash ?? '', traitee.perceptualHash),
    );

    const base = `media/${userId}/${traitee.perceptualHash}`;
    await this.storage.put(`${base}.webp`, traitee.full, traitee.contentType);
    await this.storage.put(`${base}-thumb.webp`, traitee.thumbnail, traitee.contentType);

    const photo = await this.photos.create({
      userId,
      storageKey: `${base}.webp`,
      thumbnailStorageKey: `${base}-thumb.webp`,
      position,
      width: traitee.width,
      height: traitee.height,
      sizeBytes: traitee.full.length,
      contentType: traitee.contentType,
      perceptualHash: traitee.perceptualHash,
    });

    return {
      // Une photo fraîchement envoyée est en modération : invisible des autres membres.
      photo: await toView(photo, this.storage, this.config.signedUrlTtlSeconds, true),
      duplicateAcrossAccounts,
    };
  }
}

/** Liste des photos du membre, avec URLs signées de courte durée. */
export class ListOwnPhotosUseCase {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly storage: MediaStorage,
    private readonly config: PhotoConfig,
  ) {}

  async execute(userId: string): Promise<PhotoView[]> {
    const photos = await this.photos.listByUser(userId);
    return Promise.all(
      photos
        .filter((photo) => photo.status !== 'DELETED')
        .map((photo) => toView(photo, this.storage, this.config.signedUrlTtlSeconds, true)),
    );
  }
}

export class DeletePhotoUseCase {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly profiles: ProfileRepository,
    private readonly clock: ClockProvider,
  ) {}

  async execute(userId: string, photoId: string): Promise<void> {
    const photo = await this.requireOwned(userId, photoId);
    await this.photos.softDelete(photo.id, this.clock.now());

    // Si la photo supprimée était la principale, le profil ne doit pas conserver une
    // référence morte : il repart sur la première photo approuvée disponible.
    const profile = await this.profiles.findByUserId(userId);
    if (profile?.primaryPhotoId === photo.id) {
      const restantes = await this.photos.listByUser(userId);
      const remplacante = restantes.find(
        (candidate) => candidate.id !== photo.id && candidate.status === 'APPROVED',
      );
      await this.profiles.setPrimaryPhoto(profile.id, remplacante?.id ?? null);
    }
  }

  private async requireOwned(userId: string, photoId: string): Promise<PhotoRecord> {
    const photo = await this.photos.findById(photoId);
    // 404 plutôt que 403 : la photo d'autrui ne voit pas son existence confirmée.
    if (photo === null || photo.userId !== userId || photo.status === 'DELETED') {
      throw BusinessError.notFound(ErrorCode.NOT_FOUND);
    }
    return photo;
  }
}

export class ReorderPhotosUseCase {
  constructor(private readonly photos: PhotoRepository) {}

  async execute(userId: string, orderedIds: string[]): Promise<void> {
    const existantes = await this.photos.listByUser(userId);
    const verdict = computeReorder(existantes, orderedIds);

    if (!verdict.valid) {
      throw BusinessError.badRequest(ErrorCode.VALIDATION_FAILED, { motif: verdict.reason });
    }

    await this.photos.updatePositions(verdict.positions);
  }
}

export class SetPrimaryPhotoUseCase {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly profiles: ProfileRepository,
  ) {}

  async execute(userId: string, photoId: string): Promise<void> {
    const photo = await this.photos.findById(photoId);
    if (photo === null || photo.userId !== userId) {
      throw BusinessError.notFound(ErrorCode.NOT_FOUND);
    }

    if (!canBePrimary(photo)) {
      throw BusinessError.conflict(ErrorCode.MEDIA_NOT_APPROVED);
    }

    const profile = await this.profiles.findByUserId(userId);
    if (profile === null) throw BusinessError.notFound(ErrorCode.NOT_FOUND);

    await this.profiles.setPrimaryPhoto(profile.id, photo.id);
  }
}

export interface PhotoModerationCommand {
  photoId: string;
  moderatorId: string;
  decision: 'APPROVE' | 'REJECT' | 'HIDE';
  reason?: string;
}

/**
 * Modération d'une photo (stories D3-05 et D3-06).
 *
 * Un refus DOIT porter un motif : « refusée » sans explication produit un abandon,
 * et rend la décision incontestable pour le membre.
 */
export class ModeratePhotoUseCase {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly profiles: ProfileRepository,
    private readonly clock: ClockProvider,
  ) {}

  async execute(command: PhotoModerationCommand): Promise<{ status: PhotoStatusValue }> {
    const photo = await this.photos.findById(command.photoId);
    if (photo === null || photo.status === 'DELETED') {
      throw BusinessError.notFound(ErrorCode.NOT_FOUND);
    }

    if (command.decision !== 'APPROVE' && (command.reason ?? '').trim().length === 0) {
      throw BusinessError.unprocessable(ErrorCode.VALIDATION_FAILED, {
        motif: 'un refus ou un masquage exige une raison communicable au membre',
      });
    }

    const status: PhotoStatusValue =
      command.decision === 'APPROVE'
        ? 'APPROVED'
        : command.decision === 'REJECT'
          ? 'REJECTED'
          : 'HIDDEN_BY_MODERATION';

    await this.photos.updateStatus(
      photo.id,
      status,
      command.reason ?? null,
      command.moderatorId,
      this.clock.now(),
    );

    // Une photo masquée ou refusée ne peut pas rester photo principale.
    if (status !== 'APPROVED') {
      const profile = await this.profiles.findByUserId(photo.userId);
      if (profile?.primaryPhotoId === photo.id) {
        const restantes = await this.photos.listByUser(photo.userId);
        const remplacante = restantes.find(
          (candidate) => candidate.id !== photo.id && candidate.status === 'APPROVED',
        );
        await this.profiles.setPrimaryPhoto(profile.id, remplacante?.id ?? null);
      }
    }

    return { status };
  }
}

export class ListModerationQueueUseCase {
  constructor(
    private readonly photos: PhotoRepository,
    private readonly storage: MediaStorage,
    private readonly config: PhotoConfig,
  ) {}

  async execute(limit: number): Promise<PhotoView[]> {
    const photos = await this.photos.listPendingModeration(limit);
    return Promise.all(
      photos.map((photo) => toView(photo, this.storage, this.config.signedUrlTtlSeconds, true)),
    );
  }
}

/**
 * Une URL n'est signée que pour un destinataire autorisé à voir la photo. Aucune URL
 * permanente n'existe (docs/05-api.md §4).
 */
async function toView(
  photo: PhotoRecord,
  storage: MediaStorage,
  ttlSeconds: number,
  authorized: boolean,
): Promise<PhotoView> {
  return {
    id: photo.id,
    position: photo.position,
    status: photo.status,
    url: authorized ? await storage.signedUrl(photo.storageKey, ttlSeconds) : null,
    thumbnailUrl:
      authorized && photo.thumbnailStorageKey !== null
        ? await storage.signedUrl(photo.thumbnailStorageKey, ttlSeconds)
        : null,
    moderationReason: photo.moderationReason,
  };
}
