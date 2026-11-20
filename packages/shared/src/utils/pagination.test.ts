import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  cursorPageSchema,
  DEFAULT_PAGE_SIZE,
  MAX_CURSOR_LENGTH,
  MAX_PAGE_SIZE,
  pageQuerySchema,
} from './pagination.js';

/** Cursor pagination (CLAUDE.md API conventions): `cursor` and `limit` in, `{ items, nextCursor }` out. */

describe('page size constants', () => {
  it('match the documented values (a change here changes every list endpoint)', () => {
    expect({ DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MAX_CURSOR_LENGTH }).toEqual({
      DEFAULT_PAGE_SIZE: 25,
      MAX_PAGE_SIZE: 100,
      MAX_CURSOR_LENGTH: 512,
    });
    expect(pageQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});

describe('pageQuerySchema: limit', () => {
  it(`defaults to ${DEFAULT_PAGE_SIZE} when the query string has no limit`, () => {
    expect(pageQuerySchema.parse({})).toEqual({ limit: DEFAULT_PAGE_SIZE });
  });

  it('coerces the text of a query string to a number', () => {
    expect(pageQuerySchema.parse({ limit: '50' }).limit).toBe(50);
  });

  it(`accepts the bounds 1 and ${MAX_PAGE_SIZE}`, () => {
    expect(pageQuerySchema.parse({ limit: '1' }).limit).toBe(1);
    expect(pageQuerySchema.parse({ limit: String(MAX_PAGE_SIZE) }).limit).toBe(MAX_PAGE_SIZE);
  });

  it('refuses zero, a negative, a fraction, text, an empty value and anything above the maximum', () => {
    for (const limit of ['0', '-1', '2.5', 'abc', '', String(MAX_PAGE_SIZE + 1), '1000000']) {
      expect(pageQuerySchema.safeParse({ limit }).success, `limit=${JSON.stringify(limit)}`).toBe(false);
    }
  });

  it('returns exactly the integer it was given, for every allowed limit (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: MAX_PAGE_SIZE }),
        (n) => pageQuerySchema.parse({ limit: String(n) }).limit === n,
      ),
    );
  });

  it('refuses every integer outside 1 to the maximum (property)', () => {
    const outside = fc.oneof(fc.integer({ max: 0 }), fc.integer({ min: MAX_PAGE_SIZE + 1 }));
    fc.assert(fc.property(outside, (n) => !pageQuerySchema.safeParse({ limit: String(n) }).success));
  });
});

describe('pageQuerySchema: cursor', () => {
  it('is optional', () => {
    expect(pageQuerySchema.parse({ limit: '10' })).not.toHaveProperty('cursor');
  });

  it('passes an opaque cursor through unchanged', () => {
    expect(pageQuerySchema.parse({ cursor: 'eyJpZCI6IjAxOSJ9' }).cursor).toBe('eyJpZCI6IjAxOSJ9');
  });

  it('refuses an empty cursor, so "?cursor=" is an error and not the first page', () => {
    expect(pageQuerySchema.safeParse({ cursor: '' }).success).toBe(false);
  });

  it(`accepts ${MAX_CURSOR_LENGTH} characters and refuses one more`, () => {
    expect(pageQuerySchema.safeParse({ cursor: 'a'.repeat(MAX_CURSOR_LENGTH) }).success).toBe(true);
    expect(pageQuerySchema.safeParse({ cursor: 'a'.repeat(MAX_CURSOR_LENGTH + 1) }).success).toBe(false);
  });

  it('drops keys it does not know', () => {
    expect(pageQuerySchema.parse({ limit: '5', offset: '100' })).toEqual({ limit: 5 });
  });
});

describe('cursorPageSchema', () => {
  const page = cursorPageSchema(z.object({ id: z.string() }));

  it('accepts a last page (nextCursor null) and a page with more to come', () => {
    expect(page.safeParse({ items: [], nextCursor: null }).success).toBe(true);
    expect(page.safeParse({ items: [{ id: 'a' }], nextCursor: 'next' }).success).toBe(true);
  });

  it('refuses a missing nextCursor: the last page says null explicitly', () => {
    expect(page.safeParse({ items: [] }).success).toBe(false);
  });

  it('refuses an empty-string nextCursor', () => {
    expect(page.safeParse({ items: [], nextCursor: '' }).success).toBe(false);
  });

  it('checks every item against the item schema', () => {
    expect(page.safeParse({ items: [{ id: 'a' }, { id: 1 }], nextCursor: null }).success).toBe(false);
  });

  it('accepts any list of valid items with any non-empty cursor or null (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: fc.string() }), { maxLength: MAX_PAGE_SIZE }),
        fc.option(fc.string({ minLength: 1 }), { nil: null }),
        (items, nextCursor) => page.safeParse({ items, nextCursor }).success,
      ),
    );
  });
});
