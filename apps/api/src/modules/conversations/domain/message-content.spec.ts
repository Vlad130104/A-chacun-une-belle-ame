import { describe, expect, it } from '@jest/globals';
import {
  buildPreview,
  detectContentSignals,
  MAX_MESSAGE_LENGTH,
  normalizeMessageBody,
  PREVIEW_LENGTH,
  validateMessageBody,
} from './message-content';

describe('normalisation du corps d’un message', () => {
  it('coupe les espaces de bord', () => {
    expect(normalizeMessageBody('  bonjour  ')).toBe('bonjour');
  });

  it('retire les caractères de contrôle invisibles', () => {
    expect(normalizeMessageBody('bon\u0007jour')).toBe('bonjour');
  });

  it('conserve la tabulation et le saut de ligne', () => {
    expect(normalizeMessageBody('a\tb\nc')).toBe('a\tb\nc');
  });

  it('ramène un mur de sauts de ligne à deux', () => {
    expect(normalizeMessageBody('a\n\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('normalise les fins de ligne Windows', () => {
    expect(normalizeMessageBody('a\r\nb')).toBe('a\nb');
  });
});

describe('validation du corps d’un message', () => {
  it('accepte un message ordinaire et renvoie sa forme normalisée', () => {
    expect(validateMessageBody('  Bonsoir Awa  ')).toEqual({ valid: true, body: 'Bonsoir Awa' });
  });

  it('refuse un message vide', () => {
    expect(validateMessageBody('   ')).toEqual({ valid: false, error: 'EMPTY' });
  });

  it('refuse un message composé uniquement de caractères invisibles', () => {
    expect(validateMessageBody('\u0001\u0002\u0003')).toEqual({ valid: false, error: 'EMPTY' });
  });

  it('accepte exactement à la limite', () => {
    const resultat = validateMessageBody('a'.repeat(MAX_MESSAGE_LENGTH));
    expect(resultat).toMatchObject({ valid: true });
  });

  it('refuse un caractère au-delà de la limite', () => {
    expect(validateMessageBody('a'.repeat(MAX_MESSAGE_LENGTH + 1))).toEqual({
      valid: false,
      error: 'TOO_LONG',
    });
  });

  it('mesure APRÈS normalisation', () => {
    // Sinon un millier de caractères invisibles suffirait à faire refuser
    // un message parfaitement anodin.
    const bruit = '\u0000'.repeat(2000);
    expect(validateMessageBody(`${bruit}bonjour${bruit}`)).toEqual({
      valid: true,
      body: 'bonjour',
    });
  });
});

describe('signaux de contenu — on transmet, et on marque', () => {
  it('ne signale rien sur un message ordinaire', () => {
    expect(detectContentSignals('Bonsoir, comment s’est passée ta journée ?')).toEqual([]);
  });

  it('repère un numéro de téléphone', () => {
    expect(detectContentSignals('appelle-moi au +237 6 99 00 11 22')).toContain('CONTACT_SHARING');
  });

  it.each([['WhatsApp'], ['telegram'], ['Snap'], ['instagram']])(
    'repère la mention de %s',
    (service) => {
      expect(detectContentSignals(`on continue sur ${service} ?`)).toContain('CONTACT_SHARING');
    },
  );

  it('repère une adresse e-mail', () => {
    expect(detectContentSignals('écris à awa.n@example.com')).toContain('CONTACT_SHARING');
  });

  it('repère un lien sortant', () => {
    expect(detectContentSignals('regarde https://exemple.test/photo')).toContain('EXTERNAL_LINK');
  });

  it.each([
    ['envoie-moi 50 000 FCFA par Orange Money'],
    ['peux-tu me prêter de l’argent pour le visa'],
    ['il faut payer les frais de douane avant demain'],
  ])('repère une demande d’argent : « %s »', (texte) => {
    expect(detectContentSignals(texte)).toContain('MONEY_REQUEST');
  });

  it('n’empêche jamais l’envoi : la détection ne renvoie qu’une liste', () => {
    // Bloquer punirait deux personnes qui veulent légitimement se parler ailleurs.
    const signaux = detectContentSignals('mon numéro : 699001122, ou https://exemple.test');
    expect(signaux).toEqual(expect.arrayContaining(['CONTACT_SHARING', 'EXTERNAL_LINK']));
  });
});

describe('aperçu de conversation', () => {
  it('remplace le corps par une mention pour une image', () => {
    expect(buildPreview('peu importe', 'IMAGE')).toBe('📷 Photo');
  });

  it('aplatit les sauts de ligne', () => {
    expect(buildPreview('bonjour\n\nAwa', 'TEXT')).toBe('bonjour Awa');
  });

  it('tronque au-delà de la longueur d’aperçu', () => {
    const apercu = buildPreview('a'.repeat(500), 'TEXT');
    expect(apercu).toHaveLength(PREVIEW_LENGTH);
    expect(apercu.endsWith('…')).toBe(true);
  });
});
