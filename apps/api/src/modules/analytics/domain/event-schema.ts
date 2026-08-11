/**
 * Schéma déclaré des événements produit (story D10-05).
 *
 * La règle qui commande ce fichier : **une propriété non déclarée est rejetée**.
 *
 * Ce n'est pas une contrainte de rigueur, c'est une protection. Un système
 * d'analytics collecte par nature beaucoup, longtemps, et se retrouve exporté
 * vers des outils tiers. Si n'importe quelle clé pouvait y entrer, il suffirait
 * d'un `properties: { ...user }` écrit un soir de hâte pour que des numéros de
 * téléphone se retrouvent dans un tableau de bord marketing, sans que personne
 * s'en aperçoive avant des mois.
 *
 * La liste blanche rend cet accident impossible : ce qui n'est pas prévu ne
 * passe pas.
 */

export type PropertyType = 'string' | 'number' | 'boolean';

/**
 * Noms d'événements admis, en type.
 *
 * La liste blanche protège les *propriétés* à l'exécution ; celle-ci protège le
 * *nom* à la compilation. Aucun appelant ne peut donc inventer un événement : il
 * faudrait d'abord l'ajouter ici, donc le déclarer et le faire relire. Un test
 * vérifie que cette liste et `EVENT_DEFINITIONS` restent exactement en regard.
 */
export const EVENT_NAMES = [
  'invite.clicked',
  'signup.started',
  'signup.completed',
  'verification.submitted',
  'verification.approved',
  'verification.rejected',
  'profile.completed',
  'discovery.viewed',
  'interest.sent',
  'match.created',
  'conversation.started',
  'subscription.started',
  'report.filed',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export interface EventDefinition {
  name: EventName;
  description: string;
  /** Propriétés autorisées, et leur type. Rien d'autre ne sera accepté. */
  properties: Record<string, PropertyType>;
}

/**
 * Les événements du tunnel de migration et d'usage.
 *
 * Aucun ne porte de champ libre : chaque valeur est soit un identifiant
 * technique (code de campagne, ville), soit une catégorie fermée, soit un
 * nombre. Une chaîne libre finirait tôt ou tard par contenir un prénom.
 */
export const EVENT_DEFINITIONS: EventDefinition[] = [
  {
    name: 'invite.clicked',
    description: 'Un lien de campagne ou de parrainage a été ouvert.',
    properties: { campaignCode: 'string', source: 'string' },
  },
  {
    name: 'signup.started',
    description: 'Formulaire d’inscription ouvert.',
    properties: { campaignCode: 'string' },
  },
  {
    name: 'signup.completed',
    description: 'Compte créé, OTP validé.',
    properties: { campaignCode: 'string', hasInvite: 'boolean' },
  },
  {
    name: 'verification.submitted',
    description: 'Pièce d’identité déposée.',
    properties: { documentType: 'string' },
  },
  {
    name: 'verification.approved',
    description: 'Identité vérifiée.',
    properties: { delayHours: 'number' },
  },
  {
    name: 'verification.rejected',
    description: 'Vérification refusée.',
    properties: { reasonCode: 'string' },
  },
  {
    name: 'profile.completed',
    description: 'Profil publié, seuil de complétion atteint.',
    properties: { completionRate: 'number', photoCount: 'number' },
  },
  {
    name: 'discovery.viewed',
    description: 'Lot de suggestions servi.',
    properties: { count: 'number' },
  },
  {
    name: 'interest.sent',
    description: 'Intérêt manifesté.',
    properties: { reciprocal: 'boolean' },
  },
  {
    name: 'match.created',
    description: 'Accord mutuel établi.',
    properties: { score: 'number' },
  },
  {
    name: 'conversation.started',
    description: 'Premier message d’une conversation.',
    properties: { delayMinutes: 'number' },
  },
  {
    name: 'subscription.started',
    description: 'Souscription engagée.',
    properties: { planCode: 'string', promotional: 'boolean' },
  },
  {
    name: 'report.filed',
    description: 'Signalement déposé.',
    properties: { category: 'string' },
  },
];

// Clé volontairement élargie à `string` : `knownEvent` et `definitionOf`
// reçoivent des chaînes non validées, c'est même leur raison d'être.
const PAR_NOM = new Map<string, EventDefinition>(
  EVENT_DEFINITIONS.map((definition) => [definition.name, definition]),
);

export function knownEvent(name: string): boolean {
  return PAR_NOM.has(name);
}

export function definitionOf(name: string): EventDefinition | undefined {
  return PAR_NOM.get(name);
}

/**
 * Clés formellement interdites, quel que soit l'événement.
 *
 * Redondant avec la liste blanche — et c'est voulu. Si quelqu'un ajoute un jour
 * une propriété au schéma sans réfléchir, ce second filtre l'arrête. Le test
 * associé lit cette liste : elle est le rappel écrit de ce qui n'entre jamais
 * dans l'analytique.
 */
export const FORBIDDEN_KEYS: string[] = [
  'phone',
  'phoneE164',
  'msisdn',
  'email',
  'firstName',
  'lastName',
  'name',
  'birthDate',
  'body',
  'message',
  'content',
  'photo',
  'photoUrl',
  'storageKey',
  'documentNumber',
  'password',
  'token',
  'secret',
  'ip',
  'address',
  'latitude',
  'longitude',
];

/**
 * Suffixes qui désignent un AGRÉGAT, non une donnée.
 *
 * `photoCount` contient « photo » mais ne transporte aucune photo : c'est un
 * entier. Sans cette exemption, la liste noire refuserait des mesures
 * parfaitement anodines, et la tentation serait de contourner en renommant —
 * ce qui affaiblirait la protection au lieu de la préciser.
 *
 * La règle est explicite : le comptage, le taux ou le délai d'une chose
 * sensible n'est pas une donnée sensible.
 */
const SUFFIXES_AGREGAT = ['count', 'rate', 'total', 'delay', 'score', 'ratio'];

function estAgregat(cle: string): boolean {
  const normalisee = cle.toLowerCase();
  return SUFFIXES_AGREGAT.some((suffixe) => normalisee.endsWith(suffixe));
}

/**
 * Découpe une clé en segments : `userPhoneNumber` → `['user', 'phone', 'number']`.
 *
 * La comparaison se fait segment par segment et **jamais par inclusion brute**.
 * L'inclusion paraissait plus sûre ; elle est en réalité absurde sur les termes
 * courts : « ip » est contenu dans « reciprocal », « name » dans « username »
 * mais aussi dans n'importe quel mot en -name. Une liste noire qui refuse des
 * champs anodins finit contournée, donc inutile.
 */
function segments(cle: string): string[] {
  return cle
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .map((segment) => segment.toLowerCase())
    .filter((segment) => segment.length > 0);
}

/**
 * Une clé porte-t-elle un nom interdit ?
 *
 * Un segment qui EST un terme interdit suffit : `userPhoneNumber` est refusée
 * aussi sûrement que `phone`. Les agrégats en sont exemptés — compter n'est pas
 * exposer.
 */
export function isForbiddenKey(cle: string): boolean {
  if (estAgregat(cle)) return false;

  const morceaux = segments(cle);
  const compacte = morceaux.join('');

  return FORBIDDEN_KEYS.some((interdite) => {
    const terme = interdite.toLowerCase();
    // Terme composé (`phoneE164`, `photoUrl`) : comparé à la clé recomposée.
    // Terme simple : comparé segment par segment.
    return morceaux.includes(terme) || compacte === terme;
  });
}

export type ValidationFailure =
  | { reason: 'UNKNOWN_EVENT' }
  | { reason: 'UNDECLARED_PROPERTY'; key: string }
  | { reason: 'FORBIDDEN_KEY'; key: string }
  | { reason: 'WRONG_TYPE'; key: string; expected: PropertyType };

export type ValidationResult =
  | { valid: true; properties: Record<string, string | number | boolean> }
  | { valid: false; failure: ValidationFailure };

/**
 * Valide un événement et ses propriétés.
 *
 * L'ordre des contrôles est significatif : on vérifie d'abord la liste noire,
 * puis la déclaration. Une clé interdite doit être signalée comme telle même si
 * quelqu'un vient de l'ajouter au schéma — c'est le sens d'avoir deux filtres.
 */
export function validateEvent(name: string, properties: Record<string, unknown>): ValidationResult {
  const definition = definitionOf(name);
  if (definition === undefined) return { valid: false, failure: { reason: 'UNKNOWN_EVENT' } };

  const retenues: Record<string, string | number | boolean> = {};

  for (const [cle, valeur] of Object.entries(properties)) {
    if (isForbiddenKey(cle)) {
      return { valid: false, failure: { reason: 'FORBIDDEN_KEY', key: cle } };
    }

    const attendu = definition.properties[cle];
    if (attendu === undefined) {
      return { valid: false, failure: { reason: 'UNDECLARED_PROPERTY', key: cle } };
    }

    // Comparaison via un garde de type : `typeof valeur !== attendu` est vrai à
    // l'exécution mais ne restreint pas `unknown` pour le compilateur, puisque
    // `attendu` est une variable. Le garde rend la restriction explicite.
    if (!matchesType(valeur, attendu)) {
      return { valid: false, failure: { reason: 'WRONG_TYPE', key: cle, expected: attendu } };
    }

    retenues[cle] = valeur;
  }

  return { valid: true, properties: retenues };
}

function matchesType(valeur: unknown, attendu: PropertyType): valeur is string | number | boolean {
  switch (attendu) {
    case 'string':
      return typeof valeur === 'string';
    case 'number':
      // `NaN` et l'infini ne sont pas des mesures exploitables : les accepter
      // produirait des agrégats faux plutôt qu'un rejet visible.
      return typeof valeur === 'number' && Number.isFinite(valeur);
    case 'boolean':
      return typeof valeur === 'boolean';
  }
}

/** Nombre d'événements déclarés — vérifié par test, la liste doit rester complète. */
export const EVENT_COUNT = EVENT_DEFINITIONS.length;
