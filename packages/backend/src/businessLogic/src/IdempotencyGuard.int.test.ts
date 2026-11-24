import { randomBytes, randomUUID } from 'node:crypto';
import { createDbClient } from '@erp/dal';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createManagers, DenyAllRoleSource } from './index.js';

/**
 * ADR 0014 test 9 against real Postgres: two parallel requests with the same Idempotency-Key, each running the
 * sequence the api's `{ idempotent: true }` wrapper runs (claim, handler, complete) inside its own request
 * transaction, through the guard and Query createManagers builds. The handler runs once, one key row exists, and
 * both answers are identical. The wrapper itself (tests 8, 10, 11) is api/test/unit/idempotentRoute.test.ts; the
 * api layer may not reach the database from its tests, which is why this one lives here.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const { provided, tenantScope, close } = createManagers({
  databaseUrl: appUrl,
  version: 'test',
  dbPoolMax: 4,
  dbTxTimeoutMs: 15_000,
  roleSource: new DenyAllRoleSource(),
});
const owner = createDbClient(ownerUrl, { poolMax: 1, txTimeoutMs: 10_000 });
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdHNhbHQ$dGVzdGhhc2g'; // not a real password's hash

const ids = {
  org: randomUUID(),
  legal: randomUUID(),
  business: randomUUID(),
  branch: randomUUID(),
  user: randomUUID(),
};
const scope = { organizationId: ids.org, businessIds: [ids.business], branchIds: [ids.branch] };

async function asOwner<T>(
  sql: (tx: Parameters<Parameters<typeof owner.$transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return owner.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT set_config('app.organization_id', ${ids.org}, true), set_config('app.business_ids', ${ids.business}, true),
             set_config('app.branch_ids', ${ids.branch}, true)`;
    return sql(tx);
  });
}

beforeAll(async () => {
  await asOwner(async (tx) => {
    await tx.$executeRaw`INSERT INTO organization (id, name) VALUES (${ids.org}::uuid, 'IG Test Org')`;
    await tx.$executeRaw`
      INSERT INTO legal_entity (id, organization_id, name) VALUES (${ids.legal}::uuid, ${ids.org}::uuid, 'IG Legal')`;
    await tx.$executeRaw`
      INSERT INTO business (id, organization_id, legal_entity_id, name)
      VALUES (${ids.business}::uuid, ${ids.org}::uuid, ${ids.legal}::uuid, 'IG Business')`;
    await tx.$executeRaw`
      INSERT INTO branch (id, business_id, name, short_code) VALUES (${ids.branch}::uuid, ${ids.business}::uuid, 'IG Branch', 'IGB')`;
    await tx.$executeRaw`
      INSERT INTO app_user (id, organization_id, email, password_hash, display_name)
      VALUES (${ids.user}::uuid, ${ids.org}::uuid, ${`ig-${ids.user}@example.com`}, ${HASH}, 'Key User')`;
  });
});

afterAll(async () => {
  await Promise.all([close(), owner.$disconnect()]);
});

describe('IdempotencyGuard over the real Query (ADR 0014 test 9)', () => {
  it('9. two parallel requests with the same key: the handler runs once, one row, both answers identical', async () => {
    const key = `k-${randomBytes(8).toString('hex')}`;
    let runs = 0;
    const request = { key, route: 'POST /v1/payments', userId: ids.user, body: { amount: '100.00' } };
    /** What the wrapper does inside one request transaction; the handler waits a little to widen the race. */
    const oneRequest = () =>
      tenantScope.run(scope, async () => {
        const claim = await provided.idempotency.claim(request);
        if (claim.kind === 'replay') {
          return { status: claim.statusCode, body: claim.body, headers: claim.headers, replayed: true };
        }
        runs += 1;
        await new Promise((resolve) => setTimeout(resolve, 200));
        const result = {
          status: 201,
          body: { id: `p${runs}` },
          headers: { Location: `/v1/payments/p${runs}` },
        };
        await provided.idempotency.complete(key, result);
        return { ...result, replayed: false };
      });

    const answers = await Promise.all([oneRequest(), oneRequest()]);
    expect(runs).toBe(1);
    expect(answers.map((answer) => answer.replayed).sort()).toEqual([false, true]);
    const [a, b] = answers.map(({ status, body, headers }) => ({ status, body, headers }));
    expect(b).toEqual(a);
    const [row] = await asOwner(
      (tx) => tx.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM idempotency_key WHERE business_id = ${ids.business}::uuid AND key = ${key}`,
    );
    expect(row?.n).toBe(1);
  });
});
