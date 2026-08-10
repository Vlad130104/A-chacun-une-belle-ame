/**
 * Règles applicables aux photos de profil (stories D3-03, D3-05, D3-11).
 *
 * Contrairement aux pièces d'identité, ces images sont vues par d'autres membres :
 * elles passent donc par une modération avant publication, et jamais l'inverse.
 */

export type PhotoStatusValue =
  'UPLOADING' | 'PENDING_MODERATION' | 'APPROVED' | 'REJECTED' | 'HIDDEN_BY_MODERATION' | 'DELETED';

export interface PhotoSlot {
  id: string;
  position: number;
  status: PhotoStatusValue;
}

export type PhotoRejection = 'MAX_REACHED' | 'INVALID_FORMAT' | 'TOO_LARGE' | 'TOO_SMALL';

/** Seules ces photos sont visibles des autres membres. */
export function isPubliclyVisible(status: PhotoStatusValue): boolean {
  return status === 'APPROVED';
}

/** Photos comptant dans le quota : une photo supprimée libère sa place. */
export function countsTowardQuota(status: PhotoStatusValue): boolean {
  return status !== 'DELETED' && status !== 'REJECTED';
}

export function canAddPhoto(existing: PhotoSlot[], maxPhotos: number): boolean {
  return existing.filter((photo) => countsTowardQuota(photo.status)).length < maxPhotos;
}

/** Première position libre, pour éviter les trous dans la grille. */
export function nextPosition(existing: PhotoSlot[], maxPhotos: number): number | null {
  const occupees = new Set(
    existing.filter((photo) => countsTowardQuota(photo.status)).map((photo) => photo.position),
  );
  for (let position = 0; position < maxPhotos; position += 1) {
    if (!occupees.has(position)) return position;
  }
  return null;
}

/**
 * Une photo principale doit être approuvée : afficher une photo en attente ferait
 * apparaître dans la découverte un contenu non modéré.
 */
export function canBePrimary(photo: PhotoSlot): boolean {
  return photo.status === 'APPROVED';
}

export type ReorderVerdict =
  | { valid: true; positions: Array<{ id: string; position: number }> }
  | { valid: false; reason: 'UNKNOWN_PHOTO' | 'DUPLICATE_POSITION' | 'INCOMPLETE_ORDER' };

/**
 * Réordonnancement : le client envoie la liste complète des identifiants, dans
 * l'ordre voulu. On refuse un ordre partiel — appliquer une permutation incomplète
 * produirait des positions en double.
 */
export function computeReorder(existing: PhotoSlot[], orderedIds: string[]): ReorderVerdict {
  const actives = existing.filter((photo) => countsTowardQuota(photo.status));
  const connus = new Set(actives.map((photo) => photo.id));

  if (new Set(orderedIds).size !== orderedIds.length) {
    return { valid: false, reason: 'DUPLICATE_POSITION' };
  }
  if (orderedIds.some((id) => !connus.has(id))) {
    return { valid: false, reason: 'UNKNOWN_PHOTO' };
  }
  if (orderedIds.length !== actives.length) {
    return { valid: false, reason: 'INCOMPLETE_ORDER' };
  }

  return {
    valid: true,
    positions: orderedIds.map((id, index) => ({ id, position: index })),
  };
}

/**
 * Distance de Hamming entre deux empreintes perceptuelles hexadécimales.
 * Sert à repérer la même photo réutilisée sur plusieurs comptes — signal de faux
 * profil, jamais une sanction automatique (ADR-012).
 */
export function perceptualDistance(hashA: string, hashB: string): number {
  if (hashA.length !== hashB.length) return Number.POSITIVE_INFINITY;

  let distance = 0;
  for (let index = 0; index < hashA.length; index += 1) {
    const a = Number.parseInt(hashA[index] ?? '0', 16);
    const b = Number.parseInt(hashB[index] ?? '0', 16);
    let diff = a ^ b;
    while (diff > 0) {
      distance += diff & 1;
      diff >>= 1;
    }
  }
  return distance;
}

/** Au-delà de ce seuil, deux images sont considérées comme distinctes. */
export const PERCEPTUAL_MATCH_THRESHOLD = 5;

export function looksLikeSameImage(hashA: string, hashB: string): boolean {
  return perceptualDistance(hashA, hashB) <= PERCEPTUAL_MATCH_THRESHOLD;
}
