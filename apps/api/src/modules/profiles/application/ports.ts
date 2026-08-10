import type { PhotoSlot, PhotoStatusValue } from '../domain/photo-policy';
import type { ProfileStatusValue } from '../domain/profile-policy';

export const PROFILE_REPOSITORY = Symbol('ProfileRepository');
export const PHOTO_REPOSITORY = Symbol('PhotoRepository');
export const MEDIA_STORAGE = Symbol('MediaStorage');
export const MEDIA_PIPELINE = Symbol('MediaPipeline');
export const REFERENTIAL_REPOSITORY = Symbol('ReferentialRepository');

export interface ProfileRecord {
  id: string;
  userId: string;
  firstName: string;
  cityId: string;
  profession: string | null;
  educationLevel: string | null;
  relationshipStatus: string | null;
  hasChildren: boolean | null;
  bio: string | null;
  lookingFor: string | null;
  personalValues: string | null;
  status: ProfileStatusValue;
  completionRate: number;
  primaryPhotoId: string | null;
  interestSlugs: string[];
}

export interface ProfileUpdateInput {
  firstName?: string;
  cityId?: string;
  profession?: string | null;
  educationLevel?: string | null;
  relationshipStatus?: string | null;
  hasChildren?: boolean | null;
  bio?: string | null;
  lookingFor?: string | null;
  personalValues?: string | null;
  interestIds?: string[];
}

export interface PreferenceRecord {
  seekingGender: string;
  minAge: number;
  maxAge: number;
  cityIds: string[];
  sameCountryOnly: boolean;
  acceptedRelationshipStatuses: string[];
  acceptsChildren: boolean | null;
  minEducationLevel: string | null;
  requiredInterestIds: string[];
}

export interface ProfileRepository {
  findByUserId(userId: string): Promise<ProfileRecord | null>;
  create(userId: string, firstName: string, cityId: string): Promise<ProfileRecord>;
  update(profileId: string, input: ProfileUpdateInput): Promise<ProfileRecord>;
  setCompletion(profileId: string, rate: number): Promise<void>;
  setStatus(profileId: string, status: ProfileStatusValue, publishedAt: Date | null): Promise<void>;
  setPrimaryPhoto(profileId: string, photoId: string | null): Promise<void>;

  findPreferences(userId: string): Promise<PreferenceRecord | null>;
  savePreferences(userId: string, preferences: PreferenceRecord): Promise<PreferenceRecord>;

  /** Données d'identité détenues par le module `users`, lues via cette façade. */
  getIdentitySnapshot(
    userId: string,
  ): Promise<{ birthDate: Date | null; gender: string | null; verificationStatus: string } | null>;
}

export interface PhotoRecord {
  id: string;
  userId: string;
  storageKey: string;
  thumbnailStorageKey: string | null;
  position: number;
  status: PhotoStatusValue;
  perceptualHash: string | null;
  moderationReason: string | null;
}

export interface PhotoRepository {
  listByUser(userId: string): Promise<PhotoRecord[]>;
  findById(photoId: string): Promise<PhotoRecord | null>;
  create(input: {
    userId: string;
    storageKey: string;
    thumbnailStorageKey: string;
    position: number;
    width: number;
    height: number;
    sizeBytes: number;
    contentType: string;
    perceptualHash: string;
  }): Promise<PhotoRecord>;
  updateStatus(
    photoId: string,
    status: PhotoStatusValue,
    reason: string | null,
    moderatedBy: string | null,
    at: Date,
  ): Promise<void>;
  updatePositions(positions: Array<{ id: string; position: number }>): Promise<void>;
  softDelete(photoId: string, at: Date): Promise<void>;
  countApproved(userId: string): Promise<number>;

  /** Empreintes proches, pour repérer une photo réutilisée sur plusieurs comptes. */
  findByPerceptualHash(hash: string, excludeUserId: string): Promise<PhotoRecord[]>;

  /** File de modération, triée par ancienneté. */
  listPendingModeration(limit: number): Promise<PhotoRecord[]>;
}

export interface ProcessedImage {
  full: Buffer;
  thumbnail: Buffer;
  width: number;
  height: number;
  contentType: string;
  perceptualHash: string;
}

/**
 * Traitement d'image : validation du format réel, suppression des métadonnées,
 * ré-encodage et miniatures (story D3-04).
 */
export interface MediaPipeline {
  process(bytes: Buffer): Promise<ProcessedImage>;
}

export interface MediaStorage {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export interface ReferentialRepository {
  cityExists(cityId: string): Promise<boolean>;
  /** Retourne les slugs des intérêts valides parmi ceux demandés. */
  resolveInterests(
    interestIds: string[],
  ): Promise<Array<{ id: string; slug: string; category: string }>>;
}

export type { PhotoSlot };
