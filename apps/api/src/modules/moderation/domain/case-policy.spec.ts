import { describe, expect, it } from '@jest/globals';
import {
  ACTION_TYPES,
  checkAction,
  checkAssignment,
  compareQueue,
  effectOf,
  isAutomatable,
  isRevertible,
  requiresSecondApprover,
  slaState,
  type ActionRequest,
  type CaseStatus,
  type ModerationActionType,
  type QueueEntry,
} from './case-policy';

const demande = (surcharge: Partial<ActionRequest> = {}): ActionRequest => ({
  caseStatus: 'ASSIGNED',
  action: 'WARNING',
  reasonCode: 'CONTENU_INAPPROPRIE',
  performedByUserId: 'moderateur-1',
  approvedByUserId: null,
  assignedToUserId: 'moderateur-1',
  ...surcharge,
});

describe('catalogue des actions', () => {
  it('compte exactement les 10 actions prévues', () => {
    expect(new Set(ACTION_TYPES).size).toBe(10);
  });

  it('associe un effet à chacune des 10 actions', () => {
    for (const action of ACTION_TYPES) {
      expect(effectOf(action)).toBeDefined();
    }
  });
});

describe('ADR-012 — aucune sanction lourde automatique', () => {
  it.each([['SUSPENSION'], ['BAN']])('interdit %s à une règle automatique', (action) => {
    expect(isAutomatable(action as ModerationActionType)).toBe(false);
  });

  it.each([
    ['PHOTO_HIDDEN'],
    ['TEMPORARY_RESTRICTION'],
    ['REVERIFICATION_REQUIRED'],
    ['INFORMATION_REQUEST'],
  ])('autorise %s, qui se défait', (action) => {
    expect(isAutomatable(action as ModerationActionType)).toBe(true);
  });

  it('refuse une suspension demandée sans auteur humain', () => {
    const verdict = checkAction(demande({ action: 'SUSPENSION', performedByUserId: null }));
    expect(verdict).toEqual({ allowed: false, reason: 'AUTOMATIC_ACTION_NOT_ALLOWED' });
  });

  it('refuse un bannissement demandé sans auteur humain', () => {
    const verdict = checkAction(demande({ action: 'BAN', performedByUserId: null }));
    expect(verdict).toEqual({ allowed: false, reason: 'AUTOMATIC_ACTION_NOT_ALLOWED' });
  });

  it('accepte une mesure réversible appliquée par une règle', () => {
    const verdict = checkAction(
      demande({
        action: 'TEMPORARY_RESTRICTION',
        performedByUserId: null,
        assignedToUserId: null,
      }),
    );
    expect(verdict).toEqual({ allowed: true });
  });
});

describe('principe des quatre yeux', () => {
  it('n’exige un second valideur que pour le bannissement', () => {
    const exigeant = ACTION_TYPES.filter(requiresSecondApprover);
    expect(exigeant).toEqual(['BAN']);
  });

  it('refuse un bannissement sans second valideur', () => {
    const verdict = checkAction(demande({ action: 'BAN', approvedByUserId: null }));
    expect(verdict).toEqual({ allowed: false, reason: 'SECOND_APPROVER_REQUIRED' });
  });

  it('refuse un bannissement que le décideur valide lui-même', () => {
    // Sinon « les quatre yeux » n'en seraient que deux.
    const verdict = checkAction(
      demande({
        action: 'BAN',
        performedByUserId: 'chef',
        approvedByUserId: 'chef',
        assignedToUserId: 'chef',
      }),
    );
    expect(verdict).toEqual({ allowed: false, reason: 'SECOND_APPROVER_MUST_DIFFER' });
  });

  it('accepte un bannissement validé par une seconde personne', () => {
    const verdict = checkAction(demande({ action: 'BAN', approvedByUserId: 'moderateur-2' }));
    expect(verdict).toEqual({ allowed: true });
  });
});

describe('conditions générales d’une action', () => {
  it.each([['RESOLVED'], ['DISMISSED']])('refuse toute action sur un cas %s', (statut) => {
    expect(checkAction(demande({ caseStatus: statut as CaseStatus }))).toEqual({
      allowed: false,
      reason: 'CASE_ALREADY_CLOSED',
    });
  });

  it('refuse un motif vide', () => {
    expect(checkAction(demande({ reasonCode: '   ' }))).toEqual({
      allowed: false,
      reason: 'REASON_REQUIRED',
    });
  });

  it('refuse une action par un modérateur qui n’est pas l’attributaire', () => {
    // Deux modérateurs sur un même dossier produisent des décisions contradictoires.
    const verdict = checkAction(
      demande({ performedByUserId: 'moderateur-2', assignedToUserId: 'moderateur-1' }),
    );
    expect(verdict).toEqual({ allowed: false, reason: 'NOT_ASSIGNEE' });
  });

  it('accepte une action sur un cas non attribué', () => {
    expect(checkAction(demande({ assignedToUserId: null }))).toEqual({ allowed: true });
  });

  it('signale le cas clos avant le motif manquant', () => {
    // Un modérateur doit apprendre que le cas est clos avant qu'on lui reproche
    // la forme de sa saisie.
    const verdict = checkAction(demande({ caseStatus: 'RESOLVED', reasonCode: '' }));
    expect(verdict).toEqual({ allowed: false, reason: 'CASE_ALREADY_CLOSED' });
  });
});

describe('effets d’une action', () => {
  it.each([
    ['WARNING', null, 'RESOLVED'],
    ['TEMPORARY_RESTRICTION', 'RESTRICTED', 'RESOLVED'],
    ['SUSPENSION', 'SUSPENDED', 'RESOLVED'],
    ['BAN', 'BANNED', 'RESOLVED'],
    ['DISMISSED', null, 'DISMISSED'],
    ['ESCALATED', null, 'ESCALATED'],
    ['INFORMATION_REQUEST', null, 'AWAITING_USER'],
  ])('%s → compte %s, cas %s', (action, compte, cas) => {
    const effet = effectOf(action as ModerationActionType);
    expect(effet.accountStatus).toBe(compte);
    expect(effet.caseStatus).toBe(cas);
  });

  it('n’altère pas le compte quand seul un contenu est retiré', () => {
    expect(effectOf('PHOTO_HIDDEN').accountStatus).toBeNull();
    expect(effectOf('CONTENT_REMOVED').accountStatus).toBeNull();
  });

  it('marque comme temporaires les seules sanctions à échéance', () => {
    const temporaires = ACTION_TYPES.filter((action) => effectOf(action).temporary);
    expect(temporaires.sort()).toEqual([
      'REVERIFICATION_REQUIRED',
      'SUSPENSION',
      'TEMPORARY_RESTRICTION',
    ]);
  });

  it('rend toute action annulable sauf le bannissement', () => {
    const nonAnnulables = ACTION_TYPES.filter((action) => !isRevertible(action));
    expect(nonAnnulables).toEqual(['BAN']);
  });
});

describe('compte à rebours SLA', () => {
  const echeance = new Date('2026-05-10T14:00:00.000Z');

  it('signale le dépassement', () => {
    expect(slaState(echeance, new Date('2026-05-10T14:00:01.000Z'), 2)).toBe('OVERDUE');
  });

  it('signale l’échéance atteinte à la seconde près', () => {
    expect(slaState(echeance, echeance, 2)).toBe('OVERDUE');
  });

  it('alerte dans le dernier quart de la fenêtre', () => {
    // Sur un P0 de 2 h, le dernier quart commence 30 minutes avant l'échéance.
    expect(slaState(echeance, new Date('2026-05-10T13:35:00.000Z'), 2)).toBe('DUE_SOON');
  });

  it('reste calme au-delà du dernier quart', () => {
    expect(slaState(echeance, new Date('2026-05-10T13:00:00.000Z'), 2)).toBe('ON_TIME');
  });

  it('adapte le seuil à la fenêtre de la priorité', () => {
    // Deux heures d'avance rassurent sur un P3 de 72 h ; elles ne veulent rien
    // dire sur un P0 dont la fenêtre entière fait deux heures.
    const echeanceP3 = new Date('2026-05-13T12:00:00.000Z');
    expect(slaState(echeanceP3, new Date('2026-05-13T10:00:00.000Z'), 72)).toBe('DUE_SOON');
    expect(slaState(echeanceP3, new Date('2026-05-12T12:00:00.000Z'), 72)).toBe('ON_TIME');
  });
});

describe('ordre de la file', () => {
  const entree = (priority: QueueEntry['priority'], jour: string): QueueEntry => ({
    priority,
    createdAt: new Date(jour),
    slaDueAt: new Date(jour),
  });

  it('place la priorité la plus haute en premier', () => {
    const file = [
      entree('P3_LOW', '2026-05-01T00:00:00.000Z'),
      entree('P0_CRITICAL', '2026-05-10T00:00:00.000Z'),
      entree('P2_NORMAL', '2026-05-05T00:00:00.000Z'),
    ].sort(compareQueue);

    expect(file.map((cas) => cas.priority)).toEqual(['P0_CRITICAL', 'P2_NORMAL', 'P3_LOW']);
  });

  it('départage à priorité égale par ancienneté', () => {
    const file = [
      entree('P1_HIGH', '2026-05-10T00:00:00.000Z'),
      entree('P1_HIGH', '2026-05-02T00:00:00.000Z'),
    ].sort(compareQueue);

    expect(file[0]?.createdAt.toISOString()).toBe('2026-05-02T00:00:00.000Z');
  });

  it('ne laisse jamais un cas ancien de basse priorité passer devant un cas critique', () => {
    const file = [
      entree('P3_LOW', '2020-01-01T00:00:00.000Z'),
      entree('P0_CRITICAL', '2026-05-10T11:59:00.000Z'),
    ].sort(compareQueue);

    expect(file[0]?.priority).toBe('P0_CRITICAL');
  });
});

describe('attribution d’un cas', () => {
  it('attribue un cas libre', () => {
    expect(checkAssignment('OPEN', null, 'moderateur-1')).toEqual({ allowed: true });
  });

  it('reste sans effet quand le cas est déjà à soi', () => {
    // Un double clic ne doit rien casser.
    expect(checkAssignment('ASSIGNED', 'moderateur-1', 'moderateur-1')).toEqual({ allowed: true });
  });

  it('refuse de prendre le cas d’un autre modérateur', () => {
    expect(checkAssignment('ASSIGNED', 'moderateur-1', 'moderateur-2')).toEqual({
      allowed: false,
      reason: 'ALREADY_ASSIGNED_TO_OTHER',
    });
  });

  it('refuse d’attribuer un cas clos', () => {
    expect(checkAssignment('RESOLVED', null, 'moderateur-1')).toEqual({
      allowed: false,
      reason: 'CASE_ALREADY_CLOSED',
    });
  });
});
