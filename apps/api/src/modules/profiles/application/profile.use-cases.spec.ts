import { beforeEach, describe, expect, it } from '@jest/globals';
import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../../../common/errors/business.error';
import { FakeClock, RecordingAnalyticsTracker } from '../../auth/application/test-doubles';
import { PreferenceService, ProfileService } from './profile.use-cases';
import type { PreferenceRecord } from './ports';
import {
  InMemoryPhotoRepository,
  InMemoryProfileRepository,
  InMemoryReferentialRepository,
} from './test-doubles';

const attendreCode = async (promesse: Promise<unknown>): Promise<string> => {
  try {
    await promesse;
    throw new Error('une erreur métier était attendue');
  } catch (error) {
    if (error instanceof BusinessError) return error.code;
    throw error;
  }
};

const preferencesBase: PreferenceRecord = {
  seekingGender: 'MALE',
  minAge: 30,
  maxAge: 45,
  cityIds: ['ville-douala'],
  sameCountryOnly: true,
  acceptedRelationshipStatuses: ['SINGLE'],
  acceptsChildren: true,
  minEducationLevel: null,
  requiredInterestIds: [],
};

describe('profil', () => {
  let profiles: InMemoryProfileRepository;
  let photos: InMemoryPhotoRepository;
  let referentials: InMemoryReferentialRepository;
  let service: ProfileService;
  let analytics: RecordingAnalyticsTracker;

  beforeEach(() => {
    profiles = new InMemoryProfileRepository();
    photos = new InMemoryPhotoRepository();
    referentials = new InMemoryReferentialRepository();
    analytics = new RecordingAnalyticsTracker();
    service = new ProfileService(profiles, photos, referentials, new FakeClock(), analytics, {
      minimumCompletionToPublish: 60,
      minimumPhotosToPublish: 1,
    });
  });

  const creerProfil = () =>
    service.createOrUpdate('user-1', { firstName: 'Aminata', cityId: 'ville-douala' });

  describe('création et mise à jour', () => {
    it('crée un profil au statut brouillon', async () => {
      const profil = await creerProfil();
      expect(profil.status).toBe('DRAFT');
      expect(profil.firstName).toBe('Aminata');
    });

    it('exige prénom et ville à la création', async () => {
      const code = await attendreCode(service.createOrUpdate('user-1', { bio: 'Bonjour' }));
      expect(code).toBe(ErrorCode.PROFILE_INCOMPLETE);
    });

    it('recalcule le taux de complétion à chaque écriture', async () => {
      await creerProfil();
      const profil = await service.createOrUpdate('user-1', {
        bio: 'a'.repeat(120),
        relationshipStatus: 'SINGLE',
      });
      // identité 15 + bio 15 + situation 5 = 35
      expect(profil.completion.rate).toBe(35);
    });

    it('énumère les éléments restants pour guider la complétion', async () => {
      await creerProfil();
      const profil = await service.getOwn('user-1');
      expect(profil.completion.missing.map((c) => c.key)).toContain('photo_first');
    });

    it('refuse une ville hors référentiel', async () => {
      const code = await attendreCode(
        service.createOrUpdate('user-1', { firstName: 'Jean', cityId: 'ville-inventee' }),
      );
      expect(code).toBe(ErrorCode.VALIDATION_FAILED);
    });

    it('refuse un centre d’intérêt hors référentiel plutôt que de l’ignorer', async () => {
      await creerProfil();
      const code = await attendreCode(
        service.createOrUpdate('user-1', { interestIds: ['lecture', 'inventé'] }),
      );
      expect(code).toBe(ErrorCode.VALIDATION_FAILED);
    });

    it('assainit le texte libre avant stockage', async () => {
      await creerProfil();
      const profil = await service.createOrUpdate('user-1', {
        bio: '<script>alert(1)</script>Bonjour à tous',
      });
      expect(profil.bio).toBe('alert(1)Bonjour à tous');
    });

    it('signale un partage de coordonnées sans bloquer la saisie', async () => {
      await creerProfil();
      const profil = await service.createOrUpdate('user-1', {
        bio: 'Contactez-moi sur WhatsApp',
      });
      // Signal transmis à la modération, jamais une sanction automatique (ADR-012).
      expect(profil.contactSharingSuspected).toBe(true);
      expect(profil.bio).toContain('WhatsApp');
    });
  });

  describe('publication', () => {
    const rendreComplet = async () => {
      await creerProfil();
      await service.createOrUpdate('user-1', {
        bio: 'a'.repeat(120),
        lookingFor: 'b'.repeat(80),
        relationshipStatus: 'SINGLE',
        profession: 'Infirmière',
        interestIds: [
          'famille',
          'foi',
          'fidelite',
          'lecture',
          'voyage',
          'cuisine',
          'musique',
          'football',
        ],
      });
      await profiles.savePreferences('user-1', preferencesBase);
      photos.photos.push({
        id: 'photo-1',
        userId: 'user-1',
        storageKey: 'k',
        thumbnailStorageKey: 't',
        position: 0,
        status: 'APPROVED',
        perceptualHash: 'abcd',
        moderationReason: null,
      });
    };

    it('publie un profil vérifié, complet et illustré', async () => {
      await rendreComplet();
      const profil = await service.publish('user-1');
      expect(profil.status).toBe('ACTIVE');
    });

    it('émet la dernière marche du tunnel à la publication (story D10-04)', async () => {
      await rendreComplet();
      await service.publish('user-1');

      expect(analytics.events).toEqual([{ userId: 'user-1', name: 'profile.completed' }]);
    });

    it('n’émet RIEN quand la publication est refusée', async () => {
      // Une marche du tunnel se compte quand elle est franchie, pas quand elle
      // est tentée : sinon le taux de complétion deviendrait un taux d'essais.
      await rendreComplet();
      photos.photos.length = 0;

      await attendreCode(service.publish('user-1'));

      expect(analytics.events).toEqual([]);
    });

    it('refuse la publication sans identité vérifiée', async () => {
      await rendreComplet();
      profiles.identities.set('user-1', {
        birthDate: new Date('1990-05-20T00:00:00.000Z'),
        gender: 'FEMALE',
        verificationStatus: 'PENDING',
      });

      const code = await attendreCode(service.publish('user-1'));
      expect(code).toBe(ErrorCode.PROFILE_NOT_VERIFIED);
    });

    it('refuse la publication sans photo approuvée', async () => {
      await rendreComplet();
      photos.photos.length = 0;

      const code = await attendreCode(service.publish('user-1'));
      expect(code).toBe(ErrorCode.PROFILE_INCOMPLETE);
    });

    it('renvoie tous les blocages et les éléments manquants', async () => {
      await creerProfil();
      try {
        await service.publish('user-1');
        throw new Error('erreur attendue');
      } catch (error) {
        const details = (error as BusinessError).details as { blocages: string[] };
        expect(details.blocages).toEqual(
          expect.arrayContaining(['INCOMPLETE', 'NO_APPROVED_PHOTO']),
        );
      }
    });
  });

  describe('disponibilité', () => {
    it('met le profil en pause puis le réactive', async () => {
      await creerProfil();
      await profiles.setStatus('profile-1', 'ACTIVE');

      expect((await service.changeStatus('user-1', 'PAUSED')).status).toBe('PAUSED');
      expect((await service.changeStatus('user-1', 'ACTIVE')).status).toBe('ACTIVE');
    });

    it('refuse une transition interdite', async () => {
      await creerProfil();
      const code = await attendreCode(service.changeStatus('user-1', 'PAUSED'));
      expect(code).toBe(ErrorCode.VALIDATION_FAILED);
    });

    it('interdit au membre de lever un masquage de modération', async () => {
      await creerProfil();
      await profiles.setStatus('profile-1', 'HIDDEN_BY_MODERATION');

      const code = await attendreCode(service.changeStatus('user-1', 'ACTIVE'));
      expect(code).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });
});

describe('critères de recherche', () => {
  let profiles: InMemoryProfileRepository;
  let service: PreferenceService;

  beforeEach(() => {
    profiles = new InMemoryProfileRepository();
    service = new PreferenceService(profiles, new InMemoryReferentialRepository());
  });

  it('enregistre des critères valides', async () => {
    const enregistrees = await service.save('user-1', preferencesBase, false);
    expect(enregistrees.minAge).toBe(30);
  });

  it('refuse une tranche d’âge incohérente', async () => {
    const code = await attendreCode(
      service.save('user-1', { ...preferencesBase, minAge: 50, maxAge: 30 }, false),
    );
    expect(code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('refuse une ville hors référentiel', async () => {
    const code = await attendreCode(
      service.save('user-1', { ...preferencesBase, cityIds: ['ville-inventee'] }, false),
    );
    expect(code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  describe('filtres réservés à l’offre Premium', () => {
    it('refuse un filtre de niveau d’études sans droit Premium', async () => {
      const code = await attendreCode(
        service.save('user-1', { ...preferencesBase, minEducationLevel: 'MASTER' }, false),
      );
      expect(code).toBe(ErrorCode.AUTH_FORBIDDEN);
    });

    it('refuse un filtre d’intérêts obligatoires sans droit Premium', async () => {
      const code = await attendreCode(
        service.save('user-1', { ...preferencesBase, requiredInterestIds: ['lecture'] }, false),
      );
      expect(code).toBe(ErrorCode.AUTH_FORBIDDEN);
    });

    it('accepte ces filtres avec le droit Premium', async () => {
      const enregistrees = await service.save(
        'user-1',
        { ...preferencesBase, minEducationLevel: 'MASTER' },
        true,
      );
      expect(enregistrees.minEducationLevel).toBe('MASTER');
    });
  });
});
