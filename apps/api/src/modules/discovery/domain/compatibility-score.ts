/**
 * Score de compatibilité — implémentation exacte de docs/04-algorithme-de-matching.md.
 *
 * Déterministe, explicable, reproductible (ADR-007) : pour un couple donné et un état
 * de données donné, la valeur est toujours la même. C'est ce qui permet de la tester,
 * de la défendre auprès d'un membre qui conteste, et de vérifier son équité.
 *
 * Aucun critère sensible n'entre dans la formule : ni origine, ni religion en tant que
 * telle, ni revenu, ni apparence. Voir §7 du document pour la liste exhaustive.
 */

export interface Candidate {
  userId: string;
  age: number;
  cityId: string;
  regionCode: string;
  countryCode: string;
  interestSlugs: string[];
  valueSlugs: string[];
  relationshipStatus: string | null;
  hasChildren: boolean | null;
  completionRate: number;
  /** Jours écoulés depuis la dernière activité. */
  daysSinceActive: number;
  /** Profil créé il y a moins de `newProfileBoostDays` jours. */
  isNewProfile: boolean;
  /** Coefficient d'un boost actif, 1 en son absence. */
  boostMultiplier: number;
  /** Impressions reçues aujourd'hui, pour le facteur d'équité. */
  impressionsToday: number;
  /** Préférences du candidat — nécessaires à la réciprocité. */
  preference: CandidatePreference;
}

export interface CandidatePreference {
  minAge: number;
  maxAge: number;
  cityIds: string[];
  acceptedRelationshipStatuses: string[];
  acceptsChildren: boolean | null;
}

export interface Seeker extends Candidate {
  preference: CandidatePreference;
}

export interface ScoringWeights {
  age: number;
  geography: number;
  interests: number;
  values: number;
  family: number;
  reciprocity: number;
  completion: number;
  activity: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  age: 0.2,
  geography: 0.15,
  interests: 0.2,
  values: 0.1,
  family: 0.1,
  reciprocity: 0.1,
  completion: 0.05,
  activity: 0.1,
};

export interface ScoringConfig {
  weights: ScoringWeights;
  ageTolerance: number;
  minCompletionForReciprocity: number;
  newProfileMultiplier: number;
  fairnessImpressionCap: number;
  fairnessMultiplier: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights: DEFAULT_WEIGHTS,
  ageTolerance: 10,
  minCompletionForReciprocity: 60,
  newProfileMultiplier: 1.15,
  fairnessImpressionCap: 50,
  fairnessMultiplier: 0.85,
};

export interface ScoreBreakdown {
  age: number;
  geography: number;
  interests: number;
  values: number;
  family: number;
  reciprocity: number;
  completion: number;
  activity: number;
}

export interface ScoreResult {
  /** Somme pondérée, dans [0, 1]. */
  base: number;
  /** Après boost, nouveauté et équité. */
  final: number;
  breakdown: ScoreBreakdown;
}

export class InvalidWeightsError extends Error {
  constructor(sum: number) {
    super(`La somme des pondérations doit valoir 1,0 (obtenu : ${sum}).`);
    this.name = 'InvalidWeightsError';
  }
}

/**
 * Les pondérations sont modifiables sans redéploiement (feature flag). Une somme
 * différente de 1 rendrait le score incomparable d'un jour à l'autre : on la valide
 * au chargement plutôt que de produire silencieusement des valeurs fausses.
 */
export function validateWeights(weights: ScoringWeights): void {
  // Somme explicite plutôt que `Object.values` : le typage reste vérifié, et l'ajout
  // d'une composante future casse la compilation ici — exactement où il le faut.
  const sum =
    weights.age +
    weights.geography +
    weights.interests +
    weights.values +
    weights.family +
    weights.reciprocity +
    weights.completion +
    weights.activity;

  if (Math.abs(sum - 1) > 0.001) throw new InvalidWeightsError(sum);
}

export function computeScore(
  seeker: Seeker,
  candidate: Candidate,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): ScoreResult {
  validateWeights(config.weights);

  const breakdown: ScoreBreakdown = {
    age: ageComponent(seeker.age, candidate.age, config.ageTolerance),
    geography: geographyComponent(seeker, candidate),
    interests: overlapRatio(seeker.interestSlugs, candidate.interestSlugs),
    values: valuesComponent(seeker.valueSlugs, candidate.valueSlugs),
    family: familyComponent(seeker, candidate),
    reciprocity: reciprocityComponent(seeker, candidate, config.minCompletionForReciprocity),
    completion: candidate.completionRate / 100,
    activity: activityComponent(candidate.daysSinceActive),
  };

  const base =
    breakdown.age * config.weights.age +
    breakdown.geography * config.weights.geography +
    breakdown.interests * config.weights.interests +
    breakdown.values * config.weights.values +
    breakdown.family * config.weights.family +
    breakdown.reciprocity * config.weights.reciprocity +
    breakdown.completion * config.weights.completion +
    breakdown.activity * config.weights.activity;

  const nouveaute = candidate.isNewProfile ? config.newProfileMultiplier : 1;
  const equite =
    candidate.impressionsToday > config.fairnessImpressionCap ? config.fairnessMultiplier : 1;

  return {
    base,
    final: base * candidate.boostMultiplier * nouveaute * equite,
    breakdown,
  };
}

/** C1 — l'écart d'âge au sein de la tranche déjà acceptée. */
function ageComponent(seekerAge: number, candidateAge: number, tolerance: number): number {
  return Math.max(0, 1 - Math.abs(seekerAge - candidateAge) / tolerance);
}

/** C2 — barème discret : aucune distance kilométrique n'est calculée (ADR-011). */
function geographyComponent(seeker: Candidate, candidate: Candidate): number {
  if (seeker.cityId === candidate.cityId) return 1;
  if (seeker.regionCode === candidate.regionCode) return 0.7;
  if (seeker.countryCode === candidate.countryCode) return 0.4;
  // Non nul : la diaspora doit pouvoir apparaître sans dominer.
  return 0.1;
}

/**
 * C3 et C4 — proportion du plus petit ensemble qui est partagée.
 *
 * Dénominateur `min` et non union : quelqu'un ayant déclaré quinze intérêts ne doit
 * pas être pénalisé face à quelqu'un qui en a déclaré trois.
 */
function overlapRatio(a: string[], b: string[]): number {
  const ensembleB = new Set(b);
  const communs = a.filter((item) => ensembleB.has(item)).length;
  return communs / Math.max(1, Math.min(a.length, b.length));
}

function valuesComponent(seekerValues: string[], candidateValues: string[]): number {
  // Ne pas pénaliser une absence d'information, ne pas la récompenser non plus.
  if (seekerValues.length === 0 || candidateValues.length === 0) return 0.5;
  return overlapRatio(seekerValues, candidateValues);
}

/** C5 — situation familiale, non éliminatoire car souvent mal renseignée au début. */
function familyComponent(seeker: Seeker, candidate: Candidate): number {
  const seekerAccepte =
    candidate.relationshipStatus !== null &&
    seeker.preference.acceptedRelationshipStatuses.includes(candidate.relationshipStatus);
  const candidatAccepte =
    seeker.relationshipStatus !== null &&
    candidate.preference.acceptedRelationshipStatuses.includes(seeker.relationshipStatus);

  let score = seekerAccepte && candidatAccepte ? 1 : seekerAccepte || candidatAccepte ? 0.5 : 0;

  if (seeker.preference.acceptsChildren !== null && candidate.hasChildren !== null) {
    const compatible = seeker.preference.acceptsChildren || !candidate.hasChildren;
    score *= compatible ? 1 : 0.3;
  }

  return score;
}

/**
 * C6 — probabilité que le candidat soit lui aussi intéressé.
 * Aligne l'intérêt individuel et la qualité collective : mieux vaut avoir soi-même un
 * profil attractif au regard des critères d'autrui.
 */
function reciprocityComponent(seeker: Seeker, candidate: Candidate, minCompletion: number): number {
  const dansTranche =
    seeker.age >= candidate.preference.minAge && seeker.age <= candidate.preference.maxAge;
  const dansZone =
    candidate.preference.cityIds.length === 0 ||
    candidate.preference.cityIds.includes(seeker.cityId);
  const profilSuffisant = seeker.completionRate >= minCompletion;

  return (dansTranche ? 0.4 : 0) + (dansZone ? 0.3 : 0) + (profilSuffisant ? 0.3 : 0);
}

/** C8 — suggérer un profil inactif est la manière la plus sûre de rater une mise en relation. */
function activityComponent(daysSinceActive: number): number {
  if (daysSinceActive <= 1) return 1;
  if (daysSinceActive <= 3) return 0.8;
  if (daysSinceActive <= 7) return 0.6;
  if (daysSinceActive <= 30) return 0.3;
  return 0.05;
}

/**
 * Diversité : pas plus de 40 % d'un lot provenant d'une même ville, tant que des
 * candidats d'ailleurs restent proches en score. Évite le lot monotone dans les
 * grandes villes (docs/04-algorithme-de-matching.md §4.2).
 */
export function applyDiversity<T extends { cityId: string; score: number }>(
  ranked: T[],
  limit: number,
  maxSameCityRatio = 0.4,
  proximityRatio = 0.7,
): T[] {
  const plafond = Math.max(1, Math.floor(limit * maxSameCityRatio));
  const retenus: T[] = [];
  const parVille = new Map<string, number>();
  const reportes: T[] = [];

  for (const candidat of ranked) {
    if (retenus.length >= limit) break;

    const compte = parVille.get(candidat.cityId) ?? 0;
    const dernier = retenus.at(-1);
    const alternativeAcceptable =
      dernier === undefined || candidat.score >= dernier.score * proximityRatio;

    if (compte >= plafond && alternativeAcceptable) {
      reportes.push(candidat);
      continue;
    }

    retenus.push(candidat);
    parVille.set(candidat.cityId, compte + 1);
  }

  // Les reportés complètent le lot s'il reste de la place : mieux vaut un lot complet
  // qu'un lot diversifié mais vide.
  for (const candidat of reportes) {
    if (retenus.length >= limit) break;
    retenus.push(candidat);
  }

  return retenus;
}
