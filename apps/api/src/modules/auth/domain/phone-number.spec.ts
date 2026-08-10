import { describe, expect, it } from '@jest/globals';
import { BusinessError } from '../../../common/errors/business.error';
import { PhoneNumber } from './phone-number';

describe('PhoneNumber', () => {
  describe('normalisation', () => {
    it('accepte un numéro E.164 déjà propre', () => {
      expect(PhoneNumber.create('+237690000000').value).toBe('+237690000000');
    });

    it('retire les séparateurs de saisie', () => {
      expect(PhoneNumber.create('+237 6 90 00 00 00').value).toBe('+237690000000');
      expect(PhoneNumber.create('+237-690-000-000').value).toBe('+237690000000');
      expect(PhoneNumber.create('+237.690.000.000').value).toBe('+237690000000');
    });

    it('convertit un préfixe international 00 en +', () => {
      expect(PhoneNumber.create('00237690000000').value).toBe('+237690000000');
    });
  });

  describe('validation', () => {
    it.each([
      ['sans indicatif', '690000000'],
      ['trop court', '+2376'],
      ['trop long', '+2376900000000000'],
      ['avec des lettres', '+237ABC000000'],
      ['vide', ''],
      ['indicatif commençant par zéro', '+0237690000000'],
    ])('refuse un numéro %s', (_cas, valeur) => {
      expect(() => PhoneNumber.create(valeur)).toThrow(BusinessError);
    });
  });

  describe('marchés de lancement', () => {
    it.each([
      ['Cameroun', '+237690000000', '+237'],
      ['Bénin', '+22997000000', '+229'],
      ["Côte d'Ivoire", '+2250700000000', '+225'],
    ])('reconnaît un numéro du %s', (_pays, numero, indicatif) => {
      expect(PhoneNumber.create(numero).countryCode).toBe(indicatif);
    });

    it('accepte un numéro hors marché de lancement sans indicatif reconnu', () => {
      const numero = PhoneNumber.create('+33612345678');
      expect(numero.countryCode).toBeNull();
    });
  });

  describe('masquage', () => {
    it('ne laisse apparaître que l’indicatif et les deux derniers chiffres', () => {
      expect(PhoneNumber.create('+237690000000').masked).toBe('+237*******00');
    });
  });

  it('compare deux numéros par leur valeur normalisée', () => {
    expect(PhoneNumber.create('+237 690 000 000').equals(PhoneNumber.create('+237690000000'))).toBe(
      true,
    );
  });
});
