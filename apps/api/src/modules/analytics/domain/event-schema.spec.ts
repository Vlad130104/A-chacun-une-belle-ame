import { describe, expect, it } from '@jest/globals';
import {
  definitionOf,
  EVENT_COUNT,
  EVENT_DEFINITIONS,
  EVENT_NAMES,
  isForbiddenKey,
  knownEvent,
  validateEvent,
} from './event-schema';

describe('catalogue d’événements', () => {
  it('déclare des événements tous distincts', () => {
    const noms = EVENT_DEFINITIONS.map((definition) => definition.name);
    expect(new Set(noms).size).toBe(EVENT_COUNT);
  });

  it('garde la liste des noms et le schéma exactement en regard', () => {
    // `EVENT_NAMES` protège le nom à la COMPILATION, `EVENT_DEFINITIONS` protège
    // les propriétés à l'EXÉCUTION. Si les deux divergeaient, un événement
    // deviendrait appelable sans être décrit — ou décrit sans être appelable.
    expect([...EVENT_NAMES].sort()).toEqual(
      EVENT_DEFINITIONS.map((definition) => definition.name).sort(),
    );
  });

  it('décrit chaque événement', () => {
    for (const definition of EVENT_DEFINITIONS) {
      expect({ nom: definition.name, decrit: definition.description.length > 10 }).toEqual({
        nom: definition.name,
        decrit: true,
      });
    }
  });

  it('couvre les six étapes du tunnel de migration', () => {
    for (const etape of [
      'invite.clicked',
      'signup.started',
      'signup.completed',
      'verification.submitted',
      'verification.approved',
      'profile.completed',
    ]) {
      expect({ etape, connu: knownEvent(etape) }).toEqual({ etape, connu: true });
    }
  });

  it('ne déclare AUCUNE propriété portant un nom interdit', () => {
    // Second filtre, redondant avec la liste blanche — et c'est voulu. Si
    // quelqu'un ajoute une propriété au schéma sans réfléchir, ce test l'arrête
    // avant la revue.
    for (const definition of EVENT_DEFINITIONS) {
      for (const cle of Object.keys(definition.properties)) {
        expect({ evenement: definition.name, cle, interdite: isForbiddenKey(cle) }).toEqual({
          evenement: definition.name,
          cle,
          interdite: false,
        });
      }
    }
  });

  it('n’interdit pas un mot qui CONTIENT par hasard un terme court', () => {
    // « ip » est contenu dans « reciprocal », « name » dans presque tout. Une
    // liste noire qui refuse des champs anodins finit contournée, donc inutile.
    expect(isForbiddenKey('reciprocal')).toBe(false);
    expect(isForbiddenKey('description')).toBe(false);
    // Mais le terme reste refusé quand il est bien un segment.
    expect(isForbiddenKey('ip')).toBe(true);
    expect(isForbiddenKey('clientIp')).toBe(true);
  });

  it('n’interdit pas le COMPTAGE d’une chose sensible', () => {
    // `photoCount` contient « photo » mais ne transporte aucune photo : c'est
    // un entier. Sans cette exemption, la tentation serait de contourner la
    // liste noire en renommant, ce qui l'affaiblirait au lieu de la préciser.
    expect(isForbiddenKey('photoCount')).toBe(false);
    expect(isForbiddenKey('messageCount')).toBe(false);
    expect(isForbiddenKey('photo')).toBe(true);
    expect(isForbiddenKey('photoUrl')).toBe(true);
  });
});

describe('validation d’un événement', () => {
  it('accepte un événement déclaré avec ses propriétés', () => {
    expect(validateEvent('match.created', { score: 0.82 })).toEqual({
      valid: true,
      properties: { score: 0.82 },
    });
  });

  it('accepte un événement sans propriété', () => {
    expect(validateEvent('signup.started', {})).toEqual({ valid: true, properties: {} });
  });

  it('refuse un événement inconnu', () => {
    expect(validateEvent('evenement.invente', {})).toEqual({
      valid: false,
      failure: { reason: 'UNKNOWN_EVENT' },
    });
  });

  it('REFUSE une propriété non déclarée', () => {
    // Le cœur de la story D10-05 : ce qui n'est pas prévu ne passe pas.
    expect(validateEvent('match.created', { score: 0.8, mystere: 'valeur' })).toEqual({
      valid: false,
      failure: { reason: 'UNDECLARED_PROPERTY', key: 'mystere' },
    });
  });

  it.each([
    ['phone'],
    ['phoneE164'],
    ['email'],
    ['firstName'],
    ['body'],
    ['photoUrl'],
    ['documentNumber'],
    ['latitude'],
  ])('refuse la clé nominative « %s »', (cle) => {
    expect(validateEvent('match.created', { [cle]: 'peu importe' })).toMatchObject({
      valid: false,
      failure: { reason: 'FORBIDDEN_KEY', key: cle },
    });
  });

  it('refuse une clé interdite même camouflée dans un nom plus long', () => {
    // `userPhoneNumber` contient « phone » : la comparaison est faite sur
    // l'inclusion, pas sur l'égalité.
    expect(validateEvent('match.created', { userPhoneNumber: '699' })).toMatchObject({
      valid: false,
      failure: { reason: 'FORBIDDEN_KEY' },
    });
  });

  it('signale une clé interdite AVANT de la chercher dans le schéma', () => {
    // Deux filtres : une clé interdite doit être signalée comme telle même si
    // quelqu'un vient de l'ajouter au schéma par erreur.
    const resultat = validateEvent('report.filed', { category: 'SPAM', email: 'a@b.test' });
    expect(resultat).toMatchObject({ failure: { reason: 'FORBIDDEN_KEY', key: 'email' } });
  });

  it('refuse une propriété du bon nom mais du mauvais type', () => {
    expect(validateEvent('match.created', { score: 'élevé' })).toEqual({
      valid: false,
      failure: { reason: 'WRONG_TYPE', key: 'score', expected: 'number' },
    });
  });

  it('ne laisse passer AUCUNE valeur non validée dans le résultat', () => {
    // Le résultat est reconstruit clé par clé : rien de l'objet d'entrée n'est
    // recopié en bloc, donc rien d'inattendu ne peut s'y glisser.
    const resultat = validateEvent('signup.completed', {
      campaignCode: 'whatsapp-01',
      hasInvite: true,
    });

    expect(resultat).toEqual({
      valid: true,
      properties: { campaignCode: 'whatsapp-01', hasInvite: true },
    });
  });

  it.each([[Number.NaN], [Number.POSITIVE_INFINITY]])(
    'refuse la valeur numérique non exploitable %p',
    (valeur) => {
      // Les accepter produirait des agrégats faux plutôt qu'un rejet visible.
      expect(validateEvent('match.created', { score: valeur })).toMatchObject({
        valid: false,
        failure: { reason: 'WRONG_TYPE' },
      });
    },
  );

  it('expose la définition d’un événement connu', () => {
    expect(definitionOf('interest.sent')?.properties).toEqual({ reciprocal: 'boolean' });
  });
});
