import { AppError } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import type { ClaimInput, IIdempotencyQuery, StoredKey } from './contracts/IIdempotencyQuery.js';
import { canonicalHash, IdempotencyGuard } from './IdempotencyGuard.js';

/**
 * ADR 0014 tests 6 and 7, and ADR 0011 sections 1, 3 and 4, with a fake Query. The database half (the claim that
 * waits, the stored-once trigger, RLS) needs migration idempotency_key and is tested in dal with it.
 */
const USER = '01937000-0000-7000-8000-0000000000b0';
const ROUTE = 'POST /v1/payments';

class FakeIdempotencyQuery implements IIdempotencyQuery {
  claims: ClaimInput[] = [];
  completed: { key: string; statusCode: number; body: unknown; headers: Record<string, string> }[] = [];
  constructor(private readonly existing: StoredKey | null = null) {}
  async claim(input: ClaimInput): Promise<StoredKey | null> {
    this.claims.push(input);
    return this.existing;
  }
  async complete(
    key: string,
    statusCode: number,
    body: unknown,
    headers: Record<string, string>,
  ): Promise<void> {
    this.completed.push({ key, statusCode, body, headers });
  }
}

const body = { amount: '12500.00', partyId: 'p-1', lines: [{ a: 1, b: 2 }] };

const errorOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
};

describe('canonicalHash (ADR 0014 test 6)', () => {
  it('ignores object key order at every level', () => {
    const reordered = { lines: [{ b: 2, a: 1 }], partyId: 'p-1', amount: '12500.00' };
    expect(canonicalHash(reordered).equals(canonicalHash(body))).toBe(true);
  });

  it('changes when any value, or the order of an array, changes', () => {
    const base = canonicalHash(body);
    expect(canonicalHash({ ...body, amount: '12500.01' }).equals(base)).toBe(false);
    expect(canonicalHash({ ...body, lines: [{ a: 1, b: 3 }] }).equals(base)).toBe(false);
    expect(canonicalHash({ x: [1, 2] }).equals(canonicalHash({ x: [2, 1] }))).toBe(false);
  });

  it('is SHA-256 (32 bytes)', () => {
    expect(canonicalHash(body)).toHaveLength(32);
  });
});

describe('IdempotencyGuard.claim (ADR 0014 test 7, ADR 0011 sections 1, 3, 4)', () => {
  it('a new key is claimed: the Query gets the key, route, user and hash', async () => {
    const query = new FakeIdempotencyQuery(null);
    await expect(
      new IdempotencyGuard(query).claim({ key: 'k-1', route: ROUTE, userId: USER, body }),
    ).resolves.toEqual({
      kind: 'claimed',
    });
    expect(query.claims).toEqual([
      { key: 'k-1', route: ROUTE, userId: USER, requestHash: canonicalHash(body) },
    ]);
  });

  it('a stored key with the same hash, route and user is a replay of the stored answer', async () => {
    const stored: StoredKey = {
      route: ROUTE,
      userId: USER,
      requestHash: canonicalHash({ ...body }),
      statusCode: 201,
      responseBody: { id: 'pay-1' },
      responseHeaders: { Location: '/v1/payments/pay-1' },
    };
    const guard = new IdempotencyGuard(new FakeIdempotencyQuery(stored));
    await expect(guard.claim({ key: 'k-1', route: ROUTE, userId: USER, body })).resolves.toEqual({
      kind: 'replay',
      statusCode: 201,
      body: { id: 'pay-1' },
      headers: { Location: '/v1/payments/pay-1' },
    });
  });

  it('a replay carries the stored response headers, and none when the first answer had none (Farhan, #96)', async () => {
    const stored: StoredKey = {
      route: ROUTE,
      userId: USER,
      requestHash: canonicalHash(body),
      statusCode: 200,
      responseBody: { ok: true },
      responseHeaders: {},
    };
    await expect(
      new IdempotencyGuard(new FakeIdempotencyQuery(stored)).claim({
        key: 'k-1',
        route: ROUTE,
        userId: USER,
        body,
      }),
    ).resolves.toEqual({ kind: 'replay', statusCode: 200, body: { ok: true }, headers: {} });
  });

  it.each([
    ['another body', { requestHash: canonicalHash({ ...body, amount: '1.00' }) }],
    ['another route', { route: 'POST /v1/receipts' }],
    ['another user', { userId: '01937000-0000-7000-8000-0000000000b1' }],
  ])('a stored key with %s is refused with 409 idempotency.key_reused', async (_case, change) => {
    const stored: StoredKey = {
      route: ROUTE,
      userId: USER,
      requestHash: canonicalHash(body),
      statusCode: 201,
      responseBody: {},
      responseHeaders: {},
      ...change,
    };
    const error = await errorOf(
      new IdempotencyGuard(new FakeIdempotencyQuery(stored)).claim({
        key: 'k-1',
        route: ROUTE,
        userId: USER,
        body,
      }),
    );
    expect(error.code).toBe('CONFLICT');
    expect(error.fields).toEqual([
      { path: 'Idempotency-Key', code: 'idempotency.key_reused', message: expect.any(String) },
    ]);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['too long', 'k'.repeat(256)],
    ['not visible ASCII', 'key with space'],
    ['non-ASCII', 'কী'],
  ])(
    'a %s key is 400 idempotency.missing (one code for absent and malformed, ADR 0011), and nothing is claimed',
    async (_case, key) => {
      const query = new FakeIdempotencyQuery(null);
      const error = await errorOf(
        new IdempotencyGuard(query).claim({ key, route: ROUTE, userId: USER, body }),
      );
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.fields).toEqual([
        { path: 'Idempotency-Key', code: 'idempotency.missing', message: expect.any(String) },
      ]);
      expect(query.claims).toEqual([]);
    },
  );

  it('accepts a 255-character visible-ASCII key', async () => {
    await expect(
      new IdempotencyGuard(new FakeIdempotencyQuery(null)).claim({
        key: '~'.repeat(255),
        route: ROUTE,
        userId: USER,
        body,
      }),
    ).resolves.toEqual({ kind: 'claimed' });
  });

  it('complete stores the status, body and response headers through the Query', async () => {
    const query = new FakeIdempotencyQuery(null);
    await new IdempotencyGuard(query).complete('k-1', {
      status: 201,
      body: { id: 'pay-1' },
      headers: { Location: '/v1/payments/pay-1' },
    });
    expect(query.completed).toEqual([
      { key: 'k-1', statusCode: 201, body: { id: 'pay-1' }, headers: { Location: '/v1/payments/pay-1' } },
    ]);
  });

  it('complete stores no headers when the answer has none', async () => {
    const query = new FakeIdempotencyQuery(null);
    await new IdempotencyGuard(query).complete('k-1', { status: 200, body: { ok: true } });
    expect(query.completed).toEqual([{ key: 'k-1', statusCode: 200, body: { ok: true }, headers: {} }]);
  });
});
