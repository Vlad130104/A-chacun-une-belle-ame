/**
 * Cycle de vie d'un cas et effets d'une action de modération
 * (stories D6-03 à D6-06, D6-08 · ADR-012).
 *
 * La règle qui commande tout le fichier : **aucune sanction lourde automatique**.
 * Une règle de détection peut masquer une photo ou exiger une re-vérification —
 * des mesures qu'on défait. Elle ne peut ni suspendre ni bannir. Le bannissement
 * définitif exige en plus un second valideur distinct du premier.
 */

import { priorityRank, type CasePriority } from './report-policy';

export type CaseStatus =
  'OPEN' | 'ASSIGNED' | 'AWAITING_USER' | 'ESCALATED' | 'RESOLVED' | 'DISMISSED';

export type ModerationActionType =
  | 'WARNING'
  | 'INFORMATION_REQUEST'
  | 'PHOTO_HIDDEN'
  | 'CONTENT_REMOVED'
  | 'TEMPORARY_RESTRICTION'
  | 'SUSPENSION'
  | 'BAN'
  | 'REVERIFICATION_REQUIRED'
  | 'DISMISSED'
  | 'ESCALATED';

/** Les 10 actions du catalogue. Vérifié par test : la liste doit rester complète. */
export const ACTION_TYPES: ModerationActionType[] = [
  'WARNING',
  'INFORMATION_REQUEST',
  'PHOTO_HIDDEN',
  'CONTENT_REMOVED',
  'TEMPORARY_RESTRICTION',
  'SUSPENSION',
  'BAN',
  'REVERIFICATION_REQUIRED',
  'DISMISSED',
  'ESCALATED',
];

/**
 * Actions qu'une règle automatique a le droit d'appliquer seule (ADR-012).
 *
 * Le critère n'est pas la gravité ressentie mais la **réversibilité réelle** : une
 * photo masquée se réaffiche, une re-vérification s'annule. Un bannissement, lui,
 * détruit une relation de confiance qu'aucun `revertedAt` ne restaure.
 */
const ACTIONS_AUTOMATIQUES: ReadonlySet<ModerationActionType> = new Set<ModerationActionType>([
  'PHOTO_HIDDEN',
  'TEMPORARY_RESTRICTION',
  'REVERIFICATION_REQUIRED',
  'INFORMATION_REQUEST',
]);

/** Actions qui exigent un second valideur distinct (principe des quatre yeux). */
const ACTIONS_A_QUATRE_YEUX: ReadonlySet<ModerationActionType> = new Set<ModerationActionType>([
  'BAN',
]);

export function isAutomatable(action: ModerationActionType): boolean {
  return ACTIONS_AUTOMATIQUES.has(action);
}

export function requiresSecondApprover(action: ModerationActionType): boolean {
  return ACTIONS_A_QUATRE_YEUX.has(action);
}

export type ActionRefusal =
  | 'CASE_ALREADY_CLOSED'
  | 'AUTOMATIC_ACTION_NOT_ALLOWED'
  | 'SECOND_APPROVER_REQUIRED'
  | 'SECOND_APPROVER_MUST_DIFFER'
  | 'REASON_REQUIRED'
  | 'NOT_ASSIGNEE';

export type ActionVerdict = { allowed: true } | { allowed: false; reason: ActionRefusal };

export interface ActionRequest {
  caseStatus: CaseStatus;
  action: ModerationActionType;
  reasonCode: string;
  /** Null quand l'action provient d'une règle de détection. */
  performedByUserId: string | null;
  approvedByUserId: string | null;
  /** Modérateur à qui le cas est attribué, s'il l'est. */
  assignedToUserId: string | null;
}

const STATUTS_CLOS: ReadonlySet<CaseStatus> = new Set<CaseStatus>(['RESOLVED', 'DISMISSED']);

/**
 * Peut-on appliquer cette action, maintenant, par cette personne ?
 *
 * L'ordre des contrôles est significatif : on refuse d'abord sur l'état du cas
 * (un fait), ensuite sur l'autorité de l'auteur, enfin sur la forme. Un modérateur
 * doit apprendre que le cas est clos avant qu'on lui reproche un motif manquant.
 */
export function checkAction(request: ActionRequest): ActionVerdict {
  if (STATUTS_CLOS.has(request.caseStatus)) return refuse('CASE_ALREADY_CLOSED');

  if (request.performedByUserId === null) {
    // Chemin automatique : la liste blanche est la seule autorisation.
    if (!isAutomatable(request.action)) return refuse('AUTOMATIC_ACTION_NOT_ALLOWED');
  } else if (
    request.assignedToUserId !== null &&
    request.assignedToUserId !== request.performedByUserId
  ) {
    // Un cas attribué appartient à son modérateur : agir dessus sans se
    // l'attribuer produit des décisions contradictoires sur le même dossier.
    return refuse('NOT_ASSIGNEE');
  }

  if (requiresSecondApprover(request.action)) {
    if (request.approvedByUserId === null) return refuse('SECOND_APPROVER_REQUIRED');
    if (request.approvedByUserId === request.performedByUserId) {
      // Sinon « les quatre yeux » n'en seraient que deux.
      return refuse('SECOND_APPROVER_MUST_DIFFER');
    }
  }

  if (request.reasonCode.trim().length === 0) return refuse('REASON_REQUIRED');

  return { allowed: true };
}

function refuse(reason: ActionRefusal): ActionVerdict {
  return { allowed: false, reason };
}

export type AccountStatus =
  | 'ACTIVE'
  | 'RESTRICTED'
  | 'SUSPENDED'
  | 'BANNED'
  | 'PAUSED'
  | 'PENDING_OTP'
  | 'BLOCKED_UNDERAGE'
  | 'PENDING_DELETION'
  | 'DELETED';

export interface AccountEffect {
  accountStatus: AccountStatus | null;
  requiresReverification: boolean;
  /** Statut de cas résultant, `null` si l'action ne clôt ni n'escalade rien. */
  caseStatus: CaseStatus | null;
  /** Une sanction temporaire porte une échéance ; les autres non. */
  temporary: boolean;
}

/**
 * Effet d'une action sur le compte du membre et sur le cas.
 *
 * Table exhaustive plutôt que suite de `if` : la moindre action ajoutée au
 * catalogue casse la compilation ici, là où la décision doit être prise.
 */
const EFFETS: Record<ModerationActionType, AccountEffect> = {
  WARNING: {
    accountStatus: null,
    requiresReverification: false,
    caseStatus: 'RESOLVED',
    temporary: false,
  },
  INFORMATION_REQUEST: {
    accountStatus: null,
    requiresReverification: false,
    caseStatus: 'AWAITING_USER',
    temporary: false,
  },
  PHOTO_HIDDEN: {
    accountStatus: null,
    requiresReverification: false,
    caseStatus: null,
    temporary: false,
  },
  CONTENT_REMOVED: {
    accountStatus: null,
    requiresReverification: false,
    caseStatus: null,
    temporary: false,
  },
  TEMPORARY_RESTRICTION: {
    accountStatus: 'RESTRICTED',
    requiresReverification: false,
    caseStatus: 'RESOLVED',
    temporary: true,
  },
  SUSPENSION: {
    accountStatus: 'SUSPENDED',
    requiresReverification: false,
    caseStatus: 'RESOLVED',
    temporary: true,
  },
  BAN: {
    accountStatus: 'BANNED',
    requiresReverification: false,
    caseStatus: 'RESOLVED',
    temporary: false,
  },
  REVERIFICATION_REQUIRED: {
    accountStatus: 'RESTRICTED',
    requiresReverification: true,
    caseStatus: 'AWAITING_USER',
    temporary: true,
  },
  DISMISSED: {
    accountStatus: null,
    requiresReverification: false,
    caseStatus: 'DISMISSED',
    temporary: false,
  },
  ESCALATED: {
    accountStatus: null,
    requiresReverification: false,
    caseStatus: 'ESCALATED',
    temporary: false,
  },
};

export function effectOf(action: ModerationActionType): AccountEffect {
  return EFFETS[action];
}

/** Une sanction définitive n'est jamais annulable par la route de révocation. */
export function isRevertible(action: ModerationActionType): boolean {
  return action !== 'BAN';
}

export type SlaState = 'ON_TIME' | 'DUE_SOON' | 'OVERDUE';

/**
 * État d'échéance d'un cas, pour le compte à rebours de la file (story D6-03).
 *
 * « Bientôt » vaut le quart du délai restant sur l'échéance initiale et non une
 * durée fixe : deux heures d'avance rassurent sur un cas P3, elles ne veulent rien
 * dire sur un P0 dont le délai total est de deux heures.
 */
export function slaState(dueAt: Date, now: Date, totalWindowHours: number): SlaState {
  const restantMs = dueAt.getTime() - now.getTime();
  if (restantMs <= 0) return 'OVERDUE';
  return restantMs <= (totalWindowHours * 3_600_000) / 4 ? 'DUE_SOON' : 'ON_TIME';
}

export interface QueueEntry {
  priority: CasePriority;
  createdAt: Date;
  slaDueAt: Date;
}

/**
 * Ordre de la file de modération : priorité d'abord, ancienneté ensuite.
 *
 * L'ancienneté départage à priorité égale, et non l'échéance : deux cas de même
 * priorité ont la même fenêtre, donc le plus ancien est toujours le plus urgent.
 * Trier par échéance donnerait le même résultat, mais deviendrait faux le jour où
 * une échéance sera ajustée à la main.
 */
export function compareQueue(a: QueueEntry, b: QueueEntry): number {
  const parPriorite = priorityRank(a.priority) - priorityRank(b.priority);
  if (parPriorite !== 0) return parPriorite;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

export type AssignRefusal = 'CASE_ALREADY_CLOSED' | 'ALREADY_ASSIGNED_TO_OTHER';

export type AssignVerdict = { allowed: true } | { allowed: false; reason: AssignRefusal };

/**
 * Attribution d'un cas (story D6-04).
 *
 * Se réattribuer un cas qu'on détient déjà est sans effet plutôt qu'une erreur :
 * un double clic ne doit rien casser.
 */
export function checkAssignment(
  caseStatus: CaseStatus,
  currentAssignee: string | null,
  moderatorId: string,
): AssignVerdict {
  if (STATUTS_CLOS.has(caseStatus)) return { allowed: false, reason: 'CASE_ALREADY_CLOSED' };
  if (currentAssignee !== null && currentAssignee !== moderatorId) {
    return { allowed: false, reason: 'ALREADY_ASSIGNED_TO_OTHER' };
  }
  return { allowed: true };
}
