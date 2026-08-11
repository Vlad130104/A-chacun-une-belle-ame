/**
 * Les 9 règles de détection par comportement (story D6-07).
 *
 * Chacune est une fonction pure : mêmes observations, même verdict. Aucune n'a
 * accès à la base, aucune n'écrit — elles produisent un signal, et le signal
 * n'est jamais une preuve. C'est ce qui permet de les tester une par une, de
 * mesurer leur taux de faux positifs, et d'ajuster leurs seuils sans redéployer.
 *
 * **Aucune de ces règles ne peut suspendre ni bannir** (ADR-012) : la mesure
 * proposée est bornée par `case-policy.isAutomatable`, et un test le vérifie
 * règle par règle.
 */

import { isAutomatable, type ModerationActionType } from './case-policy';

export type SignalType =
  | 'REPEATED_MONEY_REQUEST'
  | 'BULK_SIMILAR_MESSAGES'
  | 'REPEATED_ACCOUNT_CREATION'
  | 'FREQUENT_DEVICE_CHANGE'
  | 'ABNORMAL_LIKE_VOLUME'
  | 'VERIFICATION_REFUSAL'
  | 'MULTIPLE_REPORTS'
  | 'SUSPICIOUS_LINK'
  | 'AUTOMATED_BEHAVIOR'
  | 'CONTACT_SHARING';

export interface DetectionThresholds {
  moneyRequestCount: number;
  moneyRequestWindowHours: number;
  bulkSimilarCount: number;
  bulkSimilarRatio: number;
  accountCreationCount: number;
  accountCreationWindowDays: number;
  deviceChangeCount: number;
  deviceChangeWindowDays: number;
  likeVolumeMultiplier: number;
  verificationRefusalCount: number;
  multipleReportsCount: number;
  multipleReportsWindowDays: number;
  suspiciousLinkCount: number;
  automationMinIntervalMs: number;
  automationSampleSize: number;
}

export interface DetectionSignal {
  type: SignalType;
  /** 1 à 5. Ne détermine pas la sanction, seulement la place dans la file. */
  severity: number;
  /** Contexte NON nominatif : compteurs, fenêtre, seuil franchi. Jamais de contenu. */
  evidence: Record<string, number | string>;
  /** Mesure réversible proposée, ou `null` si le signal ne fait que remonter. */
  suggestedMeasure: ModerationActionType | null;
}

/** Observations agrégées d'un membre, telles que les fournit l'infrastructure. */
export interface BehaviourObservation {
  userId: string;
  /** Signaux `MONEY_REQUEST` détectés dans ses messages sur la fenêtre. */
  moneyRequestSignals: number;
  moneyRequestWindowHours: number;
  /** Messages envoyés récemment, et proportion de quasi-doublons entre eux. */
  recentMessageCount: number;
  duplicateMessageRatio: number;
  /** Comptes distincts créés depuis la même empreinte d'appareil. */
  accountsFromSameDevice: number;
  accountCreationWindowDays: number;
  distinctDevicesUsed: number;
  deviceWindowDays: number;
  /** Likes du jour, et médiane de la plateforme pour comparaison. */
  likesToday: number;
  platformMedianLikesPerDay: number;
  /** Soumissions de vérification refusées ou abandonnées. */
  verificationRefusals: number;
  /** Signalements distincts reçus sur la fenêtre, de signalants distincts. */
  distinctReportersRecently: number;
  reportWindowDays: number;
  suspiciousLinkSignals: number;
  /** Intervalles en millisecondes entre ses dernières actions, ordre chronologique. */
  actionIntervalsMs: number[];
}

type Rule = (
  observation: BehaviourObservation,
  thresholds: DetectionThresholds,
) => DetectionSignal | null;

/** R1 — demandes d'argent répétées. Le premier signal d'arnaque sentimentale. */
const repeatedMoneyRequest: Rule = (observation, thresholds) => {
  if (observation.moneyRequestSignals < thresholds.moneyRequestCount) return null;

  return {
    type: 'REPEATED_MONEY_REQUEST',
    severity: 5,
    evidence: {
      count: observation.moneyRequestSignals,
      threshold: thresholds.moneyRequestCount,
      windowHours: observation.moneyRequestWindowHours,
    },
    // Restreindre plutôt que suspendre : la règle peut se tromper, et une
    // restriction se lève en une requête.
    suggestedMeasure: 'TEMPORARY_RESTRICTION',
  };
};

/** R2 — messages quasi identiques envoyés en masse. */
const bulkSimilarMessages: Rule = (observation, thresholds) => {
  if (
    observation.recentMessageCount < thresholds.bulkSimilarCount ||
    observation.duplicateMessageRatio < thresholds.bulkSimilarRatio
  ) {
    return null;
  }

  return {
    type: 'BULK_SIMILAR_MESSAGES',
    severity: 3,
    evidence: {
      messages: observation.recentMessageCount,
      duplicateRatio: Number(observation.duplicateMessageRatio.toFixed(2)),
      threshold: thresholds.bulkSimilarRatio,
    },
    suggestedMeasure: 'TEMPORARY_RESTRICTION',
  };
};

/** R3 — créations répétées de comptes depuis la même empreinte d'appareil. */
const repeatedAccountCreation: Rule = (observation, thresholds) => {
  if (observation.accountsFromSameDevice < thresholds.accountCreationCount) return null;

  return {
    type: 'REPEATED_ACCOUNT_CREATION',
    severity: 4,
    evidence: {
      accounts: observation.accountsFromSameDevice,
      threshold: thresholds.accountCreationCount,
      windowDays: observation.accountCreationWindowDays,
    },
    // Contournement de bannissement possible : on demande une re-vérification,
    // on ne bannit pas sur une empreinte d'appareil, qui se partage (cybercafé,
    // téléphone familial).
    suggestedMeasure: 'REVERIFICATION_REQUIRED',
  };
};

/** R4 — rotation d'appareils inhabituelle. */
const frequentDeviceChange: Rule = (observation, thresholds) => {
  if (observation.distinctDevicesUsed < thresholds.deviceChangeCount) return null;

  return {
    type: 'FREQUENT_DEVICE_CHANGE',
    severity: 2,
    evidence: {
      devices: observation.distinctDevicesUsed,
      threshold: thresholds.deviceChangeCount,
      windowDays: observation.deviceWindowDays,
    },
    // Signal faible : beaucoup de gens partagent un téléphone. On remonte, on
    // n'agit pas.
    suggestedMeasure: null,
  };
};

/** R5 — volume de likes anormal au regard de la médiane de la plateforme. */
const abnormalLikeVolume: Rule = (observation, thresholds) => {
  const seuil = observation.platformMedianLikesPerDay * thresholds.likeVolumeMultiplier;
  // Comparaison à la médiane observée, jamais à une constante : le comportement
  // « normal » d'une plateforme de 9 000 membres n'est pas celui d'une de 200.
  if (observation.platformMedianLikesPerDay <= 0 || observation.likesToday < seuil) return null;

  return {
    type: 'ABNORMAL_LIKE_VOLUME',
    severity: 2,
    evidence: {
      likesToday: observation.likesToday,
      platformMedian: observation.platformMedianLikesPerDay,
      multiplier: thresholds.likeVolumeMultiplier,
    },
    suggestedMeasure: null,
  };
};

/** R6 — refus répété de mener la vérification à son terme. */
const verificationRefusal: Rule = (observation, thresholds) => {
  if (observation.verificationRefusals < thresholds.verificationRefusalCount) return null;

  return {
    type: 'VERIFICATION_REFUSAL',
    severity: 3,
    evidence: {
      refusals: observation.verificationRefusals,
      threshold: thresholds.verificationRefusalCount,
    },
    suggestedMeasure: 'REVERIFICATION_REQUIRED',
  };
};

/** R7 — signalements multiples, par des signalants DISTINCTS. */
const multipleReports: Rule = (observation, thresholds) => {
  // Le compte porte sur les signalants distincts, jamais sur les signalements :
  // sinon une seule personne déterminée suffirait à faire sanctionner un membre.
  if (observation.distinctReportersRecently < thresholds.multipleReportsCount) return null;

  return {
    type: 'MULTIPLE_REPORTS',
    severity: 4,
    evidence: {
      reporters: observation.distinctReportersRecently,
      threshold: thresholds.multipleReportsCount,
      windowDays: observation.reportWindowDays,
    },
    suggestedMeasure: null,
  };
};

/** R8 — diffusion répétée de liens sortants. */
const suspiciousLink: Rule = (observation, thresholds) => {
  if (observation.suspiciousLinkSignals < thresholds.suspiciousLinkCount) return null;

  return {
    type: 'SUSPICIOUS_LINK',
    severity: 3,
    evidence: {
      links: observation.suspiciousLinkSignals,
      threshold: thresholds.suspiciousLinkCount,
    },
    suggestedMeasure: 'TEMPORARY_RESTRICTION',
  };
};

/** R9 — cadence d'actions incompatible avec une utilisation humaine. */
const automatedBehaviour: Rule = (observation, thresholds) => {
  const intervalles = observation.actionIntervalsMs;
  if (intervalles.length < thresholds.automationSampleSize) return null;

  const echantillon = intervalles.slice(-thresholds.automationSampleSize);
  // TOUS les intervalles doivent être sous le seuil : une seule action rapide est
  // banale, une série entière ne l'est pas.
  if (!echantillon.every((intervalle) => intervalle < thresholds.automationMinIntervalMs)) {
    return null;
  }

  const moyenne = echantillon.reduce((somme, valeur) => somme + valeur, 0) / echantillon.length;

  return {
    type: 'AUTOMATED_BEHAVIOR',
    severity: 4,
    evidence: {
      sampleSize: echantillon.length,
      averageIntervalMs: Math.round(moyenne),
      thresholdMs: thresholds.automationMinIntervalMs,
    },
    suggestedMeasure: 'TEMPORARY_RESTRICTION',
  };
};

/** Les 9 règles, dans l'ordre du backlog. Le nombre est vérifié par test. */
export const RULES: readonly Rule[] = [
  repeatedMoneyRequest,
  bulkSimilarMessages,
  repeatedAccountCreation,
  frequentDeviceChange,
  abnormalLikeVolume,
  verificationRefusal,
  multipleReports,
  suspiciousLink,
  automatedBehaviour,
];

export const RULE_COUNT = 9;

export class IrreversibleAutomaticMeasureError extends Error {
  constructor(type: SignalType, measure: ModerationActionType) {
    super(
      `La règle ${type} propose une mesure non automatisable (${measure}). ` +
        'Une règle ne peut appliquer que des mesures réversibles (ADR-012).',
    );
    this.name = 'IrreversibleAutomaticMeasureError';
  }
}

/**
 * Évalue les 9 règles et renvoie les signaux déclenchés.
 *
 * Le garde-fou est ici et non chez l'appelant : si une règle proposait un jour une
 * mesure irréversible, l'évaluation échoue bruyamment plutôt que de laisser passer
 * une sanction lourde automatique.
 */
export function evaluateRules(
  observation: BehaviourObservation,
  thresholds: DetectionThresholds,
): DetectionSignal[] {
  const signaux: DetectionSignal[] = [];

  for (const regle of RULES) {
    const signal = regle(observation, thresholds);
    if (signal === null) continue;

    if (signal.suggestedMeasure !== null && !isAutomatable(signal.suggestedMeasure)) {
      throw new IrreversibleAutomaticMeasureError(signal.type, signal.suggestedMeasure);
    }

    signaux.push(signal);
  }

  return signaux;
}

/**
 * Un membre qui déclenche plusieurs signaux mérite d'être regardé plus tôt.
 * La sévérité cumulée sert uniquement à cela : elle ne décide d'aucune sanction.
 */
export function aggregateSeverity(signals: DetectionSignal[]): number {
  return Math.min(
    5,
    signals.reduce((total, signal) => Math.max(total, signal.severity), 0) +
      (signals.length > 1 ? 1 : 0),
  );
}
