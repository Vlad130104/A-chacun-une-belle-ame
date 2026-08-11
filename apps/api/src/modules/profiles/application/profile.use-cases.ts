import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import type { ClockProvider } from '../../../providers/ports';
import type { AnalyticsTracker } from '../../analytics/application/ports';
import { computeCompletion, type CompletionResult } from '../domain/profile-completion';
import {
  canChangeStatus,
  canPublish,
  detectContactSharing,
  sanitizeFreeText,
  type ProfileStatusValue,
} from '../domain/profile-policy';
import type {
  PhotoRepository,
  PreferenceRecord,
  ProfileRecord,
  ProfileRepository,
  ProfileUpdateInput,
  ReferentialRepository,
} from './ports';

export interface ProfileConfig {
  minimumCompletionToPublish: number;
  minimumPhotosToPublish: number;
}

export interface ProfileView extends ProfileRecord {
  completion: CompletionResult;
  /** Signal transmis à la modération, jamais une sanction (ADR-012). */
  contactSharingSuspected: boolean;
}

/**
 * Lecture et mise à jour du profil (stories D3-01 et D3-02).
 *
 * Le taux de complétion est recalculé à CHAQUE écriture : il n'existe pas de chemin
 * par lequel un profil pourrait rester marqué complet après une suppression de photo.
 */
export class ProfileService {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly photos: PhotoRepository,
    private readonly referentials: ReferentialRepository,
    private readonly clock: ClockProvider,
    private readonly analytics: AnalyticsTracker,
    private readonly config: ProfileConfig,
  ) {}

  async getOwn(userId: string): Promise<ProfileView> {
    const profile = await this.profiles.findByUserId(userId);
    if (profile === null) throw BusinessError.notFound(ErrorCode.NOT_FOUND);
    return this.decorate(profile, userId);
  }

  async createOrUpdate(userId: string, input: ProfileUpdateInput): Promise<ProfileView> {
    const existing = await this.profiles.findByUserId(userId);

    if (input.cityId !== undefined && !(await this.referentials.cityExists(input.cityId))) {
      throw BusinessError.badRequest(ErrorCode.VALIDATION_FAILED, { field: 'cityId' });
    }

    // Le référentiel d'intérêts est fermé : un identifiant inconnu est rejeté plutôt
    // qu'ignoré silencieusement (ADR-011).
    if (input.interestIds !== undefined) {
      const resolus = await this.referentials.resolveInterests(input.interestIds);
      if (resolus.length !== input.interestIds.length) {
        throw BusinessError.badRequest(ErrorCode.VALIDATION_FAILED, { field: 'interestIds' });
      }
    }

    const assaini = this.sanitize(input);

    if (existing === null) {
      if (assaini.firstName === undefined || assaini.cityId === undefined) {
        throw BusinessError.badRequest(ErrorCode.PROFILE_INCOMPLETE, {
          requis: 'firstName et cityId',
        });
      }
      const cree = await this.profiles.create(userId, assaini.firstName, assaini.cityId);
      const misAJour = await this.profiles.update(cree.id, assaini);
      return this.refreshCompletion(misAJour, userId);
    }

    const misAJour = await this.profiles.update(existing.id, assaini);
    return this.refreshCompletion(misAJour, userId);
  }

  async publish(userId: string): Promise<ProfileView> {
    const profile = await this.profiles.findByUserId(userId);
    if (profile === null) throw BusinessError.notFound(ErrorCode.NOT_FOUND);

    const identity = await this.profiles.getIdentitySnapshot(userId);
    const approvedPhotoCount = await this.photos.countApproved(userId);
    const vue = await this.decorate(profile, userId);

    const verdict = canPublish({
      verificationStatus: identity?.verificationStatus ?? 'NOT_STARTED',
      completionRate: vue.completion.rate,
      approvedPhotoCount,
      currentStatus: profile.status,
      minimumCompletion: this.config.minimumCompletionToPublish,
      minimumPhotos: this.config.minimumPhotosToPublish,
    });

    if (!verdict.allowed) {
      // Tous les obstacles d'un coup : les révéler un par un ferait abandonner.
      throw BusinessError.unprocessable(
        verdict.blockers.includes('NOT_VERIFIED')
          ? ErrorCode.PROFILE_NOT_VERIFIED
          : ErrorCode.PROFILE_INCOMPLETE,
        { blocages: verdict.blockers, elementsManquants: vue.completion.missing.map((c) => c.key) },
      );
    }

    await this.profiles.setStatus(profile.id, 'ACTIVE', this.clock.now());

    // Dernière marche du tunnel : le profil est publié, la personne est
    // réellement présente sur la plateforme. Deux mesures agrégées, aucun
    // contenu de profil.
    await this.analytics.track({
      userId,
      name: 'profile.completed',
      properties: { completionRate: vue.completion.rate, photoCount: approvedPhotoCount },
    });

    return this.decorate({ ...profile, status: 'ACTIVE' }, userId);
  }

  async changeStatus(userId: string, target: ProfileStatusValue): Promise<ProfileView> {
    const profile = await this.profiles.findByUserId(userId);
    if (profile === null) throw BusinessError.notFound(ErrorCode.NOT_FOUND);

    if (!canChangeStatus(profile.status, target)) {
      throw BusinessError.conflict(ErrorCode.VALIDATION_FAILED, {
        depuis: profile.status,
        vers: target,
      });
    }

    await this.profiles.setStatus(profile.id, target, null);
    return this.decorate({ ...profile, status: target }, userId);
  }

  private sanitize(input: ProfileUpdateInput): ProfileUpdateInput {
    const texte = (value: string | null | undefined): string | null | undefined =>
      value === undefined || value === null ? value : sanitizeFreeText(value);

    return {
      ...input,
      ...(input.firstName !== undefined ? { firstName: sanitizeFreeText(input.firstName) } : {}),
      ...(input.bio !== undefined ? { bio: texte(input.bio) } : {}),
      ...(input.lookingFor !== undefined ? { lookingFor: texte(input.lookingFor) } : {}),
      ...(input.personalValues !== undefined
        ? { personalValues: texte(input.personalValues) }
        : {}),
      ...(input.profession !== undefined ? { profession: texte(input.profession) } : {}),
    };
  }

  private async refreshCompletion(profile: ProfileRecord, userId: string): Promise<ProfileView> {
    const vue = await this.decorate(profile, userId);
    await this.profiles.setCompletion(profile.id, vue.completion.rate);
    return vue;
  }

  private async decorate(profile: ProfileRecord, userId: string): Promise<ProfileView> {
    const identity = await this.profiles.getIdentitySnapshot(userId);
    const preferences = await this.profiles.findPreferences(userId);
    const approvedPhotoCount = await this.photos.countApproved(userId);
    const resolus = await this.referentials.resolveInterests(profile.interestSlugs);

    const completion = computeCompletion({
      firstName: profile.firstName,
      birthDate: identity?.birthDate ?? null,
      gender: identity?.gender ?? null,
      cityId: profile.cityId,
      bio: profile.bio,
      lookingFor: profile.lookingFor,
      relationshipStatus: profile.relationshipStatus,
      profession: profile.profession,
      educationLevel: profile.educationLevel,
      valueSlugs: resolus.filter((i) => i.category === 'valeurs').map((i) => i.slug),
      interestSlugs: resolus.filter((i) => i.category !== 'valeurs').map((i) => i.slug),
      approvedPhotoCount,
      hasPreferences: preferences !== null,
    });

    const textes = [profile.bio, profile.lookingFor, profile.personalValues]
      .filter((value): value is string => value !== null)
      .join(' ');

    return {
      ...profile,
      completionRate: completion.rate,
      completion,
      contactSharingSuspected: textes.length > 0 && detectContactSharing(textes),
    };
  }
}

/** Critères de recherche (story D3-07). */
export class PreferenceService {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly referentials: ReferentialRepository,
  ) {}

  async get(userId: string): Promise<PreferenceRecord | null> {
    return this.profiles.findPreferences(userId);
  }

  async save(
    userId: string,
    preferences: PreferenceRecord,
    premiumEntitled: boolean,
  ): Promise<PreferenceRecord> {
    if (preferences.minAge > preferences.maxAge) {
      throw BusinessError.badRequest(ErrorCode.VALIDATION_FAILED, { field: 'minAge' });
    }

    // Les filtres Premium sont refusés CÔTÉ SERVEUR en l'absence de droit : masquer
    // le champ dans l'interface ne suffirait pas (docs/05-api.md §4).
    const demandeFiltrePremium =
      preferences.minEducationLevel !== null || preferences.requiredInterestIds.length > 0;

    if (demandeFiltrePremium && !premiumEntitled) {
      throw BusinessError.forbidden(ErrorCode.AUTH_FORBIDDEN, {
        motif: 'filtre réservé à l’offre Premium',
      });
    }

    for (const cityId of preferences.cityIds) {
      if (!(await this.referentials.cityExists(cityId))) {
        throw BusinessError.badRequest(ErrorCode.VALIDATION_FAILED, { field: 'cityIds' });
      }
    }

    return this.profiles.savePreferences(userId, preferences);
  }
}
