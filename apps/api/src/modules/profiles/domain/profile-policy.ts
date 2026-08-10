/**
 * Règles de publication et de disponibilité du profil (stories D3-01 et D3-08).
 *
 * La publication est la porte d'entrée dans la découverte : elle exige simultanément
 * une identité vérifiée, une complétion suffisante et une photo approuvée. Un seul de
 * ces trois manquants suffit à garder le profil invisible.
 */

export type ProfileStatusValue =
  'DRAFT' | 'ACTIVE' | 'PAUSED' | 'DEACTIVATED' | 'HIDDEN_BY_MODERATION';

export type PublishBlocker =
  'NOT_VERIFIED' | 'INCOMPLETE' | 'NO_APPROVED_PHOTO' | 'HIDDEN_BY_MODERATION';

export type PublishVerdict = { allowed: true } | { allowed: false; blockers: PublishBlocker[] };

export interface PublishInput {
  verificationStatus: string;
  completionRate: number;
  approvedPhotoCount: number;
  currentStatus: ProfileStatusValue;
  minimumCompletion: number;
  minimumPhotos: number;
}

export function canPublish(input: PublishInput): PublishVerdict {
  const blockers: PublishBlocker[] = [];

  if (input.currentStatus === 'HIDDEN_BY_MODERATION') blockers.push('HIDDEN_BY_MODERATION');
  if (input.verificationStatus !== 'VERIFIED') blockers.push('NOT_VERIFIED');
  if (input.completionRate < input.minimumCompletion) blockers.push('INCOMPLETE');
  if (input.approvedPhotoCount < input.minimumPhotos) blockers.push('NO_APPROVED_PHOTO');

  return blockers.length === 0 ? { allowed: true } : { allowed: false, blockers };
}

/**
 * Transitions de disponibilité demandées par le membre.
 * `HIDDEN_BY_MODERATION` n'est jamais réversible par le membre : seule une décision de
 * modération peut le lever (docs/07-parcours-ux.md, écran 19).
 */
const MEMBER_TRANSITIONS: Record<ProfileStatusValue, ProfileStatusValue[]> = {
  DRAFT: ['ACTIVE'],
  ACTIVE: ['PAUSED', 'DEACTIVATED'],
  PAUSED: ['ACTIVE', 'DEACTIVATED'],
  DEACTIVATED: ['ACTIVE'],
  HIDDEN_BY_MODERATION: [],
};

export function canChangeStatus(current: ProfileStatusValue, target: ProfileStatusValue): boolean {
  return MEMBER_TRANSITIONS[current].includes(target);
}

/** Seul un profil ACTIF apparaît dans la découverte (filtre E4 du matching). */
export function isDiscoverable(status: ProfileStatusValue): boolean {
  return status === 'ACTIVE';
}

/**
 * Assainissement des textes libres avant stockage.
 *
 * On ne « nettoie » pas du HTML pour l'autoriser ensuite : on refuse tout balisage.
 * Les champs de profil sont du texte, affiché comme du texte.
 */
export function sanitizeFreeText(value: string): string {
  return (
    value
      .replace(/<[^>]*>/g, '')
      // Retirer des caractères de contrôle suppose de les matcher : c'est l'objet
      // même de cette ligne, d'où la dérogation.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * Détecte une tentative de sortie de plateforme dans un texte de profil : numéro de
 * téléphone, adresse e-mail ou identifiant de messagerie. Ce n'est pas une sanction —
 * c'est un signal transmis à la modération, car contourner la messagerie interne prive
 * le membre de toutes les protections (blocage, signalement, historique).
 */
export function detectContactSharing(value: string): boolean {
  const numeroLong = /(?:\+?\d[\s.-]?){9,}/;
  const email = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
  const messagerie = /\b(whatsapp|telegram|snap(?:chat)?|instagram|signal)\b/i;

  return numeroLong.test(value) || email.test(value) || messagerie.test(value);
}
