import { describe, expect, it } from '@jest/globals';
import { computeCompletion, type ProfileSnapshot } from './profile-completion';

const vide: ProfileSnapshot = {
  firstName: null,
  birthDate: null,
  gender: null,
  cityId: null,
  bio: null,
  lookingFor: null,
  relationshipStatus: null,
  profession: null,
  educationLevel: null,
  valueSlugs: [],
  interestSlugs: [],
  approvedPhotoCount: 0,
  hasPreferences: false,
};

const complet: ProfileSnapshot = {
  firstName: 'Aminata',
  birthDate: new Date('1994-03-12T00:00:00.000Z'),
  gender: 'FEMALE',
  cityId: 'ville-douala',
  bio: 'a'.repeat(120),
  lookingFor: 'b'.repeat(80),
  relationshipStatus: 'SINGLE',
  profession: 'Infirmière',
  educationLevel: 'BACHELOR',
  valueSlugs: ['famille', 'foi', 'fidelite'],
  interestSlugs: ['lecture', 'voyage', 'cuisine', 'musique', 'sport'],
  approvedPhotoCount: 3,
  hasPreferences: true,
};

describe('taux de complétion du profil', () => {
  it('vaut 0 pour un profil vide', () => {
    expect(computeCompletion(vide).rate).toBe(0);
  });

  it('vaut exactement 100 pour un profil complet', () => {
    expect(computeCompletion(complet).rate).toBe(100);
  });

  it('totalise exactement 100 points sur la grille', () => {
    const total = computeCompletion(vide).criteria.reduce((somme, c) => somme + c.points, 0);
    expect(total).toBe(100);
  });

  it('énumère les éléments manquants pour guider le membre', () => {
    const resultat = computeCompletion(vide);
    expect(resultat.missing).toHaveLength(resultat.criteria.length);
    expect(resultat.missing.map((c) => c.key)).toContain('bio');
  });

  describe('paliers de photos', () => {
    it('accorde 15 points dès la première photo approuvée', () => {
      expect(computeCompletion({ ...vide, approvedPhotoCount: 1 }).rate).toBe(15);
    });

    it('accorde 25 points au troisième cliché', () => {
      expect(computeCompletion({ ...vide, approvedPhotoCount: 3 }).rate).toBe(25);
    });

    it('ne compte que les photos approuvées, pas celles en modération', () => {
      // Une photo en attente ne fait pas progresser : sinon un profil paraîtrait
      // complet tout en étant invisible faute de cliché publiable.
      expect(computeCompletion({ ...vide, approvedPhotoCount: 0 }).rate).toBe(0);
    });
  });

  describe('seuils de texte', () => {
    it('refuse une présentation trop courte', () => {
      expect(computeCompletion({ ...vide, bio: 'Bonjour' }).rate).toBe(0);
    });

    it('accepte une présentation à la longueur exacte', () => {
      expect(computeCompletion({ ...vide, bio: 'a'.repeat(100) }).rate).toBe(15);
    });

    it('ignore les espaces de remplissage', () => {
      expect(computeCompletion({ ...vide, bio: `  ${'a'.repeat(98)}  ` }).rate).toBe(0);
    });
  });

  describe('critères alternatifs', () => {
    it('accepte la profession seule pour le critère parcours', () => {
      expect(computeCompletion({ ...vide, profession: 'Enseignant' }).rate).toBe(5);
    });

    it("accepte le niveau d'études seul", () => {
      expect(computeCompletion({ ...vide, educationLevel: 'MASTER' }).rate).toBe(5);
    });

    it('ne double pas les points si les deux sont renseignés', () => {
      expect(
        computeCompletion({ ...vide, profession: 'Enseignant', educationLevel: 'MASTER' }).rate,
      ).toBe(5);
    });
  });

  describe("bloc d'identité", () => {
    it("n'accorde rien tant qu'un des quatre champs manque", () => {
      expect(
        computeCompletion({
          ...vide,
          firstName: 'Jean',
          birthDate: new Date('1990-01-01T00:00:00.000Z'),
          gender: 'MALE',
        }).rate,
      ).toBe(0);
    });

    it('accorde 15 points une fois les quatre champs remplis', () => {
      expect(
        computeCompletion({
          ...vide,
          firstName: 'Jean',
          birthDate: new Date('1990-01-01T00:00:00.000Z'),
          gender: 'MALE',
          cityId: 'ville-yaounde',
        }).rate,
      ).toBe(15);
    });
  });
});
