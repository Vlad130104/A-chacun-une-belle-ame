import { appelerApi } from './api-client';
import type { Session } from './session';

/**
 * Appels d'authentification (tranche F1).
 *
 * Aucune règle métier ici : l'âge, l'unicité du numéro et la validité du code
 * sont décidés **par le serveur**. Le client se contente de présenter la
 * réponse. Toute vérification faite ici serait un confort d'affichage, jamais
 * une garantie — un formulaire se contourne avec deux lignes de console.
 */

export interface DemandeInscription {
  phoneE164: string;
  birthDate: string;
  gender: 'FEMALE' | 'MALE';
  inviteCode?: string;
  consents: Array<{ type: string; documentVersion: string; granted: boolean }>;
}

export interface DefiOtp {
  challengeId: string;
  expiresAt: string;
  resendAvailableAt: string;
  /** Vrai tant que l'envoi de SMS est simulé : l'interface DOIT le dire. */
  testMode: boolean;
}

export function inscrire(demande: DemandeInscription): Promise<DefiOtp> {
  return appelerApi<DefiOtp>('/auth/register', {
    method: 'POST',
    body: {
      ...demande,
      device: { type: 'WEB' as const },
    },
  });
}

export function validerCode(challengeId: string, code: string): Promise<Session> {
  return appelerApi<Session>('/auth/otp/verify', {
    method: 'POST',
    body: { challengeId, code, device: { type: 'WEB' as const } },
  });
}
