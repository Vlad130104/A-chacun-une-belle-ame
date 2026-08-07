import { ErrorCode } from '@acuba/contracts';
import { BusinessError } from '../errors/business.error';

/**
 * Pagination par curseur opaque.
 *
 * Aucun `OFFSET` n'est utilisé sur une table susceptible de croître : le curseur
 * encode le couple de tri (createdAt, id), pour lequel un index composite existe
 * sur chaque table concernée (docs/01-architecture.md §9).
 */
export interface CursorPayload {
  createdAt: string;
  id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw BusinessError.badRequest(ErrorCode.VALIDATION_FAILED, { field: 'cursor' });
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as CursorPayload).id !== 'string' ||
    typeof (parsed as CursorPayload).createdAt !== 'string' ||
    Number.isNaN(Date.parse((parsed as CursorPayload).createdAt))
  ) {
    throw BusinessError.badRequest(ErrorCode.VALIDATION_FAILED, { field: 'cursor' });
  }

  return parsed as CursorPayload;
}

/**
 * Découpe une page à partir de `limit + 1` éléments lus : la présence du surplus
 * indique qu'une page suivante existe, sans requête de comptage.
 */
export function buildPage<T extends { id: string; createdAt: Date }>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null; hasMore: boolean } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);

  return {
    items,
    hasMore,
    nextCursor:
      hasMore && last
        ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
        : null,
  };
}
