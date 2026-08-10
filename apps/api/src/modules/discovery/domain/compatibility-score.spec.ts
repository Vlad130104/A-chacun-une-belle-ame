import { describe, expect, it } from '@jest/globals';
import {
  applyDiversity,
  computeScore,
  DEFAULT_SCORING_CONFIG,
  DEFAULT_WEIGHTS,
  InvalidWeightsError,
  validateWeights,
  type Candidate,
  type Seeker,
} from './compatibility-score';

const base = {
  cityId: 'douala',
  regionCode: 'littoral',
  countryCode: 'CM',
  interestSlugs: [],
  valueSlugs: [],
  relationshipStatus: 'SINGLE',
  hasChildren: false,
  completionRate: 100,
  daysSinceActive: 0,
  isNewProfile: false,
  boostMultiplier: 1,
  impressionsToday: 0,
  preference: {
    minAge: 18,
    maxAge: 99,
    cityIds: [],
    acceptedRelationshipStatuses: ['SINGLE', 'DIVORCED', 'WIDOWED', 'SEPARATED'],
    acceptsChildren: true,
  },
};

const chercheur = (surcharge: Partial<Seeker> = {}): Seeker => ({
  ...base,
  userId: 'chercheur',
  age: 32,
  ...surcharge,
});

const candidat = (surcharge: Partial<Candidate> = {}): Candidate => ({
  ...base,
  userId: 'candidat',
  age: 32,
  ...surcharge,
});

describe('score de compatibilité', () => {
  describe('cas de référence documenté', () => {
    /**
     * Aminata et Jean, tirés de docs/04-algorithme-de-matching.md §5.
     * Toute modification du scoring qui change cette valeur sans changement de
     * configuration fait échouer la CI — c'est le rôle de ce test.
     */
    const aminata: Seeker = {
      userId: 'aminata',
      age: 32,
      cityId: 'douala',
      regionCode: 'littoral',
      countryCode: 'CM',
      interestSlugs: ['lecture', 'voyage', 'cuisine', 'musique', 'sport'],
      valueSlugs: ['famille', 'foi', 'fidelite'],
      relationshipStatus: 'SINGLE',
      hasChildren: false,
      completionRate: 85,
      daysSinceActive: 0,
      isNewProfile: false,
      boostMultiplier: 1,
      impressionsToday: 0,
      preference: {
        minAge: 30,
        maxAge: 40,
        cityIds: [],
        acceptedRelationshipStatuses: ['SINGLE'],
        acceptsChildren: true,
      },
    };

    const jean: Candidate = {
      userId: 'jean',
      age: 35,
      cityId: 'douala',
      regionCode: 'littoral',
      countryCode: 'CM',
      interestSlugs: ['lecture', 'voyage', 'football', 'cinema'],
      valueSlugs: ['famille', 'fidelite', 'ambition'],
      relationshipStatus: 'SINGLE',
      hasChildren: false,
      completionRate: 90,
      daysSinceActive: 2,
      isNewProfile: false,
      boostMultiplier: 1,
      impressionsToday: 0,
      preference: {
        minAge: 28,
        maxAge: 38,
        cityIds: [],
        acceptedRelationshipStatuses: ['SINGLE'],
        acceptsChildren: true,
      },
    };

    it('reproduit exactement le score documenté de 0,782', () => {
      const resultat = computeScore(aminata, jean);
      expect(Number(resultat.final.toFixed(3))).toBe(0.782);
    });

    it('reproduit chaque composante du tableau documenté', () => {
      const { breakdown } = computeScore(aminata, jean);
      expect(Number(breakdown.age.toFixed(3))).toBe(0.7);
      expect(breakdown.geography).toBe(1);
      expect(breakdown.interests).toBe(0.5);
      expect(Number(breakdown.values.toFixed(3))).toBe(0.667);
      expect(breakdown.family).toBe(1);
      expect(breakdown.reciprocity).toBe(1);
      expect(breakdown.completion).toBe(0.9);
      expect(breakdown.activity).toBe(0.8);
    });
  });

  describe('bornes', () => {
    it('reste dans [0, 1] pour un couple parfaitement aligné', () => {
      const resultat = computeScore(chercheur(), candidat());
      expect(resultat.base).toBeLessThanOrEqual(1);
      expect(resultat.base).toBeGreaterThanOrEqual(0);
    });

    it('ne devient jamais négatif malgré un écart d’âge extrême', () => {
      const resultat = computeScore(chercheur({ age: 20 }), candidat({ age: 75 }));
      expect(resultat.breakdown.age).toBe(0);
      expect(resultat.base).toBeGreaterThanOrEqual(0);
    });
  });

  describe('C1 — âge', () => {
    it('vaut 1 à âge identique', () => {
      expect(computeScore(chercheur({ age: 30 }), candidat({ age: 30 })).breakdown.age).toBe(1);
    });

    it('décroît linéairement jusqu’à la tolérance', () => {
      expect(computeScore(chercheur({ age: 30 }), candidat({ age: 35 })).breakdown.age).toBe(0.5);
    });

    it('s’annule au-delà de la tolérance', () => {
      expect(computeScore(chercheur({ age: 30 }), candidat({ age: 41 })).breakdown.age).toBe(0);
    });
  });

  describe('C2 — géographie', () => {
    it.each([
      ['même ville', { cityId: 'douala', regionCode: 'littoral', countryCode: 'CM' }, 1],
      ['même région', { cityId: 'edea', regionCode: 'littoral', countryCode: 'CM' }, 0.7],
      ['même pays', { cityId: 'yaounde', regionCode: 'centre', countryCode: 'CM' }, 0.4],
      ['pays différent', { cityId: 'cotonou', regionCode: 'littoral-bj', countryCode: 'BJ' }, 0.1],
    ])('vaut %s → %s', (_cas, geo, attendu) => {
      expect(computeScore(chercheur(), candidat(geo)).breakdown.geography).toBe(attendu);
    });

    it('ne descend jamais à zéro : la diaspora doit rester visible', () => {
      const lointain = computeScore(
        chercheur(),
        candidat({ cityId: 'paris', regionCode: 'idf', countryCode: 'FR' }),
      );
      expect(lointain.breakdown.geography).toBeGreaterThan(0);
    });
  });

  describe('C3 — intérêts communs', () => {
    it('rapporte les communs au plus petit ensemble, pas à l’union', () => {
      // Quinze intérêts contre trois : celui qui en a déclaré beaucoup ne doit pas
      // être pénalisé pour sa générosité de saisie.
      const resultat = computeScore(
        chercheur({ interestSlugs: Array.from({ length: 15 }, (_, i) => `i${i}`) }),
        candidat({ interestSlugs: ['i0', 'i1', 'i2'] }),
      );
      expect(resultat.breakdown.interests).toBe(1);
    });

    it('vaut 0 sans intérêt commun', () => {
      expect(
        computeScore(chercheur({ interestSlugs: ['a'] }), candidat({ interestSlugs: ['b'] }))
          .breakdown.interests,
      ).toBe(0);
    });

    it('ne divise pas par zéro sur des ensembles vides', () => {
      expect(computeScore(chercheur(), candidat()).breakdown.interests).toBe(0);
    });
  });

  describe('C4 — valeurs', () => {
    it('reste neutre à 0,5 si l’un des deux n’a rien déclaré', () => {
      expect(
        computeScore(chercheur({ valueSlugs: [] }), candidat({ valueSlugs: ['famille'] })).breakdown
          .values,
      ).toBe(0.5);
    });

    it('vaut 1 sur des valeurs identiques', () => {
      expect(
        computeScore(
          chercheur({ valueSlugs: ['famille', 'foi'] }),
          candidat({ valueSlugs: ['famille', 'foi'] }),
        ).breakdown.values,
      ).toBe(1);
    });
  });

  describe('C5 — situation familiale', () => {
    it('vaut 1 quand chacun accepte la situation de l’autre', () => {
      expect(computeScore(chercheur(), candidat()).breakdown.family).toBe(1);
    });

    it('tombe à 0,5 quand un seul accepte', () => {
      const resultat = computeScore(
        chercheur({
          preference: { ...base.preference, acceptedRelationshipStatuses: ['SINGLE'] },
        }),
        candidat({
          relationshipStatus: 'SINGLE',
          preference: { ...base.preference, acceptedRelationshipStatuses: ['DIVORCED'] },
        }),
      );
      expect(resultat.breakdown.family).toBe(0.5);
    });

    it('applique une pénalité, non une exclusion, sur les enfants', () => {
      const resultat = computeScore(
        chercheur({ preference: { ...base.preference, acceptsChildren: false } }),
        candidat({ hasChildren: true }),
      );
      // Non éliminatoire : le critère est déclaratif et souvent mal renseigné au début.
      expect(resultat.breakdown.family).toBeCloseTo(0.3, 5);
    });
  });

  describe('C6 — réciprocité', () => {
    it('vaut 1 quand le chercheur correspond aux critères du candidat', () => {
      expect(computeScore(chercheur(), candidat()).breakdown.reciprocity).toBe(1);
    });

    it('perd 0,4 si le chercheur est hors de la tranche du candidat', () => {
      const resultat = computeScore(
        chercheur({ age: 60 }),
        candidat({ age: 60, preference: { ...base.preference, minAge: 20, maxAge: 30 } }),
      );
      expect(resultat.breakdown.reciprocity).toBeCloseTo(0.6, 5);
    });

    it('perd 0,3 si le profil du chercheur est trop peu complété', () => {
      expect(
        computeScore(chercheur({ completionRate: 40 }), candidat()).breakdown.reciprocity,
      ).toBeCloseTo(0.7, 5);
    });
  });

  describe('C8 — activité récente', () => {
    it.each([
      [0, 1],
      [1, 1],
      [3, 0.8],
      [7, 0.6],
      [30, 0.3],
      [90, 0.05],
    ])('%s jours depuis la dernière activité → %s', (jours, attendu) => {
      expect(
        computeScore(chercheur(), candidat({ daysSinceActive: jours })).breakdown.activity,
      ).toBe(attendu);
    });
  });

  describe('modulation du score final', () => {
    it('applique le coefficient de boost', () => {
      const sans = computeScore(chercheur(), candidat());
      const avec = computeScore(chercheur(), candidat({ boostMultiplier: 2 }));
      expect(avec.final).toBeCloseTo(sans.final * 2, 5);
    });

    it('ne modifie jamais le score de base', () => {
      // Le boost classe mieux, il ne change pas la compatibilité réelle.
      const avec = computeScore(chercheur(), candidat({ boostMultiplier: 2 }));
      const sans = computeScore(chercheur(), candidat());
      expect(avec.base).toBe(sans.base);
    });

    it('favorise légèrement un profil récent', () => {
      const nouveau = computeScore(chercheur(), candidat({ isNewProfile: true }));
      const ancien = computeScore(chercheur(), candidat());
      expect(nouveau.final).toBeCloseTo(ancien.final * 1.15, 5);
    });

    it('pénalise un profil déjà très exposé aujourd’hui', () => {
      const sature = computeScore(chercheur(), candidat({ impressionsToday: 80 }));
      const normal = computeScore(chercheur(), candidat());
      expect(sature.final).toBeCloseTo(normal.final * 0.85, 5);
    });
  });

  describe('validation des pondérations', () => {
    it('accepte les pondérations par défaut', () => {
      expect(() => validateWeights(DEFAULT_WEIGHTS)).not.toThrow();
    });

    it('refuse une somme différente de 1', () => {
      expect(() => validateWeights({ ...DEFAULT_WEIGHTS, age: 0.5 })).toThrow(InvalidWeightsError);
    });

    it('tolère un écart d’arrondi infime', () => {
      expect(() => validateWeights({ ...DEFAULT_WEIGHTS, age: 0.2005 })).not.toThrow();
    });

    it('refuse de scorer avec une configuration invalide', () => {
      expect(() =>
        computeScore(chercheur(), candidat(), {
          ...DEFAULT_SCORING_CONFIG,
          weights: { ...DEFAULT_WEIGHTS, activity: 0.5 },
        }),
      ).toThrow(InvalidWeightsError);
    });
  });
});

describe('diversité du lot', () => {
  const profil = (id: string, cityId: string, score: number) => ({ id, cityId, score });

  it('limite la part d’une même ville quand des alternatives proches existent', () => {
    const classes = [
      profil('a', 'douala', 0.9),
      profil('b', 'douala', 0.89),
      profil('c', 'douala', 0.88),
      profil('d', 'yaounde', 0.85),
      profil('e', 'yaounde', 0.84),
    ];

    const lot = applyDiversity(classes, 5);
    const douala = lot.filter((item) => item.cityId === 'douala').length;
    expect(douala).toBeLessThanOrEqual(3);
  });

  it('complète le lot plutôt que de le laisser incomplet', () => {
    const toutDouala = Array.from({ length: 10 }, (_, index) =>
      profil(`p${index}`, 'douala', 0.9 - index * 0.01),
    );
    // Mieux vaut un lot complet qu'un lot diversifié mais vide.
    expect(applyDiversity(toutDouala, 5)).toHaveLength(5);
  });

  it('respecte l’ordre de score à l’intérieur du lot retenu', () => {
    const classes = [
      profil('a', 'douala', 0.9),
      profil('b', 'yaounde', 0.8),
      profil('c', 'bafoussam', 0.7),
    ];
    expect(applyDiversity(classes, 3).map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });
});
