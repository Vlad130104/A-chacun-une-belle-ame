/**
 * Taux de complétion du profil (story D3-02).
 *
 * La grille est fixe et documentée (docs/04-algorithme-de-matching.md §3.9) : le taux
 * n'est pas un pourcentage décoratif, il conditionne la visibilité. Sous le seuil de
 * publication, un profil n'apparaît dans AUCUNE suggestion — c'est ce qui donne au
 * membre une raison concrète de compléter.
 *
 * Fonction pure : aucune base, aucune horloge.
 */

export interface ProfileSnapshot {
  firstName: string | null;
  birthDate: Date | null;
  gender: string | null;
  cityId: string | null;
  bio: string | null;
  lookingFor: string | null;
  relationshipStatus: string | null;
  profession: string | null;
  educationLevel: string | null;
  valueSlugs: string[];
  interestSlugs: string[];
  approvedPhotoCount: number;
  hasPreferences: boolean;
}

export interface CompletionCriterion {
  /** Identifiant stable, consommé par l'interface pour afficher l'action manquante. */
  key: string;
  label: string;
  points: number;
  satisfied: boolean;
}

export interface CompletionResult {
  rate: number;
  criteria: CompletionCriterion[];
  missing: CompletionCriterion[];
}

export const MIN_BIO_LENGTH = 100;
export const MIN_LOOKING_FOR_LENGTH = 60;
export const MIN_VALUES = 3;
export const MIN_INTERESTS = 5;

export function computeCompletion(profile: ProfileSnapshot): CompletionResult {
  const criteria: CompletionCriterion[] = [
    {
      key: 'identity',
      label: 'Prénom, date de naissance, genre et ville',
      points: 15,
      satisfied:
        isFilled(profile.firstName) &&
        profile.birthDate !== null &&
        isFilled(profile.gender) &&
        isFilled(profile.cityId),
    },
    {
      key: 'photo_first',
      label: 'Une première photo approuvée',
      points: 15,
      satisfied: profile.approvedPhotoCount >= 1,
    },
    {
      key: 'photo_three',
      label: 'Trois photos approuvées',
      points: 10,
      satisfied: profile.approvedPhotoCount >= 3,
    },
    {
      key: 'bio',
      label: `Une présentation d'au moins ${MIN_BIO_LENGTH} caractères`,
      points: 15,
      satisfied: (profile.bio ?? '').trim().length >= MIN_BIO_LENGTH,
    },
    {
      key: 'looking_for',
      label: `« Ce que je recherche », au moins ${MIN_LOOKING_FOR_LENGTH} caractères`,
      points: 10,
      satisfied: (profile.lookingFor ?? '').trim().length >= MIN_LOOKING_FOR_LENGTH,
    },
    {
      key: 'values',
      label: `Au moins ${MIN_VALUES} valeurs déclarées`,
      points: 10,
      satisfied: profile.valueSlugs.length >= MIN_VALUES,
    },
    {
      key: 'interests',
      label: `Au moins ${MIN_INTERESTS} centres d'intérêt`,
      points: 10,
      satisfied: profile.interestSlugs.length >= MIN_INTERESTS,
    },
    {
      key: 'family',
      label: 'Situation familiale',
      points: 5,
      satisfied: isFilled(profile.relationshipStatus),
    },
    {
      key: 'background',
      label: "Profession ou niveau d'études",
      points: 5,
      satisfied: isFilled(profile.profession) || isFilled(profile.educationLevel),
    },
    {
      key: 'preferences',
      label: 'Critères de recherche renseignés',
      points: 5,
      satisfied: profile.hasPreferences,
    },
  ];

  const rate = criteria.reduce(
    (total, criterion) => total + (criterion.satisfied ? criterion.points : 0),
    0,
  );

  return {
    rate,
    criteria,
    missing: criteria.filter((criterion) => !criterion.satisfied),
  };
}

function isFilled(value: string | null): boolean {
  return value !== null && value.trim().length > 0;
}
