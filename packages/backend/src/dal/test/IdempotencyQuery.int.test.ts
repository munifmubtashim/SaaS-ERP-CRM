import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { runInTenantScope } from '../config/tenantScope.js';
import { IdempotencyQuery } from '../query/IdempotencyQuery.js';
import { createTree, newIds, setScope, type Tree } from './support/orgTree.js';

/**
 * IdempotencyQuery (ADR 0014 part 1): ADR 0014's dal tests 1, 2, 3 and 5 through the Query, as erp_app inside the
 * request's tenant transaction. Test 4 (no DELETE or TRUNCATE) is the table's, in IdempotencyKey.int.test.ts.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 6, txTimeoutMs: 15_000 });
const query = new IdempotencyQuery();
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdHNhbHQ$dGVzdGhhc2g'; // not a real password's hash
const ROUTE = 'POST /v1/payments';

let x: Tree;
let y: Tree;
let userX: string;
let userY: string;

async function addUser(tree: Tree): Promise<string> {
  return owner.$transaction(async (tx) => {
    const [id] = (await newIds(tx, 1)) as [string];
    await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId]);
    await tx.$executeRaw`
      INSERT INTO app_user (id, organization_id, email, password_hash, display_name)
      VALUES (${id}::uuid, ${tree.organizationId}::uuid, ${`iq-${id}@example.com`}, ${HASH}, 'Key User')`;
    return id;
  });
}

beforeAll(async () => {
  x = await createTree(owner);
  y = await createTree(owner);
  [userX, userY] = await Promise.all([addUser(x), addUser(y)]);
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

const freshKey = () => `k-${randomBytes(8).toString('hex')}`;
const hashOf = (body: string) => createHash('sha256').update(body).digest();
const inRequest = <T>(tree: Tree, fn: () => Promise<T>) =>
  runInTenantScope(
    app,
    { organizationId: tree.organizationId, businessIds: [tree.businessId], branchIds: [tree.branchId] },
    fn,
  );

describe('IdempotencyQuery (ADR 0014 part 1)', () => {
  it('a first claim returns null (claimed); after it completes, the same key returns the stored answer and headers', async () => {
    const key = freshKey();
    const claimInput = { key, route: ROUTE, userId: userX, requestHash: hashOf('a') };
    await inRequest(x, async () => {
      expect(await query.claim(claimInput)).toBeNull();
      await query.complete(key, 201, { id: 'r1' }, { Location: '/v1/payments/r1' });
    });
    const stored = await inRequest(x, () => query.claim(claimInput));
    expect(stored).toEqual({
      route: ROUTE,
      userId: userX,
      requestHash: hashOf('a'),
      statusCode: 201,
      responseBody: { id: 'r1' },
      responseHeaders: { Location: '/v1/payments/r1' },
    });
  });

  /** Holds a first claim open while a second claim of the same key runs; reports whether the second waited. */
  async function race(firstCommits: boolean) {
    const key = freshKey();
    const input = { key, route: ROUTE, userId: userX, requestHash: hashOf('b') };
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let claimed!: () => void;
    const firstClaimed = new Promise<void>((resolve) => (claimed = resolve));
    const first = inRequest(x, async () => {
      await query.claim(input);
      claimed();
      await held;
      if (!firstCommits) throw new Error('rolled back on purpose');
      await query.complete(key, 200, { ok: true }, {});
    }).catch((error: unknown) => {
      if (firstCommits) throw error;
    });
    await firstClaimed;
    let settled = false;
    const second = inRequest(x, () => query.claim(input)).finally(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 500));
    const waited = !settled;
    release();
    await first;
    return { waited, second: await second };
  }

  it('1. a second claim of the same key waits, then returns the stored answer once the first commits', async () => {
    const { waited, second } = await race(true);
    expect(waited).toBe(true);
    expect(second).toMatchObject({ statusCode: 200, responseBody: { ok: true }, responseHeaders: {} });
  });

  it('2. if the first rolls back, the waiting claim succeeds as a new claim (null)', async () => {
    const { waited, second } = await race(false);
    expect({ waited, second }).toEqual({ waited: true, second: null });
  });

  it('3. a second complete of the same key is refused by the database', async () => {
    const key = freshKey();
    await inRequest(x, async () => {
      await query.claim({ key, route: ROUTE, userId: userX, requestHash: hashOf('c') });
      await query.complete(key, 201, { id: 'r2' }, {});
    });
    await expect(inRequest(x, () => query.complete(key, 500, { other: true }, {}))).rejects.toThrow(
      /stored response never changes/,
    );
  });

  it("5. the same key in X and Y are two independent claims; X never sees Y's answer", async () => {
    const key = freshKey();
    await inRequest(y, async () => {
      await query.claim({ key, route: ROUTE, userId: userY, requestHash: hashOf('y') });
      await query.complete(key, 201, { secret: 'Y' }, {});
    });
    expect(
      await inRequest(x, () => query.claim({ key, route: ROUTE, userId: userX, requestHash: hashOf('x') })),
    ).toBeNull();
  });

  it('complete on a key this request never claimed is refused (nothing to store)', async () => {
    await expect(inRequest(x, () => query.complete(freshKey(), 200, {}, {}))).rejects.toThrow(/not claimed/);
  });
});
