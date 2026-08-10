import { describe, expect, it } from '@jest/globals';
import {
  canAddPhoto,
  canBePrimary,
  computeReorder,
  countsTowardQuota,
  isPubliclyVisible,
  looksLikeSameImage,
  nextPosition,
  perceptualDistance,
  type PhotoSlot,
  type PhotoStatusValue,
} from './photo-policy';

const photo = (id: string, position: number, status: PhotoStatusValue = 'APPROVED'): PhotoSlot => ({
  id,
  position,
  status,
});

describe('visibilité des photos', () => {
  it('n’expose publiquement qu’une photo approuvée', () => {
    expect(isPubliclyVisible('APPROVED')).toBe(true);
  });

  it.each<[PhotoStatusValue]>([
    ['UPLOADING'],
    ['PENDING_MODERATION'],
    ['REJECTED'],
    ['HIDDEN_BY_MODERATION'],
    ['DELETED'],
  ])('masque une photo %s', (statut) => {
    expect(isPubliclyVisible(statut)).toBe(false);
  });

  it('garde une photo en attente hors de la vue des autres membres', () => {
    // Point non négociable : aucune image non modérée ne doit apparaître.
    expect(isPubliclyVisible('PENDING_MODERATION')).toBe(false);
  });
});

describe('quota de photos', () => {
  it('autorise l’ajout tant que le maximum n’est pas atteint', () => {
    expect(canAddPhoto([photo('a', 0), photo('b', 1)], 6)).toBe(true);
  });

  it('refuse au-delà du maximum', () => {
    const pleines = Array.from({ length: 6 }, (_, index) => photo(`p${index}`, index));
    expect(canAddPhoto(pleines, 6)).toBe(false);
  });

  it('libère une place après suppression', () => {
    const pleines = Array.from({ length: 6 }, (_, index) => photo(`p${index}`, index));
    pleines[2] = photo('p2', 2, 'DELETED');
    expect(canAddPhoto(pleines, 6)).toBe(true);
  });

  it('ne compte pas une photo refusée dans le quota', () => {
    expect(countsTowardQuota('REJECTED')).toBe(false);
  });

  it('compte une photo en attente de modération', () => {
    // Sinon on pourrait saturer la file de modération en boucle.
    expect(countsTowardQuota('PENDING_MODERATION')).toBe(true);
  });
});

describe('attribution de position', () => {
  it('donne la première position libre', () => {
    expect(nextPosition([photo('a', 0), photo('b', 2)], 6)).toBe(1);
  });

  it('donne 0 sur une grille vide', () => {
    expect(nextPosition([], 6)).toBe(0);
  });

  it('retourne null quand la grille est pleine', () => {
    const pleines = Array.from({ length: 6 }, (_, index) => photo(`p${index}`, index));
    expect(nextPosition(pleines, 6)).toBeNull();
  });
});

describe('photo principale', () => {
  it('accepte une photo approuvée', () => {
    expect(canBePrimary(photo('a', 0))).toBe(true);
  });

  it('refuse une photo encore en modération', () => {
    expect(canBePrimary(photo('a', 0, 'PENDING_MODERATION'))).toBe(false);
  });
});

describe('réordonnancement', () => {
  const grille = [photo('a', 0), photo('b', 1), photo('c', 2)];

  it('recalcule les positions dans l’ordre demandé', () => {
    expect(computeReorder(grille, ['c', 'a', 'b'])).toEqual({
      valid: true,
      positions: [
        { id: 'c', position: 0 },
        { id: 'a', position: 1 },
        { id: 'b', position: 2 },
      ],
    });
  });

  it('refuse un ordre partiel', () => {
    expect(computeReorder(grille, ['c', 'a'])).toEqual({
      valid: false,
      reason: 'INCOMPLETE_ORDER',
    });
  });

  it('refuse un identifiant en double', () => {
    expect(computeReorder(grille, ['a', 'a', 'b'])).toEqual({
      valid: false,
      reason: 'DUPLICATE_POSITION',
    });
  });

  it('refuse une photo qui n’appartient pas à la grille', () => {
    expect(computeReorder(grille, ['a', 'b', 'inconnue'])).toEqual({
      valid: false,
      reason: 'UNKNOWN_PHOTO',
    });
  });
});

describe('empreinte perceptuelle', () => {
  it('donne une distance nulle entre deux empreintes identiques', () => {
    expect(perceptualDistance('ff00ff00', 'ff00ff00')).toBe(0);
  });

  it('compte les bits qui diffèrent', () => {
    expect(perceptualDistance('0000000f', '0000000e')).toBe(1);
  });

  it('considère des empreintes de longueurs différentes comme incomparables', () => {
    expect(perceptualDistance('ff00', 'ff0000')).toBe(Number.POSITIVE_INFINITY);
  });

  it('reconnaît la même image malgré une légère différence de compression', () => {
    expect(looksLikeSameImage('ff00ff00ff00ff00', 'ff00ff00ff00ff01')).toBe(true);
  });

  it('distingue deux images sans rapport', () => {
    expect(looksLikeSameImage('ffffffffffffffff', '0000000000000000')).toBe(false);
  });
});
