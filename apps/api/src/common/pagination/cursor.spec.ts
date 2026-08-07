import { describe, expect, it } from '@jest/globals';
import { BusinessError } from '../errors/business.error';
import { buildPage, decodeCursor, encodeCursor } from './cursor';

describe('pagination par curseur', () => {
  it('encode puis décode sans perte', () => {
    const payload = { createdAt: '2026-08-06T10:00:00.000Z', id: 'clx0000000000000000000' };
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it('refuse un curseur falsifié', () => {
    expect(() => decodeCursor('pas-du-base64-json')).toThrow(BusinessError);
  });

  it('refuse un curseur au contenu incomplet', () => {
    const forged = Buffer.from(JSON.stringify({ id: 'abc' }), 'utf8').toString('base64url');
    expect(() => decodeCursor(forged)).toThrow(BusinessError);
  });

  it('refuse un curseur dont la date est invalide', () => {
    const forged = Buffer.from(JSON.stringify({ id: 'abc', createdAt: 'hier' }), 'utf8').toString(
      'base64url',
    );
    expect(() => decodeCursor(forged)).toThrow(BusinessError);
  });

  describe('construction de page', () => {
    const rows = Array.from({ length: 4 }, (_, index) => ({
      id: `id-${index}`,
      createdAt: new Date(`2026-08-0${index + 1}T10:00:00.000Z`),
    }));

    it('signale la page suivante lorsque le surplus est présent', () => {
      const page = buildPage(rows, 3);
      expect(page.items).toHaveLength(3);
      expect(page.hasMore).toBe(true);
      expect(page.nextCursor).not.toBeNull();
    });

    it('ne renvoie pas de curseur sur la dernière page', () => {
      const page = buildPage(rows.slice(0, 2), 3);
      expect(page.items).toHaveLength(2);
      expect(page.hasMore).toBe(false);
      expect(page.nextCursor).toBeNull();
    });

    it('gère une page vide', () => {
      const page = buildPage([], 20);
      expect(page).toEqual({ items: [], hasMore: false, nextCursor: null });
    });

    it('positionne le curseur sur le dernier élément retenu', () => {
      const page = buildPage(rows, 3);
      expect(decodeCursor(page.nextCursor as string).id).toBe('id-2');
    });
  });
});
