import { z } from 'zod';

/**
 * Cursor pagination (CLAUDE.md API conventions). Every list endpoint takes `cursor` and `limit` and returns
 * `{ items, nextCursor }`; `nextCursor` is null on the last page. The cursor is opaque to the client.
 */
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const pageQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  /** Query strings arrive as text, so the number is coerced. */
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export function cursorPageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().min(1).nullable(),
  });
}
