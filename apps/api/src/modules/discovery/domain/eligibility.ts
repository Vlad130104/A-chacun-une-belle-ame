/**
 * Filtres d'éligibilité de la découverte — les 13 exclusions de
 * docs/04-algorithme-de-matching.md §2.
 *
 * Ces règles sont DURES : aucune pondération ne peut les compenser. Elles sont
 * appliquées en SQL sur le chemin nominal ; cette fonction pure les redit au niveau du
 * domaine, ce qui permet de les tester une par une et de vérifier, en défense en
 * profondeur, un candidat déjà remonté de la base.
 */

export type ExclusionReason =
  | 'UNDERAGE'
  | 'NOT_VERIFIED'
  | 'ACCOUNT_NOT_ACTIVE'
  | 'PROFILE_NOT_PUBLISHABLE'
  | 'NO_APPROVED_PHOTO'
  | 'BLOCKED'
  | 'ALREADY_SEEN'
  | 'ALREADY_DECIDED'
  | 'ALREADY_MATCHED'
  | 'GENDER_MISMATCH'
  | 'AGE_RANGE_MISMATCH'
  | 'OUT_OF_ZONE'
  | 'SELF';

export type MatchingPolicy = 'HETERO' | 'OPEN';

export interface EligibilityCandidate {
  userId: string;
  age: number;
  gender: string;
  cityId: string;
  countryCode: string;
  accountStatus: string;
  verificationStatus: string;
  profileStatus: string;
  completionRate: number;
  hasApprovedPhoto: boolean;
  seekingGender: string;
  preferenceMinAge: number;
  preferenceMaxAge: number;
}

export interface EligibilitySeeker {
  userId: string;
  age: number;
  gender: string;
  cityId: string;
  countryCode: string;
  seekingGender: string;
  preferenceMinAge: number;
  preferenceMaxAge: number;
  preferenceCityIds: string[];
  sameCountryOnly: boolean;
}

export interface EligibilityContext {
  blockedUserIds: Set<string>;
  seenUserIds: Set<string>;
  decidedUserIds: Set<string>;
  matchedUserIds: Set<string>;
  minimumAge: number;
  minimumCompletion: number;
  policy: MatchingPolicy;
}

export type EligibilityVerdict = { eligible: true } | { eligible: false; reason: ExclusionReason };

export function checkEligibility(
  seeker: EligibilitySeeker,
  candidate: EligibilityCandidate,
  context: EligibilityContext,
): EligibilityVerdict {
  // E13 — soi-même.
  if (candidate.userId === seeker.userId) return refuse('SELF');

  // E1 — non majeur. Impossible en principe : un compte refusé pour minorité
  // n'atteint jamais cette table. Le contrôle reste, par défense en profondeur.
  if (candidate.age < context.minimumAge) return refuse('UNDERAGE');

  // E2 — identité non vérifiée : la porte serveur du produit (ADR-006).
  if (candidate.verificationStatus !== 'VERIFIED') return refuse('NOT_VERIFIED');

  // E3 — compte non actif : couvre pause, restriction, suspension, bannissement.
  if (candidate.accountStatus !== 'ACTIVE') return refuse('ACCOUNT_NOT_ACTIVE');

  // E4 — profil non publiable. Un profil incomplet n'est pas mal noté : il est invisible.
  if (
    candidate.profileStatus !== 'ACTIVE' ||
    candidate.completionRate < context.minimumCompletion
  ) {
    return refuse('PROFILE_NOT_PUBLISHABLE');
  }

  // E5 — aucune photo approuvée.
  if (!candidate.hasApprovedPhoto) return refuse('NO_APPROVED_PHOTO');

  // E6 — blocage, dans un sens ou dans l'autre.
  if (context.blockedUserIds.has(candidate.userId)) return refuse('BLOCKED');

  // E7, E8, E9 — déjà vu, déjà décidé, déjà en match.
  if (context.matchedUserIds.has(candidate.userId)) return refuse('ALREADY_MATCHED');
  if (context.decidedUserIds.has(candidate.userId)) return refuse('ALREADY_DECIDED');
  if (context.seenUserIds.has(candidate.userId)) return refuse('ALREADY_SEEN');

  // E10 — politique de mise en relation, configurable et non figée dans le code (ADR-019).
  if (!genderCompatible(seeker, candidate, context.policy)) return refuse('GENDER_MISMATCH');

  // E11 — tranche d'âge RÉCIPROQUE. Suggérer quelqu'un qui, par ses propres critères,
  // ne peut pas être intéressé frustre les deux côtés et fausse le taux de match.
  const candidatDansTranche =
    candidate.age >= seeker.preferenceMinAge && candidate.age <= seeker.preferenceMaxAge;
  const chercheurDansTranche =
    seeker.age >= candidate.preferenceMinAge && seeker.age <= candidate.preferenceMaxAge;
  if (!candidatDansTranche || !chercheurDansTranche) return refuse('AGE_RANGE_MISMATCH');

  // E12 — zone géographique souhaitée.
  if (seeker.sameCountryOnly && candidate.countryCode !== seeker.countryCode) {
    return refuse('OUT_OF_ZONE');
  }
  if (seeker.preferenceCityIds.length > 0 && !seeker.preferenceCityIds.includes(candidate.cityId)) {
    return refuse('OUT_OF_ZONE');
  }

  return { eligible: true };
}

function refuse(reason: ExclusionReason): EligibilityVerdict {
  return { eligible: false, reason };
}

function genderCompatible(
  seeker: EligibilitySeeker,
  candidate: EligibilityCandidate,
  policy: MatchingPolicy,
): boolean {
  if (policy === 'OPEN') return true;
  return candidate.gender === seeker.seekingGender && seeker.gender === candidate.seekingGender;
}

/** Nombre total d'exclusions, vérifié par test : elles doivent rester au complet. */
export const EXCLUSION_COUNT = 13;
