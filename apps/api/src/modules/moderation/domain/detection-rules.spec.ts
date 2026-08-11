import { describe, expect, it } from '@jest/globals';
import { isAutomatable } from './case-policy';
import {
  aggregateSeverity,
  evaluateRules,
  RULE_COUNT,
  RULES,
  type BehaviourObservation,
  type DetectionThresholds,
  type SignalType,
} from './detection-rules';

const SEUILS: DetectionThresholds = {
  moneyRequestCount: 3,
  moneyRequestWindowHours: 24,
  bulkSimilarCount: 5,
  bulkSimilarRatio: 0.9,
  accountCreationCount: 3,
  accountCreationWindowDays: 30,
  deviceChangeCount: 5,
  deviceChangeWindowDays: 7,
  likeVolumeMultiplier: 3,
  verificationRefusalCount: 3,
  multipleReportsCount: 3,
  multipleReportsWindowDays: 7,
  suspiciousLinkCount: 3,
  automationMinIntervalMs: 400,
  automationSampleSize: 10,
};

/** Membre parfaitement ordinaire : aucune règle ne doit se déclencher sur lui. */
const membreOrdinaire: BehaviourObservation = {
  userId: 'membre',
  moneyRequestSignals: 0,
  moneyRequestWindowHours: 24,
  recentMessageCount: 12,
  duplicateMessageRatio: 0.1,
  accountsFromSameDevice: 1,
  accountCreationWindowDays: 30,
  distinctDevicesUsed: 2,
  deviceWindowDays: 7,
  likesToday: 8,
  platformMedianLikesPerDay: 10,
  verificationRefusals: 0,
  distinctReportersRecently: 0,
  reportWindowDays: 7,
  suspiciousLinkSignals: 0,
  actionIntervalsMs: [1500, 2400, 3000],
};

const observer = (surcharge: Partial<BehaviourObservation> = {}): BehaviourObservation => ({
  ...membreOrdinaire,
  ...surcharge,
});

const typesDetectes = (surcharge: Partial<BehaviourObservation>): SignalType[] =>
  evaluateRules(observer(surcharge), SEUILS).map((signal) => signal.type);

describe('inventaire des règles', () => {
  it('compte les 9 règles annoncées', () => {
    expect(RULES).toHaveLength(RULE_COUNT);
  });

  it('ne signale rien sur un membre ordinaire', () => {
    // Le test le plus important du fichier : une règle qui se déclenche sur tout
    // le monde ne détecte rien, elle noie la file de modération.
    expect(evaluateRules(membreOrdinaire, SEUILS)).toEqual([]);
  });
});

describe('R1 — demandes d’argent répétées', () => {
  it('se déclenche au seuil', () => {
    expect(typesDetectes({ moneyRequestSignals: 3 })).toContain('REPEATED_MONEY_REQUEST');
  });

  it('reste muette juste en dessous', () => {
    expect(typesDetectes({ moneyRequestSignals: 2 })).not.toContain('REPEATED_MONEY_REQUEST');
  });

  it('propose une restriction, jamais une suspension', () => {
    const signal = evaluateRules(observer({ moneyRequestSignals: 5 }), SEUILS)[0];
    expect(signal?.suggestedMeasure).toBe('TEMPORARY_RESTRICTION');
  });

  it('n’emporte aucun contenu de message dans ses preuves', () => {
    // `evidence` est documentée comme non nominative : compteurs et seuils, rien
    // d'autre. Un modérateur ouvre le message par le cas, pas par le signal.
    const signal = evaluateRules(observer({ moneyRequestSignals: 5 }), SEUILS)[0];
    expect(Object.keys(signal?.evidence ?? {}).sort()).toEqual([
      'count',
      'threshold',
      'windowHours',
    ]);
  });
});

describe('R2 — messages similaires en masse', () => {
  it('exige à la fois le volume ET la ressemblance', () => {
    expect(typesDetectes({ recentMessageCount: 20, duplicateMessageRatio: 0.2 })).not.toContain(
      'BULK_SIMILAR_MESSAGES',
    );
    expect(typesDetectes({ recentMessageCount: 3, duplicateMessageRatio: 0.99 })).not.toContain(
      'BULK_SIMILAR_MESSAGES',
    );
  });

  it('se déclenche quand les deux conditions sont réunies', () => {
    expect(typesDetectes({ recentMessageCount: 20, duplicateMessageRatio: 0.95 })).toContain(
      'BULK_SIMILAR_MESSAGES',
    );
  });
});

describe('R3 — créations répétées de comptes', () => {
  it('se déclenche au seuil de comptes sur une même empreinte', () => {
    expect(typesDetectes({ accountsFromSameDevice: 3 })).toContain('REPEATED_ACCOUNT_CREATION');
  });

  it('propose une re-vérification, pas un bannissement', () => {
    // Une empreinte d'appareil se partage : cybercafé, téléphone familial.
    const signal = evaluateRules(observer({ accountsFromSameDevice: 4 }), SEUILS)[0];
    expect(signal?.suggestedMeasure).toBe('REVERIFICATION_REQUIRED');
  });
});

describe('R4 — changements fréquents d’appareil', () => {
  it('se déclenche au seuil', () => {
    expect(typesDetectes({ distinctDevicesUsed: 5 })).toContain('FREQUENT_DEVICE_CHANGE');
  });

  it('ne propose aucune mesure — signal faible', () => {
    const signal = evaluateRules(observer({ distinctDevicesUsed: 9 }), SEUILS)[0];
    expect(signal?.suggestedMeasure).toBeNull();
  });
});

describe('R5 — volume anormal de likes', () => {
  it('compare à la médiane observée, jamais à une constante', () => {
    // 25 likes sur une plateforme dont la médiane est 10 : anormal.
    expect(typesDetectes({ likesToday: 40, platformMedianLikesPerDay: 10 })).toContain(
      'ABNORMAL_LIKE_VOLUME',
    );
    // Les mêmes 40 likes sur une plateforme très active : parfaitement banal.
    expect(typesDetectes({ likesToday: 40, platformMedianLikesPerDay: 30 })).not.toContain(
      'ABNORMAL_LIKE_VOLUME',
    );
  });

  it('reste muette quand la médiane est inconnue', () => {
    // Au démarrage de la plateforme, comparer à zéro signalerait tout le monde.
    expect(typesDetectes({ likesToday: 100, platformMedianLikesPerDay: 0 })).not.toContain(
      'ABNORMAL_LIKE_VOLUME',
    );
  });
});

describe('R6 — refus répété de vérification', () => {
  it('se déclenche au seuil', () => {
    expect(typesDetectes({ verificationRefusals: 3 })).toContain('VERIFICATION_REFUSAL');
  });
});

describe('R7 — signalements multiples', () => {
  it('compte les signalants DISTINCTS', () => {
    // Sinon une seule personne déterminée suffirait à faire sanctionner un membre.
    expect(typesDetectes({ distinctReportersRecently: 3 })).toContain('MULTIPLE_REPORTS');
    expect(typesDetectes({ distinctReportersRecently: 1 })).not.toContain('MULTIPLE_REPORTS');
  });

  it('ne propose aucune mesure automatique', () => {
    // Une campagne de signalements coordonnée ne doit pas produire de sanction.
    const signal = evaluateRules(observer({ distinctReportersRecently: 8 }), SEUILS)[0];
    expect(signal?.suggestedMeasure).toBeNull();
  });
});

describe('R8 — liens suspects', () => {
  it('se déclenche au seuil', () => {
    expect(typesDetectes({ suspiciousLinkSignals: 3 })).toContain('SUSPICIOUS_LINK');
  });
});

describe('R9 — comportement automatisé', () => {
  it('exige un échantillon suffisant', () => {
    expect(typesDetectes({ actionIntervalsMs: [50, 60, 70] })).not.toContain('AUTOMATED_BEHAVIOR');
  });

  it('se déclenche sur une série entièrement sous le seuil', () => {
    expect(typesDetectes({ actionIntervalsMs: Array(10).fill(120) })).toContain(
      'AUTOMATED_BEHAVIOR',
    );
  });

  it('ne se déclenche pas si un seul intervalle est humain', () => {
    // Une action rapide est banale ; une série entière ne l'est pas.
    const intervalles = [...Array(9).fill(120), 3000];
    expect(typesDetectes({ actionIntervalsMs: intervalles })).not.toContain('AUTOMATED_BEHAVIOR');
  });

  it('n’examine que les dernières actions', () => {
    const intervalles = [...Array(20).fill(5000), ...Array(10).fill(100)];
    expect(typesDetectes({ actionIntervalsMs: intervalles })).toContain('AUTOMATED_BEHAVIOR');
  });
});

describe('garde-fou ADR-012', () => {
  it('aucune règle ne propose une mesure non automatisable', () => {
    // Vérifié règle par règle sur un membre qui les déclenche toutes : si une
    // règle proposait un jour une suspension, ce test tomberait.
    const signaux = evaluateRules(
      observer({
        moneyRequestSignals: 10,
        recentMessageCount: 50,
        duplicateMessageRatio: 0.99,
        accountsFromSameDevice: 6,
        distinctDevicesUsed: 9,
        likesToday: 200,
        platformMedianLikesPerDay: 10,
        verificationRefusals: 5,
        distinctReportersRecently: 9,
        suspiciousLinkSignals: 8,
        actionIntervalsMs: Array(12).fill(50),
      }),
      SEUILS,
    );

    expect(signaux).toHaveLength(RULE_COUNT);
    for (const signal of signaux) {
      if (signal.suggestedMeasure !== null) {
        expect(isAutomatable(signal.suggestedMeasure)).toBe(true);
      }
    }
  });

  it('n’attribue à aucune règle une mesure de suspension ou de bannissement', () => {
    const mesures = evaluateRules(
      observer({
        moneyRequestSignals: 10,
        accountsFromSameDevice: 6,
        suspiciousLinkSignals: 8,
        actionIntervalsMs: Array(12).fill(50),
      }),
      SEUILS,
    ).map((signal) => signal.suggestedMeasure);

    expect(mesures).not.toContain('SUSPENSION');
    expect(mesures).not.toContain('BAN');
  });
});

describe('sévérité agrégée', () => {
  it('vaut zéro sans signal', () => {
    expect(aggregateSeverity([])).toBe(0);
  });

  it('retient la sévérité maximale d’un signal isolé', () => {
    const signaux = evaluateRules(observer({ distinctDevicesUsed: 9 }), SEUILS);
    expect(aggregateSeverity(signaux)).toBe(2);
  });

  it('majore quand plusieurs règles se déclenchent ensemble', () => {
    const signaux = evaluateRules(
      observer({ distinctDevicesUsed: 9, suspiciousLinkSignals: 5 }),
      SEUILS,
    );
    expect(aggregateSeverity(signaux)).toBe(4);
  });

  it('reste plafonnée à cinq', () => {
    const signaux = evaluateRules(
      observer({ moneyRequestSignals: 10, suspiciousLinkSignals: 8, distinctDevicesUsed: 9 }),
      SEUILS,
    );
    expect(aggregateSeverity(signaux)).toBe(5);
  });
});
