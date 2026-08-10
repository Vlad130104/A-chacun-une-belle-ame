import { calculateAge, isOfLegalAge, isPlausibleBirthDate } from '@acuba/contracts';

/**
 * Règle d'éligibilité à l'inscription.
 *
 * Fonction pure, sans base de données ni horloge système : c'est la règle la plus
 * critique du produit et elle doit être testable en millisecondes, à la date près
 * (docs/08-backlog-mvp.md, story D1-03).
 *
 * L'âge n'est JAMAIS accepté depuis le client : il est recalculé ici, côté serveur,
 * à partir de la date de naissance déclarée et de l'horloge injectée.
 */

export type RegistrationDecision =
  | { eligible: true; age: number }
  | { eligible: false; reason: 'UNDERAGE'; age: number }
  | { eligible: false; reason: 'IMPLAUSIBLE_BIRTHDATE' }
  | { eligible: false; reason: 'BLOCKED_IDENTITY' };

export interface RegistrationInput {
  birthDate: Date;
  now: Date;
  minimumAge: number;
  /** Vrai si une empreinte du numéro, de la pièce ou de l'appareil figure en liste noire. */
  identityBlocked: boolean;
}

export function decideRegistration(input: RegistrationInput): RegistrationDecision {
  const { birthDate, now, minimumAge, identityBlocked } = input;

  if (!isPlausibleBirthDate(birthDate, now)) {
    return { eligible: false, reason: 'IMPLAUSIBLE_BIRTHDATE' };
  }

  // Le contrôle de majorité passe AVANT la liste noire : un mineur détecté doit être
  // refusé et enregistré comme tel, quelle que soit la raison pour laquelle il
  // figurerait déjà en liste noire.
  if (!isOfLegalAge(birthDate, now, minimumAge)) {
    return { eligible: false, reason: 'UNDERAGE', age: calculateAge(birthDate, now) };
  }

  if (identityBlocked) {
    return { eligible: false, reason: 'BLOCKED_IDENTITY' };
  }

  return { eligible: true, age: calculateAge(birthDate, now) };
}
