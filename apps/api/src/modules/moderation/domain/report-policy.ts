/**
 * Signalement : recevabilité et tri automatique (stories D6-01 et D6-02).
 *
 * Deux principes qui gouvernent tout ce fichier :
 *
 *  1. **Un signalement est toujours accepté.** Refuser un doublon apprendrait au
 *     membre que son premier signalement n'a rien changé, et le dissuaderait de
 *     recommencer. La déduplication se fait au niveau du CAS, jamais du signalant
 *     (docs/05-api.md §7).
 *  2. **La priorité ne dépend pas de qui signale.** Elle découle de la catégorie
 *     déclarée, avec une règle de plancher : un cas prend toujours la priorité la
 *     plus haute parmi ses signalements.
 */

export type ReportCategory =
  | 'FAKE_PROFILE'
  | 'IDENTITY_THEFT'
  | 'FINANCIAL_SOLICITATION'
  | 'SCAM_SUSPICION'
  | 'HARASSMENT'
  | 'HATE_SPEECH'
  | 'SEXUAL_CONTENT'
  | 'INAPPROPRIATE_PHOTO'
  | 'UNDERAGE_SUSPICION'
  | 'SPAM'
  | 'OTHER';

export type ReportTargetType = 'PROFILE' | 'PHOTO' | 'MESSAGE' | 'BEHAVIOR';

export type CasePriority = 'P0_CRITICAL' | 'P1_HIGH' | 'P2_NORMAL' | 'P3_LOW';

/**
 * Barème de priorité — docs/05-api.md §7.
 *
 * `UNDERAGE_SUSPICION` est seule en P0 : c'est le seul motif où l'erreur de ne
 * rien faire est irréparable.
 */
const PRIORITE_PAR_CATEGORIE: Record<ReportCategory, CasePriority> = {
  UNDERAGE_SUSPICION: 'P0_CRITICAL',

  IDENTITY_THEFT: 'P1_HIGH',
  FINANCIAL_SOLICITATION: 'P1_HIGH',
  SCAM_SUSPICION: 'P1_HIGH',
  HARASSMENT: 'P1_HIGH',
  HATE_SPEECH: 'P1_HIGH',

  SEXUAL_CONTENT: 'P2_NORMAL',
  INAPPROPRIATE_PHOTO: 'P2_NORMAL',
  FAKE_PROFILE: 'P2_NORMAL',

  SPAM: 'P3_LOW',
  OTHER: 'P3_LOW',
};

/** Plus le rang est bas, plus le cas est urgent. Sert au tri de la file. */
const RANG_PRIORITE: Record<CasePriority, number> = {
  P0_CRITICAL: 0,
  P1_HIGH: 1,
  P2_NORMAL: 2,
  P3_LOW: 3,
};

export interface SlaConfig {
  P0_CRITICAL: number;
  P1_HIGH: number;
  P2_NORMAL: number;
  P3_LOW: number;
}

export function priorityFor(category: ReportCategory): CasePriority {
  return PRIORITE_PAR_CATEGORIE[category];
}

export function priorityRank(priority: CasePriority): number {
  return RANG_PRIORITE[priority];
}

/**
 * Priorité résultante d'un cas qui reçoit un signalement de plus.
 *
 * Elle ne peut que monter. Un cas ouvert pour du spam qui reçoit ensuite une
 * suspicion de minorité devient critique ; l'inverse n'arrive jamais — sinon un
 * spammeur pourrait diluer un signalement grave sous des signalements bénins.
 */
export function escalatePriority(current: CasePriority, incoming: CasePriority): CasePriority {
  return priorityRank(incoming) < priorityRank(current) ? incoming : current;
}

export function slaDueAt(priority: CasePriority, from: Date, config: SlaConfig): Date {
  return new Date(from.getTime() + config[priority] * 3_600_000);
}

/**
 * Recalcule l'échéance quand la priorité d'un cas monte.
 *
 * L'échéance est comptée depuis l'OUVERTURE du cas, pas depuis la montée en
 * priorité : un cas ouvert il y a cinq heures qui devient critique est déjà en
 * retard, et doit apparaître comme tel. Repartir de maintenant offrirait un délai
 * supplémentaire à la faveur d'un signalement plus grave — exactement l'inverse
 * de ce qu'il faut.
 */
export function recomputeSlaDueAt(
  priority: CasePriority,
  caseOpenedAt: Date,
  config: SlaConfig,
): Date {
  return slaDueAt(priority, caseOpenedAt, config);
}

export type ReportRefusal =
  /** On ne se signale pas soi-même. */
  | 'SELF_REPORT'
  /** Quota quotidien atteint : garde-fou anti-harcèlement par signalement. */
  | 'DAILY_LIMIT'
  /** La cible d'un signalement de photo ou de message doit être désignée. */
  | 'TARGET_REQUIRED';

export type ReportVerdict = { accepted: true } | { accepted: false; reason: ReportRefusal };

export interface ReportSubmission {
  reporterId: string;
  reportedUserId: string;
  targetType: ReportTargetType;
  targetId: string | null;
  reportsToday: number;
  dailyLimit: number;
}

export function checkReportSubmission(submission: ReportSubmission): ReportVerdict {
  if (submission.reporterId === submission.reportedUserId) return refuse('SELF_REPORT');

  // Le quota protège le membre signalé du harcèlement par signalement en masse.
  // Il est volontairement large : personne de bonne foi ne l'atteint.
  if (submission.reportsToday >= submission.dailyLimit) return refuse('DAILY_LIMIT');

  // Signaler « une photo » sans dire laquelle rend le cas intraitable pour le
  // modérateur. Un signalement de profil ou de comportement, lui, se suffit.
  const cibleRequise = submission.targetType === 'PHOTO' || submission.targetType === 'MESSAGE';
  if (cibleRequise && (submission.targetId === null || submission.targetId.length === 0)) {
    return refuse('TARGET_REQUIRED');
  }

  return { accepted: true };
}

function refuse(reason: ReportRefusal): ReportVerdict {
  return { accepted: false, reason };
}

export interface ExistingCase {
  id: string;
  status: string;
  priority: CasePriority;
  createdAt: Date;
  resolvedAt: Date | null;
}

export type CaseRouting =
  | { action: 'CREATE'; priority: CasePriority }
  | { action: 'ATTACH'; caseId: string; priority: CasePriority }
  | { action: 'REOPEN'; caseId: string; priority: CasePriority };

/**
 * Où atterrit un nouveau signalement (story D6-02).
 *
 * Un cas résolu récemment est ROUVERT plutôt que doublé : c'est la même personne,
 * le même problème, et l'historique doit rester d'un seul tenant sous les yeux du
 * modérateur. Passé la fenêtre de réouverture, un nouveau cas est ouvert — au-delà
 * d'un mois, il s'agit d'un nouvel épisode, pas d'une récidive immédiate.
 */
export function routeReport(
  incoming: CasePriority,
  openCase: ExistingCase | null,
  recentlyResolvedCase: ExistingCase | null,
  now: Date,
  reopenWindowDays: number,
): CaseRouting {
  if (openCase !== null) {
    return {
      action: 'ATTACH',
      caseId: openCase.id,
      priority: escalatePriority(openCase.priority, incoming),
    };
  }

  if (recentlyResolvedCase?.resolvedAt != null) {
    const fenetreMs = reopenWindowDays * 86_400_000;
    if (now.getTime() - recentlyResolvedCase.resolvedAt.getTime() <= fenetreMs) {
      return {
        action: 'REOPEN',
        caseId: recentlyResolvedCase.id,
        priority: escalatePriority(recentlyResolvedCase.priority, incoming),
      };
    }
  }

  return { action: 'CREATE', priority: incoming };
}
