import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { PhotoStatusValue } from '../domain/photo-policy';
import type { ProfileStatusValue } from '../domain/profile-policy';
import type {
  PhotoRecord,
  PhotoRepository,
  PreferenceRecord,
  ProfileRecord,
  ProfileRepository,
  ProfileUpdateInput,
  ReferentialRepository,
} from '../application/ports';

@Injectable()
export class PrismaProfileRepository implements ProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<ProfileRecord | null> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      include: { interests: { select: { interestId: true } } },
    });
    return profile === null ? null : this.toRecord(profile);
  }

  async create(userId: string, firstName: string, cityId: string): Promise<ProfileRecord> {
    const profile = await this.prisma.profile.create({
      data: { userId, firstName, cityId },
      include: { interests: { select: { interestId: true } } },
    });
    return this.toRecord(profile);
  }

  async update(profileId: string, input: ProfileUpdateInput): Promise<ProfileRecord> {
    const profile = await this.prisma.$transaction(async (tx) => {
      if (input.interestIds !== undefined) {
        // Remplacement complet plutôt que fusion : le client envoie la liste voulue.
        await tx.profileInterest.deleteMany({ where: { profileId } });
        await tx.profileInterest.createMany({
          data: input.interestIds.map((interestId) => ({ profileId, interestId })),
          skipDuplicates: true,
        });
      }

      return tx.profile.update({
        where: { id: profileId },
        data: {
          ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
          ...(input.cityId !== undefined ? { cityId: input.cityId } : {}),
          ...(input.profession !== undefined ? { profession: input.profession } : {}),
          ...(input.educationLevel !== undefined
            ? { educationLevel: input.educationLevel as never }
            : {}),
          ...(input.relationshipStatus !== undefined
            ? { relationship: input.relationshipStatus as never }
            : {}),
          ...(input.hasChildren !== undefined ? { hasChildren: input.hasChildren } : {}),
          ...(input.bio !== undefined ? { bio: input.bio } : {}),
          ...(input.lookingFor !== undefined ? { lookingFor: input.lookingFor } : {}),
          ...(input.personalValues !== undefined ? { personalValues: input.personalValues } : {}),
        },
        include: { interests: { select: { interestId: true } } },
      });
    });

    return this.toRecord(profile);
  }

  async setCompletion(profileId: string, rate: number): Promise<void> {
    await this.prisma.profile.update({ where: { id: profileId }, data: { completionRate: rate } });
  }

  async setStatus(
    profileId: string,
    status: ProfileStatusValue,
    publishedAt: Date | null,
  ): Promise<void> {
    await this.prisma.profile.update({
      where: { id: profileId },
      data: { status, ...(publishedAt !== null ? { publishedAt } : {}) },
    });
  }

  async setPrimaryPhoto(profileId: string, photoId: string | null): Promise<void> {
    await this.prisma.profile.update({
      where: { id: profileId },
      data: { primaryPhotoId: photoId },
    });
  }

  async findPreferences(userId: string): Promise<PreferenceRecord | null> {
    const preference = await this.prisma.preference.findUnique({
      where: { userId },
      include: { cities: { select: { cityId: true } } },
    });
    if (preference === null) return null;

    return {
      seekingGender: preference.seekingGender,
      minAge: preference.minAge,
      maxAge: preference.maxAge,
      cityIds: preference.cities.map((city) => city.cityId),
      sameCountryOnly: preference.sameCountryOnly,
      acceptedRelationshipStatuses: preference.acceptedRelationshipStatuses,
      acceptsChildren: preference.acceptsChildren,
      minEducationLevel: preference.minEducationLevel,
      requiredInterestIds: preference.requiredInterestIds,
    };
  }

  async savePreferences(userId: string, input: PreferenceRecord): Promise<PreferenceRecord> {
    await this.prisma.$transaction(async (tx) => {
      const data = {
        seekingGender: input.seekingGender as never,
        minAge: input.minAge,
        maxAge: input.maxAge,
        sameCountryOnly: input.sameCountryOnly,
        acceptedRelationshipStatuses: input.acceptedRelationshipStatuses as never,
        acceptsChildren: input.acceptsChildren,
        minEducationLevel: input.minEducationLevel as never,
        requiredInterestIds: input.requiredInterestIds,
      };

      const preference = await tx.preference.upsert({
        where: { userId },
        update: data,
        create: { userId, ...data },
      });

      await tx.preferenceCity.deleteMany({ where: { preferenceId: preference.id } });
      await tx.preferenceCity.createMany({
        data: input.cityIds.map((cityId) => ({ preferenceId: preference.id, cityId })),
        skipDuplicates: true,
      });
    });

    return input;
  }

  async getIdentitySnapshot(
    userId: string,
  ): Promise<{ birthDate: Date | null; gender: string | null; verificationStatus: string } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { birthDate: true, gender: true, verificationStatus: true },
    });
    return user === null
      ? null
      : {
          birthDate: user.birthDate,
          gender: user.gender,
          verificationStatus: user.verificationStatus,
        };
  }

  private toRecord(profile: {
    id: string;
    userId: string;
    firstName: string;
    cityId: string;
    profession: string | null;
    educationLevel: string | null;
    relationship: string | null;
    hasChildren: boolean | null;
    bio: string | null;
    lookingFor: string | null;
    personalValues: string | null;
    status: string;
    completionRate: number;
    primaryPhotoId: string | null;
    interests: Array<{ interestId: string }>;
  }): ProfileRecord {
    return {
      id: profile.id,
      userId: profile.userId,
      firstName: profile.firstName,
      cityId: profile.cityId,
      profession: profile.profession,
      educationLevel: profile.educationLevel,
      relationshipStatus: profile.relationship,
      hasChildren: profile.hasChildren,
      bio: profile.bio,
      lookingFor: profile.lookingFor,
      personalValues: profile.personalValues,
      status: profile.status as ProfileStatusValue,
      completionRate: profile.completionRate,
      primaryPhotoId: profile.primaryPhotoId,
      interestSlugs: profile.interests.map((interest) => interest.interestId),
    };
  }
}

@Injectable()
export class PrismaPhotoRepository implements PhotoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByUser(userId: string): Promise<PhotoRecord[]> {
    const photos = await this.prisma.photo.findMany({
      where: { userId },
      orderBy: { position: 'asc' },
    });
    return photos.map((photo) => this.toRecord(photo));
  }

  async findById(photoId: string): Promise<PhotoRecord | null> {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    return photo === null ? null : this.toRecord(photo);
  }

  async create(input: Parameters<PhotoRepository['create']>[0]): Promise<PhotoRecord> {
    const photo = await this.prisma.photo.create({
      data: {
        userId: input.userId,
        storageKey: input.storageKey,
        thumbnailStorageKey: input.thumbnailStorageKey,
        position: input.position,
        width: input.width,
        height: input.height,
        sizeBytes: input.sizeBytes,
        contentType: input.contentType,
        perceptualHash: input.perceptualHash,
        // Toute photo entre en modération : jamais publiée directement.
        status: 'PENDING_MODERATION',
      },
    });
    return this.toRecord(photo);
  }

  async updateStatus(
    photoId: string,
    status: PhotoStatusValue,
    reason: string | null,
    moderatedBy: string | null,
    at: Date,
  ): Promise<void> {
    await this.prisma.photo.update({
      where: { id: photoId },
      data: { status, moderationReason: reason, moderatedBy, moderatedAt: at },
    });
  }

  async updatePositions(positions: Array<{ id: string; position: number }>): Promise<void> {
    // Deux temps : la contrainte unique (userId, position) interdit un échange direct.
    await this.prisma.$transaction(async (tx) => {
      for (const [index, { id }] of positions.entries()) {
        await tx.photo.update({ where: { id }, data: { position: -1 - index } });
      }
      for (const { id, position } of positions) {
        await tx.photo.update({ where: { id }, data: { position } });
      }
    });
  }

  async softDelete(photoId: string, at: Date): Promise<void> {
    await this.prisma.photo.update({
      where: { id: photoId },
      data: { status: 'DELETED', deletedAt: at },
    });
  }

  countApproved(userId: string): Promise<number> {
    return this.prisma.photo.count({ where: { userId, status: 'APPROVED' } });
  }

  async findByPerceptualHash(hash: string, excludeUserId: string): Promise<PhotoRecord[]> {
    const photos = await this.prisma.photo.findMany({
      where: { perceptualHash: hash, userId: { not: excludeUserId }, status: { not: 'DELETED' } },
      take: 20,
    });
    return photos.map((photo) => this.toRecord(photo));
  }

  async listPendingModeration(limit: number): Promise<PhotoRecord[]> {
    const photos = await this.prisma.photo.findMany({
      where: { status: 'PENDING_MODERATION' },
      // Le plus ancien d'abord : c'est la seule façon de tenir un délai de traitement.
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return photos.map((photo) => this.toRecord(photo));
  }

  private toRecord(photo: {
    id: string;
    userId: string;
    storageKey: string;
    thumbnailStorageKey: string | null;
    position: number;
    status: string;
    perceptualHash: string | null;
    moderationReason: string | null;
  }): PhotoRecord {
    return {
      id: photo.id,
      userId: photo.userId,
      storageKey: photo.storageKey,
      thumbnailStorageKey: photo.thumbnailStorageKey,
      position: photo.position,
      status: photo.status as PhotoStatusValue,
      perceptualHash: photo.perceptualHash,
      moderationReason: photo.moderationReason,
    };
  }
}

@Injectable()
export class PrismaReferentialRepository implements ReferentialRepository {
  constructor(private readonly prisma: PrismaService) {}

  async cityExists(cityId: string): Promise<boolean> {
    const city = await this.prisma.city.findUnique({ where: { id: cityId }, select: { id: true } });
    return city !== null;
  }

  async resolveInterests(
    interestIds: string[],
  ): Promise<Array<{ id: string; slug: string; category: string }>> {
    if (interestIds.length === 0) return [];

    return this.prisma.interest.findMany({
      where: { id: { in: interestIds }, active: true },
      select: { id: true, slug: true, category: true },
    });
  }
}
