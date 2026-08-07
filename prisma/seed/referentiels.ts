/**
 * Référentiels fermés (ADR-011 : pas de saisie libre pour la ville, pas de GPS).
 *
 * Liste indicative, à compléter avec le porteur de projet. Aucune donnée réelle de
 * membre n'apparaît jamais dans un seed.
 */

export interface VilleSeed {
  countryCode: string;
  name: string;
  region: string;
  slug: string;
}

export const VILLES: VilleSeed[] = [
  // Cameroun
  { countryCode: 'CM', name: 'Douala', region: 'Littoral', slug: 'douala' },
  { countryCode: 'CM', name: 'Yaoundé', region: 'Centre', slug: 'yaounde' },
  { countryCode: 'CM', name: 'Bafoussam', region: 'Ouest', slug: 'bafoussam' },
  { countryCode: 'CM', name: 'Bamenda', region: 'Nord-Ouest', slug: 'bamenda' },
  { countryCode: 'CM', name: 'Garoua', region: 'Nord', slug: 'garoua' },
  { countryCode: 'CM', name: 'Maroua', region: 'Extrême-Nord', slug: 'maroua' },
  { countryCode: 'CM', name: 'Ngaoundéré', region: 'Adamaoua', slug: 'ngaoundere' },
  { countryCode: 'CM', name: 'Buéa', region: 'Sud-Ouest', slug: 'buea' },
  { countryCode: 'CM', name: 'Bertoua', region: 'Est', slug: 'bertoua' },
  { countryCode: 'CM', name: 'Ebolowa', region: 'Sud', slug: 'ebolowa' },
  { countryCode: 'CM', name: 'Kribi', region: 'Sud', slug: 'kribi' },
  { countryCode: 'CM', name: 'Limbé', region: 'Sud-Ouest', slug: 'limbe' },
  { countryCode: 'CM', name: 'Edéa', region: 'Littoral', slug: 'edea' },
  { countryCode: 'CM', name: 'Dschang', region: 'Ouest', slug: 'dschang' },

  // Bénin
  { countryCode: 'BJ', name: 'Cotonou', region: 'Littoral', slug: 'cotonou' },
  { countryCode: 'BJ', name: 'Porto-Novo', region: 'Ouémé', slug: 'porto-novo' },
  { countryCode: 'BJ', name: 'Parakou', region: 'Borgou', slug: 'parakou' },
  { countryCode: 'BJ', name: 'Abomey-Calavi', region: 'Atlantique', slug: 'abomey-calavi' },
  { countryCode: 'BJ', name: 'Bohicon', region: 'Zou', slug: 'bohicon' },
  { countryCode: 'BJ', name: 'Natitingou', region: 'Atacora', slug: 'natitingou' },
  { countryCode: 'BJ', name: 'Djougou', region: 'Donga', slug: 'djougou' },
  { countryCode: 'BJ', name: 'Ouidah', region: 'Atlantique', slug: 'ouidah' },
  { countryCode: 'BJ', name: 'Lokossa', region: 'Mono', slug: 'lokossa' },
  { countryCode: 'BJ', name: 'Abomey', region: 'Zou', slug: 'abomey' },

  // Côte d'Ivoire
  { countryCode: 'CI', name: 'Abidjan', region: 'Lagunes', slug: 'abidjan' },
  { countryCode: 'CI', name: 'Yamoussoukro', region: 'Lacs', slug: 'yamoussoukro' },
  { countryCode: 'CI', name: 'Bouaké', region: 'Vallée du Bandama', slug: 'bouake' },
  { countryCode: 'CI', name: 'Daloa', region: 'Haut-Sassandra', slug: 'daloa' },
  { countryCode: 'CI', name: 'San-Pédro', region: 'Bas-Sassandra', slug: 'san-pedro' },
  { countryCode: 'CI', name: 'Korhogo', region: 'Savanes', slug: 'korhogo' },
  { countryCode: 'CI', name: 'Man', region: 'Montagnes', slug: 'man' },
  { countryCode: 'CI', name: 'Gagnoa', region: 'Gôh', slug: 'gagnoa' },
  { countryCode: 'CI', name: 'Divo', region: 'Lôh-Djiboua', slug: 'divo' },
  { countryCode: 'CI', name: 'Abengourou', region: 'Indénié-Djuablin', slug: 'abengourou' },
];

export interface InteretSeed {
  slug: string;
  label: string;
  category: string;
}

/**
 * La catégorie `valeurs` alimente la composante C4 du score de compatibilité
 * (docs/04-algorithme-de-matching.md §3.6). Les autres catégories alimentent C3.
 */
export const INTERETS: InteretSeed[] = [
  // Valeurs — meilleur prédicteur d'une relation sérieuse
  { slug: 'famille', label: 'La famille', category: 'valeurs' },
  { slug: 'fidelite', label: 'La fidélité', category: 'valeurs' },
  { slug: 'foi', label: 'La foi', category: 'valeurs' },
  { slug: 'honnetete', label: "L'honnêteté", category: 'valeurs' },
  { slug: 'ambition', label: "L'ambition", category: 'valeurs' },
  { slug: 'respect', label: 'Le respect', category: 'valeurs' },
  { slug: 'generosite', label: 'La générosité', category: 'valeurs' },
  { slug: 'engagement', label: "L'engagement", category: 'valeurs' },
  { slug: 'humour', label: "L'humour", category: 'valeurs' },
  { slug: 'independance', label: "L'indépendance", category: 'valeurs' },

  // Sport
  { slug: 'football', label: 'Football', category: 'sport' },
  { slug: 'basket', label: 'Basket', category: 'sport' },
  { slug: 'course', label: 'Course à pied', category: 'sport' },
  { slug: 'fitness', label: 'Fitness', category: 'sport' },
  { slug: 'natation', label: 'Natation', category: 'sport' },
  { slug: 'danse', label: 'Danse', category: 'sport' },

  // Culture et loisirs
  { slug: 'lecture', label: 'Lecture', category: 'culture' },
  { slug: 'musique', label: 'Musique', category: 'culture' },
  { slug: 'cinema', label: 'Cinéma', category: 'culture' },
  { slug: 'theatre', label: 'Théâtre', category: 'culture' },
  { slug: 'photographie', label: 'Photographie', category: 'culture' },
  { slug: 'ecriture', label: 'Écriture', category: 'culture' },
  { slug: 'art', label: 'Art', category: 'culture' },
  { slug: 'podcasts', label: 'Podcasts', category: 'culture' },

  // Vie quotidienne
  { slug: 'cuisine', label: 'Cuisine', category: 'quotidien' },
  { slug: 'voyage', label: 'Voyage', category: 'quotidien' },
  { slug: 'jardinage', label: 'Jardinage', category: 'quotidien' },
  { slug: 'bricolage', label: 'Bricolage', category: 'quotidien' },
  { slug: 'mode', label: 'Mode', category: 'quotidien' },
  { slug: 'nature', label: 'Nature', category: 'quotidien' },
  { slug: 'animaux', label: 'Animaux', category: 'quotidien' },

  // Engagement et projets
  { slug: 'entrepreneuriat', label: 'Entrepreneuriat', category: 'projets' },
  { slug: 'benevolat', label: 'Bénévolat', category: 'projets' },
  { slug: 'education', label: 'Éducation', category: 'projets' },
  { slug: 'technologie', label: 'Technologie', category: 'projets' },
  { slug: 'agriculture', label: 'Agriculture', category: 'projets' },
  { slug: 'sante', label: 'Santé', category: 'projets' },
];

export interface PlanSeed {
  code: string;
  name: string;
  description: string;
  interval: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'ONE_TIME';
  priceMinor: number;
  currency: string;
  countryCode: string | null;
  entitlements: Record<string, unknown>;
  sortOrder: number;
}

/**
 * Tarifs de DÉMONSTRATION en « Mode test ».
 *
 * La grille réelle dépend d'une étude de prix locale (question Q8 du cadrage) et
 * n'est pas inventée ici. Rappel ADR-009 : XAF et XOF n'ont pas de sous-unité —
 * 5 000 F CFA se stocke `5000`.
 */
export const PLANS: PlanSeed[] = [
  {
    code: 'premium_monthly',
    name: 'Premium — mensuel',
    description: 'Filtres avancés, visibilité renforcée, davantage de suggestions.',
    interval: 'MONTHLY',
    priceMinor: 5000,
    currency: 'XAF',
    countryCode: 'CM',
    entitlements: {
      dailySuggestions: 30,
      dailyLikes: 50,
      advancedFilters: true,
      seeReceivedInterests: true,
      monthlyBoosts: 1,
    },
    sortOrder: 1,
  },
  {
    code: 'premium_quarterly',
    name: 'Premium — trimestriel',
    description: 'Trois mois de Premium.',
    interval: 'QUARTERLY',
    priceMinor: 13000,
    currency: 'XAF',
    countryCode: 'CM',
    entitlements: {
      dailySuggestions: 30,
      dailyLikes: 50,
      advancedFilters: true,
      seeReceivedInterests: true,
      monthlyBoosts: 1,
    },
    sortOrder: 2,
  },
  {
    code: 'premium_yearly',
    name: 'Premium — annuel',
    description: 'Douze mois de Premium.',
    interval: 'YEARLY',
    priceMinor: 45000,
    currency: 'XAF',
    countryCode: 'CM',
    entitlements: {
      dailySuggestions: 30,
      dailyLikes: 50,
      advancedFilters: true,
      seeReceivedInterests: true,
      monthlyBoosts: 2,
    },
    sortOrder: 3,
  },
  {
    code: 'boost_single',
    name: 'Boost — 24 heures',
    description: 'Mise en avant temporaire du profil dans les suggestions.',
    interval: 'ONE_TIME',
    priceMinor: 1000,
    currency: 'XAF',
    countryCode: null,
    entitlements: { boostHours: 24, multiplier: 2 },
    sortOrder: 4,
  },
];

export interface FlagSeed {
  key: string;
  description: string;
  enabled: boolean;
  payload?: Record<string, unknown>;
}

export const FEATURE_FLAGS: FlagSeed[] = [
  {
    key: 'payments.enabled',
    description:
      'Active la souscription payante. Désactivé tant qu’aucun agrégateur réel n’est contractualisé (question Q3).',
    enabled: false,
  },
  {
    key: 'premium.filters',
    description: 'Filtres avancés réservés à l’offre Premium.',
    enabled: false,
  },
  {
    key: 'premium.seeLikes',
    description: 'Lève le floutage des intérêts reçus pour les membres Premium.',
    enabled: false,
  },
  { key: 'boost.enabled', description: 'Achat de boost à l’unité.', enabled: false },
  {
    key: 'push.enabled',
    description: 'Notifications push. Désactivé tant que le port est simulé.',
    enabled: false,
  },
  {
    key: 'moderation.autoRules',
    description: 'Règles de détection automatique de comportements suspects.',
    enabled: true,
  },
  {
    key: 'migration.launchOffer',
    description: 'Offre de lancement réservée aux membres historiques du groupe WhatsApp.',
    enabled: true,
    payload: { freeDays: 30, planCode: 'premium_monthly' },
  },
  {
    key: 'matching.weights',
    description:
      'Pondérations du score de compatibilité. La somme doit valoir 1,0 (docs/04-algorithme-de-matching.md §3.2).',
    enabled: true,
    payload: {
      age: 0.2,
      geography: 0.15,
      interests: 0.2,
      values: 0.1,
      family: 0.1,
      reciprocity: 0.1,
      completion: 0.05,
      activity: 0.1,
    },
  },
];
