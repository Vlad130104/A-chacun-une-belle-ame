/**
 * Machine à états de la vérification d'identité (story D2-02).
 *
 * Sept statuts, et surtout des transitions INTERDITES : on ne peut pas passer de
 * `REJECTED` à `VERIFIED` sans nouvelle demande, ni sauter la revue. C'est ce qui
 * empêche qu'une erreur de code ou un appel d'API mal formé n'accorde le badge.
 *
 * Fonction pure : testable sans base de données (docs/09-plan-de-tests.md §3).
 */

export type VerificationStatusValue =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'IN_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'ADDITIONAL_REQUIRED'
  | 'SUSPENDED';

export type VerificationEvent =
  /** Le membre a déposé ses pièces et soumis la demande. */
  | 'SUBMIT'
  /** Un agent ou le prestataire prend la demande en charge. */
  | 'START_REVIEW'
  | 'APPROVE'
  | 'REJECT'
  | 'REQUEST_ADDITIONAL'
  /** Décision de modération : le badge est retiré. */
  | 'SUSPEND'
  /** Nouvelle soumission après rejet, complément demandé ou suspension. */
  | 'RESUBMIT';

const TRANSITIONS: Record<
  VerificationStatusValue,
  Partial<Record<VerificationEvent, VerificationStatusValue>>
> = {
  NOT_STARTED: { SUBMIT: 'PENDING' },
  PENDING: { START_REVIEW: 'IN_REVIEW' },
  IN_REVIEW: {
    APPROVE: 'VERIFIED',
    REJECT: 'REJECTED',
    REQUEST_ADDITIONAL: 'ADDITIONAL_REQUIRED',
  },
  ADDITIONAL_REQUIRED: { RESUBMIT: 'PENDING' },
  REJECTED: { RESUBMIT: 'PENDING' },
  VERIFIED: { SUSPEND: 'SUSPENDED' },
  SUSPENDED: { RESUBMIT: 'PENDING' },
};

export type TransitionResult =
  | { allowed: true; next: VerificationStatusValue }
  | { allowed: false; reason: 'FORBIDDEN_TRANSITION' };

export function transition(
  current: VerificationStatusValue,
  event: VerificationEvent,
): TransitionResult {
  const next = TRANSITIONS[current][event];
  return next === undefined
    ? { allowed: false, reason: 'FORBIDDEN_TRANSITION' }
    : { allowed: true, next };
}

/** Seul `VERIFIED` ouvre la découverte, le matching et la messagerie (ADR-006). */
export function grantsProductAccess(status: VerificationStatusValue): boolean {
  return status === 'VERIFIED';
}

/**
 * La date de naissance devient immuable dès la première vérification réussie, et le
 * reste même si le badge est ensuite suspendu : la suspension ne rouvre pas la porte
 * à une correction d'âge (docs/05-api.md §3).
 */
export function locksBirthDate(event: VerificationEvent): boolean {
  return event === 'APPROVE';
}

/** Un membre peut re-soumettre après un rejet, mais pas immédiatement. */
export function canResubmit(
  status: VerificationStatusValue,
  decidedAt: Date | null,
  now: Date,
  cooldownHours: number,
): boolean {
  if (transition(status, 'RESUBMIT').allowed === false) return false;
  if (status !== 'REJECTED') return true;
  if (decidedAt === null) return true;

  return now.getTime() - decidedAt.getTime() >= cooldownHours * 3_600_000;
}
