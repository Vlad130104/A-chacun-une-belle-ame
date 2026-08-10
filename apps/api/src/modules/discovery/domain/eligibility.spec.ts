import { describe, expect, it } from '@jest/globals';
import {
  checkEligibility,
  EXCLUSION_COUNT,
  type EligibilityCandidate,
  type EligibilityContext,
  type EligibilitySeeker,
  type ExclusionReason,
} from './eligibility';

const chercheur: EligibilitySeeker = {
  userId: 'chercheur',
  age: 32,
  gender: 'FEMALE',
  cityId: 'douala',
  countryCode: 'CM',
  seekingGender: 'MALE',
  preferenceMinAge: 28,
  preferenceMaxAge: 42,
  preferenceCityIds: [],
  sameCountryOnly: false,
};

const candidatValide: EligibilityCandidate = {
  userId: 'candidat',
  age: 35,
  gender: 'MALE',
  cityId: 'douala',
  countryCode: 'CM',
  accountStatus: 'ACTIVE',
  verificationStatus: 'VERIFIED',
  profileStatus: 'ACTIVE',
  completionRate: 80,
  hasApprovedPhoto: true,
  seekingGender: 'FEMALE',
  preferenceMinAge: 25,
  preferenceMaxAge: 40,
};

const contexte = (surcharge: Partial<EligibilityContext> = {}): EligibilityContext => ({
  blockedUserIds: new Set(),
  seenUserIds: new Set(),
  decidedUserIds: new Set(),
  matchedUserIds: new Set(),
  minimumAge: 18,
  minimumCompletion: 60,
  policy: 'HETERO',
  ...surcharge,
});

const verifier = (
  candidat: Partial<EligibilityCandidate> = {},
  ctx: Partial<EligibilityContext> = {},
  seeker: Partial<EligibilitySeeker> = {},
) =>
  checkEligibility({ ...chercheur, ...seeker }, { ...candidatValide, ...candidat }, contexte(ctx));

describe('éligibilité en découverte — les 13 exclusions', () => {
  it('accepte un candidat conforme à tous les critères', () => {
    expect(verifier()).toEqual({ eligible: true });
  });

  describe('E1 — âge minimum', () => {
    it('exclut un candidat sous l’âge minimum', () => {
      // Ne devrait jamais arriver — un compte refusé pour minorité n'atteint pas cette
      // table. Le contrôle existe en défense en profondeur.
      expect(verifier({ age: 16 })).toEqual({ eligible: false, reason: 'UNDERAGE' });
    });
  });

  describe('E2 — identité vérifiée', () => {
    it.each([['NOT_STARTED'], ['PENDING'], ['IN_REVIEW'], ['REJECTED'], ['SUSPENDED']])(
      'exclut un candidat au statut %s',
      (statut) => {
        expect(verifier({ verificationStatus: statut })).toEqual({
          eligible: false,
          reason: 'NOT_VERIFIED',
        });
      },
    );
  });

  describe('E3 — compte actif', () => {
    it.each([['PAUSED'], ['RESTRICTED'], ['SUSPENDED'], ['BANNED'], ['PENDING_DELETION']])(
      'exclut un compte %s',
      (statut) => {
        expect(verifier({ accountStatus: statut })).toEqual({
          eligible: false,
          reason: 'ACCOUNT_NOT_ACTIVE',
        });
      },
    );
  });

  describe('E4 — profil publiable', () => {
    it('exclut un profil non actif', () => {
      expect(verifier({ profileStatus: 'PAUSED' })).toEqual({
        eligible: false,
        reason: 'PROFILE_NOT_PUBLISHABLE',
      });
    });

    it('exclut un profil sous le seuil de complétion', () => {
      expect(verifier({ completionRate: 45 })).toEqual({
        eligible: false,
        reason: 'PROFILE_NOT_PUBLISHABLE',
      });
    });

    it('accepte exactement au seuil', () => {
      expect(verifier({ completionRate: 60 })).toEqual({ eligible: true });
    });
  });

  describe('E5 — photo approuvée', () => {
    it('exclut un profil sans photo approuvée', () => {
      expect(verifier({ hasApprovedPhoto: false })).toEqual({
        eligible: false,
        reason: 'NO_APPROVED_PHOTO',
      });
    });
  });

  describe('E6 — blocage', () => {
    it('exclut un membre bloqué, quel que soit le sens du blocage', () => {
      expect(verifier({}, { blockedUserIds: new Set(['candidat']) })).toEqual({
        eligible: false,
        reason: 'BLOCKED',
      });
    });
  });

  describe('E7, E8, E9 — historique', () => {
    it('exclut un profil déjà vu', () => {
      expect(verifier({}, { seenUserIds: new Set(['candidat']) })).toEqual({
        eligible: false,
        reason: 'ALREADY_SEEN',
      });
    });

    it('exclut un profil déjà décidé', () => {
      expect(verifier({}, { decidedUserIds: new Set(['candidat']) })).toEqual({
        eligible: false,
        reason: 'ALREADY_DECIDED',
      });
    });

    it('exclut un profil déjà en match', () => {
      expect(verifier({}, { matchedUserIds: new Set(['candidat']) })).toEqual({
        eligible: false,
        reason: 'ALREADY_MATCHED',
      });
    });

    it('signale le motif le plus avancé quand plusieurs s’appliquent', () => {
      const verdict = verifier(
        {},
        {
          seenUserIds: new Set(['candidat']),
          decidedUserIds: new Set(['candidat']),
          matchedUserIds: new Set(['candidat']),
        },
      );
      expect(verdict).toMatchObject({ reason: 'ALREADY_MATCHED' });
    });
  });

  describe('E10 — politique de mise en relation', () => {
    it('exclut un genre incompatible sous la politique HETERO', () => {
      expect(verifier({ gender: 'FEMALE' })).toEqual({
        eligible: false,
        reason: 'GENDER_MISMATCH',
      });
    });

    it('exige la compatibilité dans les deux sens', () => {
      expect(verifier({ seekingGender: 'MALE' })).toEqual({
        eligible: false,
        reason: 'GENDER_MISMATCH',
      });
    });

    it('n’applique aucun filtre de genre sous la politique OPEN', () => {
      // La politique est configurable, jamais figée dans le code (ADR-019).
      expect(verifier({ gender: 'FEMALE' }, { policy: 'OPEN' })).toEqual({ eligible: true });
    });
  });

  describe('E11 — tranche d’âge réciproque', () => {
    it('exclut un candidat hors de la tranche du chercheur', () => {
      expect(verifier({ age: 50 })).toEqual({
        eligible: false,
        reason: 'AGE_RANGE_MISMATCH',
      });
    });

    it('exclut un chercheur hors de la tranche du candidat', () => {
      // Le point souvent oublié : suggérer quelqu'un qui ne peut pas être intéressé
      // frustre les deux côtés et fausse le taux de match.
      expect(verifier({ preferenceMinAge: 40, preferenceMaxAge: 50 })).toEqual({
        eligible: false,
        reason: 'AGE_RANGE_MISMATCH',
      });
    });

    it('accepte aux bornes exactes des deux tranches', () => {
      expect(verifier({ age: 42, preferenceMinAge: 32, preferenceMaxAge: 32 })).toEqual({
        eligible: true,
      });
    });
  });

  describe('E12 — zone géographique', () => {
    it('exclut un autre pays quand le chercheur l’a restreint', () => {
      expect(verifier({ countryCode: 'BJ' }, {}, { sameCountryOnly: true })).toEqual({
        eligible: false,
        reason: 'OUT_OF_ZONE',
      });
    });

    it('exclut une ville hors de la zone souhaitée', () => {
      expect(verifier({ cityId: 'yaounde' }, {}, { preferenceCityIds: ['douala'] })).toEqual({
        eligible: false,
        reason: 'OUT_OF_ZONE',
      });
    });

    it('n’applique aucun filtre de ville si la zone est vide', () => {
      expect(verifier({ cityId: 'garoua' })).toEqual({ eligible: true });
    });
  });

  describe('E13 — soi-même', () => {
    it('exclut le chercheur lui-même', () => {
      expect(verifier({ userId: 'chercheur' })).toEqual({ eligible: false, reason: 'SELF' });
    });
  });

  it('couvre bien treize motifs d’exclusion distincts', () => {
    const motifs: ExclusionReason[] = [
      'UNDERAGE',
      'NOT_VERIFIED',
      'ACCOUNT_NOT_ACTIVE',
      'PROFILE_NOT_PUBLISHABLE',
      'NO_APPROVED_PHOTO',
      'BLOCKED',
      'ALREADY_SEEN',
      'ALREADY_DECIDED',
      'ALREADY_MATCHED',
      'GENDER_MISMATCH',
      'AGE_RANGE_MISMATCH',
      'OUT_OF_ZONE',
      'SELF',
    ];
    expect(new Set(motifs).size).toBe(EXCLUSION_COUNT);
  });
});
