/**
 * Matrice rôles × permissions — transcription exacte de
 * docs/06-roles-et-permissions.md §3.2.
 *
 * Elle vit dans le code, en table exhaustive, pour trois raisons :
 *
 *  1. une permission oubliée devient une erreur de compilation, pas un trou
 *     silencieux ;
 *  2. un test compare cette table au document — la documentation ne peut plus
 *     dériver du comportement réel sans que la CI le voie ;
 *  3. aucune requête n'est nécessaire pour savoir ce qu'un rôle autorise.
 *
 * Rappel : **un membre ordinaire n'a aucun rôle**. L'absence de ligne dans
 * `UserRole` signifie l'absence totale de permission back-office.
 */

export type AdminRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'MODERATION_LEAD'
  | 'MODERATOR'
  | 'VERIFICATION_AGENT'
  | 'SUPPORT'
  | 'ANALYST';

export type Permission =
  | 'users.read'
  | 'users.contact'
  | 'users.sanction'
  | 'users.ban'
  | 'users.edit'
  | 'kyc.review'
  | 'kyc.view_document'
  | 'moderation.read'
  | 'moderation.act'
  | 'moderation.content'
  | 'moderation.escalate'
  | 'moderation.assign'
  | 'content.manage'
  | 'billing.read'
  | 'billing.manage'
  | 'billing.refund'
  | 'campaign.manage'
  | 'analytics.read'
  | 'analytics.export'
  | 'audit.read'
  | 'system.flags'
  | 'system.roles'
  | 'system.read';

export const ALL_PERMISSIONS: Permission[] = [
  'users.read',
  'users.contact',
  'users.sanction',
  'users.ban',
  'users.edit',
  'kyc.review',
  'kyc.view_document',
  'moderation.read',
  'moderation.act',
  'moderation.content',
  'moderation.escalate',
  'moderation.assign',
  'content.manage',
  'billing.read',
  'billing.manage',
  'billing.refund',
  'campaign.manage',
  'analytics.read',
  'analytics.export',
  'audit.read',
  'system.flags',
  'system.roles',
  'system.read',
];

export const ALL_ROLES: AdminRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'MODERATION_LEAD',
  'MODERATOR',
  'VERIFICATION_AGENT',
  'SUPPORT',
  'ANALYST',
];

/**
 * `SUPER_ADMIN` n'est PAS un joker implicite.
 *
 * Ses permissions sont énumérées comme celles des autres : un rôle qui
 * contournerait la table serait un rôle qu'aucun test ne contrôle, et la
 * moindre permission ajoutée lui serait accordée sans décision.
 */
const MATRICE: Record<AdminRole, readonly Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,

  ADMIN: [
    'users.read',
    'users.contact',
    'users.sanction',
    'users.ban',
    'users.edit',
    'moderation.read',
    'moderation.act',
    'moderation.content',
    'moderation.escalate',
    'moderation.assign',
    'content.manage',
    'billing.read',
    'billing.manage',
    'billing.refund',
    'campaign.manage',
    'analytics.read',
    'analytics.export',
    'audit.read',
    'system.read',
  ],

  MODERATION_LEAD: [
    'users.read',
    'users.contact',
    'users.sanction',
    'users.ban',
    'moderation.read',
    'moderation.act',
    'moderation.content',
    'moderation.escalate',
    'moderation.assign',
    'analytics.read',
    'audit.read',
  ],

  MODERATOR: [
    'users.read',
    'users.contact',
    'users.sanction',
    'moderation.read',
    'moderation.act',
    'moderation.content',
    'moderation.escalate',
  ],

  // Un agent de vérification voit les pièces d'identité mais ne sanctionne
  // personne : les deux pouvoirs réunis feraient un rôle trop large.
  VERIFICATION_AGENT: ['users.read', 'kyc.review', 'kyc.view_document'],

  SUPPORT: [
    'users.read',
    'users.contact',
    'moderation.read',
    'moderation.escalate',
    'billing.read',
  ],

  // Un analyste ne voit aucun compte nominatif : il lit des agrégats.
  ANALYST: ['billing.read', 'analytics.read', 'analytics.export'],
};

export class UnknownRoleError extends Error {
  constructor(role: string) {
    super(`Rôle back-office inconnu : ${role}.`);
    this.name = 'UnknownRoleError';
  }
}

/**
 * Permissions accordées par un ensemble de rôles.
 *
 * Un rôle inconnu fait ÉCHOUER la résolution plutôt que d'être ignoré : une
 * valeur inattendue venue de la base ou d'un jeton signale un problème, et
 * l'ignorer en silence produirait un compte aux droits inexplicables.
 */
export function permissionsOf(roles: AdminRole[]): Set<Permission> {
  const accordees = new Set<Permission>();

  for (const role of roles) {
    const duRole = MATRICE[role] as readonly Permission[] | undefined;
    if (duRole === undefined) throw new UnknownRoleError(role);
    for (const permission of duRole) accordees.add(permission);
  }

  return accordees;
}

export function hasPermission(roles: AdminRole[], required: Permission): boolean {
  return permissionsOf(roles).has(required);
}

export function hasAllPermissions(roles: AdminRole[], required: Permission[]): boolean {
  const accordees = permissionsOf(roles);
  return required.every((permission) => accordees.has(permission));
}

/**
 * Permissions dont l'exercice exige un second valideur distinct.
 *
 * Elles ne sont pas « plus sensibles » au sens du confort : ce sont les deux
 * actions qu'on ne peut pas défaire — un compte banni et un remboursement émis.
 */
const A_QUATRE_YEUX: ReadonlySet<Permission> = new Set<Permission>(['users.ban', 'billing.refund']);

export function requiresSecondApprover(permission: Permission): boolean {
  return A_QUATRE_YEUX.has(permission);
}

/**
 * Permissions dont l'exercice exige un motif écrit ET un audit nominatif.
 *
 * `kyc.view_document` en fait partie : ouvrir une pièce d'identité n'est jamais
 * une consultation de routine.
 */
const A_MOTIF_OBLIGATOIRE: ReadonlySet<Permission> = new Set<Permission>([
  'kyc.view_document',
  'users.edit',
]);

export function requiresWrittenReason(permission: Permission): boolean {
  return A_MOTIF_OBLIGATOIRE.has(permission);
}

/** Seul `SUPER_ADMIN` distribue les rôles : sinon un rôle pourrait s'auto-élargir. */
export function canGrantRoles(roles: AdminRole[]): boolean {
  return roles.includes('SUPER_ADMIN');
}

/**
 * La valeur lue en base est-elle un rôle connu ?
 *
 * Le garde d'autorisation en a besoin : `UserRole.role` est une énumération
 * PostgreSQL, mais rien n'empêche une migration future d'y ajouter une valeur
 * que le code ne connaît pas encore. Une valeur inconnue doit être **écartée**,
 * pas convertie de force en rôle : convertir accorderait des droits qu'aucune
 * table ne décrit.
 */
export function isAdminRole(valeur: string): valeur is AdminRole {
  return (ALL_ROLES as string[]).includes(valeur);
}

/**
 * Rôle retenu pour l'AUDIT, quand un compte en porte plusieurs.
 *
 * On prend le **plus faible** des rôles réellement détenus, jamais le plus
 * élevé : le journal ne doit pas surestimer le pouvoir de l'auteur d'une
 * action. `ALL_ROLES` est ordonné du plus puissant au plus restreint, donc le
 * dernier détenu est le plus faible.
 *
 * Sans rôle du tout, il n'y a rien à auditer comme rôle : la fonction rend
 * `null` plutôt qu'un `SUPPORT` inventé, qui laisserait croire à une habilitation
 * que la personne n'a pas.
 */
export function auditRole(roles: AdminRole[]): AdminRole | null {
  const detenus = ALL_ROLES.filter((role) => roles.includes(role));
  return detenus[detenus.length - 1] ?? null;
}
