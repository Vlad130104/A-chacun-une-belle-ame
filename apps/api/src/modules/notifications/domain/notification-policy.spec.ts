import { describe, expect, it } from '@jest/globals';
import {
  ALL_CHANNELS,
  checkPreferenceUpdate,
  dedupeKey,
  defaultChannels,
  isMandatory,
  mandatoryTypes,
  messageDedupeKey,
  MVP_TRIGGER_COUNT,
  MVP_TRIGGERS,
  purgeAt,
  resolveChannels,
  type DeliveryContext,
  type NotificationType,
  type PreferenceEntry,
} from './notification-policy';

const contexteComplet: DeliveryContext = {
  hasPushToken: true,
  hasVerifiedEmail: true,
  hasPhone: true,
};

describe('déclencheurs du MVP', () => {
  it('en compte exactement huit, tous distincts', () => {
    expect(new Set(MVP_TRIGGERS).size).toBe(MVP_TRIGGER_COUNT);
  });

  it('associe des canaux à chaque type connu', () => {
    for (const type of MVP_TRIGGERS) {
      expect(defaultChannels(type).length).toBeGreaterThan(0);
    }
  });

  it('inclut toujours le canal in-app, sauf pour l’OTP', () => {
    // Le centre de notifications doit rester un historique complet même quand
    // un push a échoué. L'OTP fait exception : il n'a de sens qu'en SMS.
    for (const type of MVP_TRIGGERS) {
      expect({ type, inApp: defaultChannels(type).includes('IN_APP') }).toEqual({
        type,
        inApp: true,
      });
    }
    expect(defaultChannels('OTP_CODE')).toEqual(['SMS']);
  });

  it('ne réserve le SMS qu’à l’OTP', () => {
    // Canal coûteux : en abuser reviendrait à faire payer l'utilisateur pour
    // du marketing.
    for (const type of MVP_TRIGGERS) {
      expect({ type, sms: defaultChannels(type).includes('SMS') }).toEqual({ type, sms: false });
    }
    expect(defaultChannels('OTP_CODE')).toContain('SMS');
  });

  it('n’utilise que des canaux du catalogue', () => {
    for (const type of MVP_TRIGGERS) {
      for (const canal of defaultChannels(type)) {
        expect(ALL_CHANNELS).toContain(canal);
      }
    }
  });
});

describe('types non désactivables', () => {
  it.each([
    ['OTP_CODE'],
    ['SECURITY_ALERT'],
    ['VERIFICATION_APPROVED'],
    ['VERIFICATION_REJECTED'],
    ['VERIFICATION_ADDITIONAL'],
    ['MODERATION_ACTION'],
  ])('rend %s obligatoire', (type) => {
    expect(isMandatory(type as NotificationType)).toBe(true);
  });

  it.each([['NEW_MATCH'], ['NEW_MESSAGE'], ['NEW_INTEREST'], ['SUBSCRIPTION_RENEWED']])(
    'laisse %s désactivable',
    (type) => {
      expect(isMandatory(type as NotificationType)).toBe(false);
    },
  );

  it('refuse la DÉSACTIVATION d’un type obligatoire', () => {
    for (const type of mandatoryTypes()) {
      expect(checkPreferenceUpdate(type, false)).toEqual({
        allowed: false,
        reason: 'MANDATORY_TYPE',
      });
    }
  });

  it('autorise l’ACTIVATION d’un type obligatoire', () => {
    // Refuser aussi l'activation empêcherait de revenir en arrière après une
    // désactivation antérieure : ce serait absurde.
    for (const type of mandatoryTypes()) {
      expect(checkPreferenceUpdate(type, true)).toEqual({ allowed: true });
    }
  });

  it('autorise la désactivation d’un type ordinaire', () => {
    expect(checkPreferenceUpdate('NEW_MATCH', false)).toEqual({ allowed: true });
  });
});

describe('résolution des canaux', () => {
  it('retient les canaux par défaut quand tout est disponible', () => {
    expect(resolveChannels('NEW_MATCH', [], contexteComplet)).toEqual(['IN_APP', 'PUSH']);
  });

  it('retire un canal désactivé par le membre', () => {
    const preferences: PreferenceEntry[] = [{ type: 'NEW_MATCH', channel: 'PUSH', enabled: false }];
    expect(resolveChannels('NEW_MATCH', preferences, contexteComplet)).toEqual(['IN_APP']);
  });

  it('IGNORE la préférence sur un type obligatoire', () => {
    // Le cœur de la story D8-04 : un appel direct à l'API ne suffit pas à se
    // couper d'une alerte de sécurité.
    const preferences: PreferenceEntry[] = [
      { type: 'SECURITY_ALERT', channel: 'PUSH', enabled: false },
      { type: 'SECURITY_ALERT', channel: 'EMAIL', enabled: false },
      { type: 'SECURITY_ALERT', channel: 'IN_APP', enabled: false },
    ];
    expect(resolveChannels('SECURITY_ALERT', preferences, contexteComplet)).toEqual([
      'IN_APP',
      'PUSH',
      'EMAIL',
    ]);
  });

  it('retire le push quand aucun jeton n’est enregistré', () => {
    // Envoyer un push sans jeton produit un échec permanent que la file
    // réessaierait pour rien.
    const contexte = { ...contexteComplet, hasPushToken: false };
    expect(resolveChannels('NEW_MATCH', [], contexte)).toEqual(['IN_APP']);
  });

  it('retire l’e-mail quand aucune adresse n’est vérifiée', () => {
    const contexte = { ...contexteComplet, hasVerifiedEmail: false };
    expect(resolveChannels('SUBSCRIPTION_FAILED', [], contexte)).toEqual(['IN_APP', 'PUSH']);
  });

  it('retire le SMS quand aucun numéro n’est connu', () => {
    const contexte = { ...contexteComplet, hasPhone: false };
    expect(resolveChannels('OTP_CODE', [], contexte)).toEqual([]);
  });

  it('conserve l’in-app même sans aucun moyen technique', () => {
    const contexte = { hasPushToken: false, hasVerifiedEmail: false, hasPhone: false };
    expect(resolveChannels('MODERATION_ACTION', [], contexte)).toEqual(['IN_APP']);
  });
});

describe('anti-doublon', () => {
  it('produit la même clé pour le même événement', () => {
    // Une clé qui contiendrait l'horodatage ne dédupliquerait rien.
    expect(dedupeKey('NEW_MATCH', 'match-1')).toBe(dedupeKey('NEW_MATCH', 'match-1'));
  });

  it('distingue deux événements différents', () => {
    expect(dedupeKey('NEW_MATCH', 'match-1')).not.toBe(dedupeKey('NEW_MATCH', 'match-2'));
    expect(dedupeKey('NEW_MATCH', 'x')).not.toBe(dedupeKey('NEW_INTEREST', 'x'));
  });

  it('regroupe les messages d’une conversation par heure', () => {
    // Une notification par message rendrait le canal insupportable, et le
    // membre finirait par tout couper — y compris ce qui compte.
    const a = messageDedupeKey('conv-1', new Date('2026-03-15T10:05:00.000Z'));
    const b = messageDedupeKey('conv-1', new Date('2026-03-15T10:55:00.000Z'));
    expect(a).toBe(b);
  });

  it('rouvre une notification à l’heure suivante', () => {
    const a = messageDedupeKey('conv-1', new Date('2026-03-15T10:55:00.000Z'));
    const b = messageDedupeKey('conv-1', new Date('2026-03-15T11:05:00.000Z'));
    expect(a).not.toBe(b);
  });

  it('ne confond pas deux conversations', () => {
    const instant = new Date('2026-03-15T10:00:00.000Z');
    expect(messageDedupeKey('conv-1', instant)).not.toBe(messageDedupeKey('conv-2', instant));
  });
});

describe('rétention', () => {
  it('calcule la date de purge en jours', () => {
    expect(purgeAt(new Date('2026-03-15T12:00:00.000Z'), 90).toISOString()).toBe(
      '2026-06-13T12:00:00.000Z',
    );
  });
});
