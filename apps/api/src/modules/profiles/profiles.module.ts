import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CLOCK_PROVIDER, type ClockProvider } from '../../providers/ports';
import {
  MEDIA_PIPELINE,
  MEDIA_STORAGE,
  PHOTO_REPOSITORY,
  PROFILE_REPOSITORY,
  REFERENTIAL_REPOSITORY,
  type MediaPipeline,
  type MediaStorage,
  type PhotoRepository,
  type ProfileRepository,
  type ReferentialRepository,
} from './application/ports';
import { PreferenceService, ProfileService } from './application/profile.use-cases';
import {
  DeletePhotoUseCase,
  ListModerationQueueUseCase,
  ListOwnPhotosUseCase,
  ModeratePhotoUseCase,
  ReorderPhotosUseCase,
  SetPrimaryPhotoUseCase,
  UploadPhotoUseCase,
  type PhotoConfig,
} from './application/photo.use-cases';
import {
  AdminPhotoModerationController,
  PhotoController,
  ProfileController,
  ReferentialController,
} from './infrastructure/profiles.controller';
import { MediaStorageAdapter } from './infrastructure/media-storage.adapter';
import { SharpMediaPipeline } from './infrastructure/sharp-media.pipeline';
import {
  PrismaPhotoRepository,
  PrismaProfileRepository,
  PrismaReferentialRepository,
} from './infrastructure/prisma.repositories';

const photoConfig = (config: ConfigService<Env, true>): PhotoConfig => ({
  maxPhotos: config.get('MAX_PHOTOS', { infer: true }),
  signedUrlTtlSeconds: config.get('SIGNED_URL_TTL_SECONDS', { infer: true }),
  softDeleteDays: config.get('PHOTO_SOFT_DELETE_DAYS', { infer: true }),
});

@Module({
  controllers: [
    ProfileController,
    PhotoController,
    ReferentialController,
    AdminPhotoModerationController,
  ],
  providers: [
    MediaStorageAdapter,
    SharpMediaPipeline,
    { provide: MEDIA_STORAGE, useExisting: MediaStorageAdapter },
    { provide: MEDIA_PIPELINE, useExisting: SharpMediaPipeline },

    {
      provide: PROFILE_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaProfileRepository(prisma),
    },
    {
      provide: PHOTO_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaPhotoRepository(prisma),
    },
    {
      provide: REFERENTIAL_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaReferentialRepository(prisma),
    },

    {
      provide: ProfileService,
      inject: [
        PROFILE_REPOSITORY,
        PHOTO_REPOSITORY,
        REFERENTIAL_REPOSITORY,
        CLOCK_PROVIDER,
        ConfigService,
      ],
      useFactory: (
        profiles: ProfileRepository,
        photos: PhotoRepository,
        referentials: ReferentialRepository,
        clock: ClockProvider,
        config: ConfigService<Env, true>,
      ) =>
        new ProfileService(profiles, photos, referentials, clock, {
          minimumCompletionToPublish: config.get('MIN_COMPLETION_TO_PUBLISH', { infer: true }),
          minimumPhotosToPublish: config.get('MIN_PHOTOS_TO_PUBLISH', { infer: true }),
        }),
    },
    {
      provide: PreferenceService,
      inject: [PROFILE_REPOSITORY, REFERENTIAL_REPOSITORY],
      useFactory: (profiles: ProfileRepository, referentials: ReferentialRepository) =>
        new PreferenceService(profiles, referentials),
    },
    {
      provide: UploadPhotoUseCase,
      inject: [PHOTO_REPOSITORY, MEDIA_STORAGE, MEDIA_PIPELINE, ConfigService],
      useFactory: (
        photos: PhotoRepository,
        storage: MediaStorage,
        pipeline: MediaPipeline,
        config: ConfigService<Env, true>,
      ) => new UploadPhotoUseCase(photos, storage, pipeline, photoConfig(config)),
    },
    {
      provide: ListOwnPhotosUseCase,
      inject: [PHOTO_REPOSITORY, MEDIA_STORAGE, ConfigService],
      useFactory: (
        photos: PhotoRepository,
        storage: MediaStorage,
        config: ConfigService<Env, true>,
      ) => new ListOwnPhotosUseCase(photos, storage, photoConfig(config)),
    },
    {
      provide: DeletePhotoUseCase,
      inject: [PHOTO_REPOSITORY, PROFILE_REPOSITORY, CLOCK_PROVIDER],
      useFactory: (photos: PhotoRepository, profiles: ProfileRepository, clock: ClockProvider) =>
        new DeletePhotoUseCase(photos, profiles, clock),
    },
    {
      provide: ReorderPhotosUseCase,
      inject: [PHOTO_REPOSITORY],
      useFactory: (photos: PhotoRepository) => new ReorderPhotosUseCase(photos),
    },
    {
      provide: SetPrimaryPhotoUseCase,
      inject: [PHOTO_REPOSITORY, PROFILE_REPOSITORY],
      useFactory: (photos: PhotoRepository, profiles: ProfileRepository) =>
        new SetPrimaryPhotoUseCase(photos, profiles),
    },
    {
      provide: ModeratePhotoUseCase,
      inject: [PHOTO_REPOSITORY, PROFILE_REPOSITORY, CLOCK_PROVIDER],
      useFactory: (photos: PhotoRepository, profiles: ProfileRepository, clock: ClockProvider) =>
        new ModeratePhotoUseCase(photos, profiles, clock),
    },
    {
      provide: ListModerationQueueUseCase,
      inject: [PHOTO_REPOSITORY, MEDIA_STORAGE, ConfigService],
      useFactory: (
        photos: PhotoRepository,
        storage: MediaStorage,
        config: ConfigService<Env, true>,
      ) => new ListModerationQueueUseCase(photos, storage, photoConfig(config)),
    },
  ],
  exports: [PROFILE_REPOSITORY, PHOTO_REPOSITORY],
})
export class ProfilesModule {}
