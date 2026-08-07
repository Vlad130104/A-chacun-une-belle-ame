import { describe, expect, it } from '@jest/globals';
import {
  CurrencyMismatchError,
  InvalidAmountError,
  addMoney,
  formatMoney,
  fromMajorUnit,
  minorUnitExponent,
  money,
  toMajorUnit,
} from './money';

describe('Money', () => {
  describe('exposant par devise', () => {
    it("attribue l'exposant 0 au franc CFA (XAF et XOF n'ont pas de sous-unité)", () => {
      expect(minorUnitExponent('XAF')).toBe(0);
      expect(minorUnitExponent('XOF')).toBe(0);
    });

    it("attribue l'exposant 2 aux devises à centimes", () => {
      expect(minorUnitExponent('EUR')).toBe(2);
      expect(minorUnitExponent('USD')).toBe(2);
    });

    it('représente 1 000 F CFA par 1000 et non par 100000', () => {
      expect(fromMajorUnit(1000, 'XAF').amountMinor).toBe(1000);
      expect(fromMajorUnit(1000, 'EUR').amountMinor).toBe(100000);
    });

    it('revient à la valeur affichée après aller-retour', () => {
      expect(toMajorUnit(money(5000, 'XAF'))).toBe(5000);
      expect(toMajorUnit(money(5000, 'EUR'))).toBe(50);
    });
  });

  describe('invariants', () => {
    it('refuse un montant négatif', () => {
      expect(() => money(-1, 'XAF')).toThrow(InvalidAmountError);
    });

    it('refuse un montant non entier', () => {
      expect(() => money(10.5, 'XAF')).toThrow(InvalidAmountError);
    });

    it('accepte zéro', () => {
      expect(money(0, 'XAF').amountMinor).toBe(0);
    });

    it("refuse l'addition entre deux devises différentes", () => {
      expect(() => addMoney(money(1000, 'XAF'), money(1000, 'XOF'))).toThrow(CurrencyMismatchError);
    });

    it('additionne deux montants de même devise', () => {
      expect(addMoney(money(1000, 'XAF'), money(500, 'XAF')).amountMinor).toBe(1500);
    });
  });

  describe('formatage', () => {
    it('affiche un montant en franc CFA sans décimale', () => {
      expect(formatMoney(money(5000, 'XAF')).replace(/[\u00A0\u202F\u2009]/g, ' ')).toBe(
        '5 000 F CFA',
      );
    });

    it('affiche un montant en euro avec deux décimales', () => {
      expect(formatMoney(money(4999, 'EUR')).replace(/[\u00A0\u202F\u2009]/g, ' ')).toBe('49,99 €');
    });
  });
});
