import { createHash } from 'node:crypto';
import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import type { PhotoStatusValue } from '../domain/photo-policy';
import type { ProfileStatusValue } from '../domain/profile-policy';
import type {
  MediaPipeline,
  MediaStorage,
  PhotoRecord,
  PhotoRepository,
  PreferenceRecord,
  ProcessedImage,
  ProfileRecord,
  ProfileRepository,
  ProfileUpdateInput,
  ReferentialRepository,
} from './ports';

/** Doubles en mémoire du module profils (docs/09-plan-de-tests.md §1). */

export class InMemoryProfileRepository implements ProfileRepository {
  readonly profiles = new Map<string, ProfileRecord>();
  readonly preferences = new Map<string, PreferenceRecord>();
  readonly identities = new Map<
    string,
    { birthDate: Date | null; gender: string | null; verificationStatus: string }
  >();
  private counter = 0;

  findByUserId(userId: string): Promise<ProfileRecord | null> {
    return Promise.resolve(
      [...this.profiles.values()].find((profile) => profile.userId === userId) ?? null,
    );
  }

  create(userId: string, firstName: string, cityId: string): Promise<ProfileRecord> {
    const profile: ProfileRecord = {
      id: `profile-${++this.counter}`,
      userId,
      firstName,
      cityId,
      profession: null,
      educationLevel: null,
      relationshipStatus: null,
      hasChildren: null,
      bio: null,
      lookingFor: null,
      personalValues: null,
      status: 'DRAFT',
      completionRate: 0,
      primaryPhotoId: null,
      interestSlugs: [],
    };
    this.profiles.set(profile.id, profile);
    return Promise.resolve(profile);
  }

  update(profileId: string, input: ProfileUpdateInput): Promise<ProfileRecord> {
    const profile = this.profiles.get(profileId);
    if (!profile) throw BusinessError.notFound(ErrorCode.NOT_FOUND);

    const misAJour: ProfileRecord = {
      ...profile,
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.cityId !== undefined ? { cityId: input.cityId } : {}),
      ...(input.profession !== undefined ? { profession: input.profession } : {}),
      ...(input.educationLevel !== undefined ? { educationLevel: input.educationLevel } : {}),
      ...(input.relationshipStatus !== undefined
        ? { relationshipStatus: input.relationshipStatus }
        : {}),
      ...(input.hasChildren !== undefined ? { hasChildren: input.hasChildren } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.lookingFor !== undefined ? { lookingFor: input.lookingFor } : {}),
      ...(input.personalValues !== undefined ? { personalValues: input.personalValues } : {}),
      ...(input.interestIds !== undefined ? { interestSlugs: input.interestIds } : {}),
    };
    this.profiles.set(profileId, misAJour);
    return Promise.resolve(misAJour);
  }

  setCompletion(profileId: string, rate: number): Promise<void> {
    const profile = this.profiles.get(profileId);
    if (profile) this.profiles.set(profileId, { ...profile, completionRate: rate });
    return Promise.resolve();
  }

  setStatus(profileId: string, status: ProfileStatusValue): Promise<void> {
    const profile = this.profiles.get(profileId);
    if (profile) this.profiles.set(profileId, { ...profile, status });
    return Promise.resolve();
  }

  setPrimaryPhoto(profileId: string, photoId: string | null): Promise<void> {
    const profile = this.profiles.get(profileId);
    if (profile) this.profiles.set(profileId, { ...profile, primaryPhotoId: photoId });
    return Promise.resolve();
  }

  findPreferences(userId: string): Promise<PreferenceRecord | null> {
    return Promise.resolve(this.preferences.get(userId) ?? null);
  }

  savePreferences(userId: string, preferences: PreferenceRecord): Promise<PreferenceRecord> {
    this.preferences.set(userId, preferences);
    return Promise.resolve(preferences);
  }

  getIdentitySnapshot(
    userId: string,
  ): Promise<{ birthDate: Date | null; gender: string | null; verificationStatus: string } | null> {
    return Promise.resolve(
      this.identities.get(userId) ?? {
        birthDate: new Date('1990-05-20T00:00:00.000Z'),
        gender: 'FEMALE',
        verificationStatus: 'VERIFIED',
      },
    );
  }
}

export class InMemoryPhotoRepository implements PhotoRepository {
  readonly photos: PhotoRecord[] = [];
  private counter = 0;

  listByUser(userId: string): Promise<PhotoRecord[]> {
    return Promise.resolve(this.photos.filter((photo) => photo.userId === userId));
  }

  findById(photoId: string): Promise<PhotoRecord | null> {
    return Promise.resolve(this.photos.find((photo) => photo.id === photoId) ?? null);
  }

  create(input: Parameters<PhotoRepository['create']>[0]): Promise<PhotoRecord> {
    const photo: PhotoRecord = {
      id: `photo-${++this.counter}`,
      userId: input.userId,
      storageKey: input.storageKey,
      thumbnailStorageKey: input.thumbnailStorageKey,
      position: input.position,
      status: 'PENDING_MODERATION',
      perceptualHash: input.perceptualHash,
      moderationReason: null,
    };
    this.photos.push(photo);
    return Promise.resolve(photo);
  }

  updateStatus(photoId: string, status: PhotoStatusValue, reason: string | null): Promise<void> {
    const index = this.photos.findIndex((photo) => photo.id === photoId);
    const photo = this.photos[index];
    if (photo) this.photos[index] = { ...photo, status, moderationReason: reason };
    return Promise.resolve();
  }

  updatePositions(positions: Array<{ id: string; position: number }>): Promise<void> {
    for (const { id, position } of positions) {
      const index = this.photos.findIndex((photo) => photo.id === id);
      const photo = this.photos[index];
      if (photo) this.photos[index] = { ...photo, position };
    }
    return Promise.resolve();
  }

  softDelete(photoId: string): Promise<void> {
    const index = this.photos.findIndex((photo) => photo.id === photoId);
    const photo = this.photos[index];
    if (photo) this.photos[index] = { ...photo, status: 'DELETED' };
    return Promise.resolve();
  }

  countApproved(userId: string): Promise<number> {
    return Promise.resolve(
      this.photos.filter((photo) => photo.userId === userId && photo.status === 'APPROVED').length,
    );
  }

  findByPerceptualHash(hash: string, excludeUserId: string): Promise<PhotoRecord[]> {
    return Promise.resolve(
      this.photos.filter(
        (photo) => photo.userId !== excludeUserId && photo.perceptualHash === hash,
      ),
    );
  }

  listPendingModeration(limit: number): Promise<PhotoRecord[]> {
    return Promise.resolve(
      this.photos.filter((photo) => photo.status === 'PENDING_MODERATION').slice(0, limit),
    );
  }
}

export class InMemoryMediaStorage implements MediaStorage {
  readonly objects = new Map<string, Buffer>();
  readonly deleted: string[] = [];

  put(key: string, bytes: Buffer): Promise<void> {
    this.objects.set(key, bytes);
    return Promise.resolve();
  }

  signedUrl(key: string, ttlSeconds: number): Promise<string> {
    return Promise.resolve(`https://media.invalid/${key}?ttl=${ttlSeconds}`);
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    this.deleted.push(key);
    return Promise.resolve();
  }
}

/**
 * Pipeline de test : reproduit le contrat sans dépendre de sharp — refus des formats
 * inconnus, empreinte déterministe, miniature distincte.
 */
export class FakeMediaPipeline implements MediaPipeline {
  process(bytes: Buffer): Promise<ProcessedImage> {
    const estJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
    if (!estJpeg) {
      throw BusinessError.badRequest(ErrorCode.MEDIA_INVALID_TYPE);
    }

    const empreinte = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    return Promise.resolve({
      full: Buffer.from(`full:${empreinte}`),
      thumbnail: Buffer.from(`thumb:${empreinte}`),
      width: 1200,
      height: 1500,
      contentType: 'image/webp',
      perceptualHash: empreinte,
    });
  }
}

export class InMemoryReferentialRepository implements ReferentialRepository {
  readonly cities = new Set(['ville-douala', 'ville-yaounde', 'ville-cotonou']);
  readonly interests = new Map<string, { id: string; slug: string; category: string }>([
    ['famille', { id: 'famille', slug: 'famille', category: 'valeurs' }],
    ['foi', { id: 'foi', slug: 'foi', category: 'valeurs' }],
    ['fidelite', { id: 'fidelite', slug: 'fidelite', category: 'valeurs' }],
    ['lecture', { id: 'lecture', slug: 'lecture', category: 'culture' }],
    ['voyage', { id: 'voyage', slug: 'voyage', category: 'quotidien' }],
    ['cuisine', { id: 'cuisine', slug: 'cuisine', category: 'quotidien' }],
    ['musique', { id: 'musique', slug: 'musique', category: 'culture' }],
    ['football', { id: 'football', slug: 'football', category: 'sport' }],
  ]);

  cityExists(cityId: string): Promise<boolean> {
    return Promise.resolve(this.cities.has(cityId));
  }

  resolveInterests(
    interestIds: string[],
  ): Promise<Array<{ id: string; slug: string; category: string }>> {
    return Promise.resolve(
      interestIds
        .map((id) => this.interests.get(id))
        .filter((interest): interest is { id: string; slug: string; category: string } =>
          Boolean(interest),
        ),
    );
  }
}
