/**
 * Règles du défi OTP.
 *
 * Le code n'existe en clair qu'entre sa génération et son envoi : seule son empreinte
 * est stockée (docs/03-modele-de-donnees.md, `OtpChallenge`).
 */

export type OtpVerdict =
  { valid: true } | { valid: false; reason: 'EXPIRED' | 'CONSUMED' | 'MAX_ATTEMPTS' | 'MISMATCH' };

export interface OtpChallengeState {
  codeHash: string;
  attemptCount: number;
  maxAttempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
}

export function verifyOtpChallenge(
  challenge: OtpChallengeState,
  submittedCodeHash: string,
  now: Date,
): OtpVerdict {
  if (challenge.consumedAt !== null) return { valid: false, reason: 'CONSUMED' };
  if (now.getTime() >= challenge.expiresAt.getTime()) return { valid: false, reason: 'EXPIRED' };
  if (challenge.attemptCount >= challenge.maxAttempts) {
    return { valid: false, reason: 'MAX_ATTEMPTS' };
  }
  // Comparaison d'empreintes : la comparaison à temps constant est faite par
  // l'adaptateur de hachage, jamais ici.
  if (challenge.codeHash !== submittedCodeHash) return { valid: false, reason: 'MISMATCH' };

  return { valid: true };
}

/**
 * Combien d'essais restent annonçables à l'utilisateur. On expose le nombre restant
 * plutôt que le nombre consommé : c'est ce qui aide réellement quelqu'un qui se trompe
 * de chiffre, sans renseigner un attaquant sur l'historique du défi.
 */
export function remainingAttempts(challenge: OtpChallengeState): number {
  return Math.max(0, challenge.maxAttempts - challenge.attemptCount);
}
