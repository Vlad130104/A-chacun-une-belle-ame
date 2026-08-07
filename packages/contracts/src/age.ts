/**
 * Calcul d'âge.
 *
 * Fonction pure, sans dépendance à l'horloge système : la date de référence est
 * toujours passée en argument (ClockProvider côté serveur, horloge figée en test).
 *
 * IMPORTANT — cette fonction est partagée avec les clients pour l'affichage
 * uniquement. L'autorité sur l'âge est EXCLUSIVEMENT le serveur : une valeur d'âge
 * envoyée par un client n'est jamais acceptée (docs/05-api.md §12).
 *
 * Tous les calculs se font en UTC. Un utilisateur situé à UTC+1 la veille de son
 * anniversaire ne doit pas devenir majeur une journée plus tôt.
 */

export const DEFAULT_MINIMUM_AGE = 18;

export function calculateAge(birthDate: Date, now: Date): number {
  const birthYear = birthDate.getUTCFullYear();
  const birthMonth = birthDate.getUTCMonth();
  const birthDay = birthDate.getUTCDate();

  let age = now.getUTCFullYear() - birthYear;

  const nowMonth = now.getUTCMonth();
  const nowDay = now.getUTCDate();

  // L'anniversaire n'est pas encore passé cette année.
  if (nowMonth < birthMonth || (nowMonth === birthMonth && nowDay < birthDay)) {
    age -= 1;
  }

  return age;
}

export function isOfLegalAge(
  birthDate: Date,
  now: Date,
  minimumAge: number = DEFAULT_MINIMUM_AGE,
): boolean {
  return calculateAge(birthDate, now) >= minimumAge;
}

/**
 * Bornes de plausibilité d'une date de naissance. Une date future ou antérieure à
 * 1900 traduit une erreur de saisie ou une tentative de contournement.
 */
export function isPlausibleBirthDate(birthDate: Date, now: Date): boolean {
  if (Number.isNaN(birthDate.getTime())) return false;
  if (birthDate.getTime() > now.getTime()) return false;
  return birthDate.getUTCFullYear() >= 1900;
}
