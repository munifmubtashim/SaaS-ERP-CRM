import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { runInTenantScope } from '../config/tenantScope.js';
import { NumberSeriesQuery } from '../query/NumberSeriesQuery.js';
import { addBranch, createTree, setScope, type Tree } from './support/orgTree.js';

/**
 * NumberSeriesQuery (ADR 0015 sections 2 and 5): one atomic UPDATE ... RETURNING inside the request's tenant
 * transaction, as erp_app. The database half of ADR 0015 tests 1, 2, 6, 8 and 10; the formatting is NumberSeries's
 * (businessLogic). Each test uses its own kind name, so series never collide.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 6, txTimeoutMs: 15_000 });
const query = new NumberSeriesQuery();

let x: Tree;
let y: Tree;
let branchB: string;

beforeAll(async () => {
  x = await createTree(owner);
  y = await createTree(owner);
  branchB = await addBranch(owner, x.organizationId, x.businessId, 'NQB');
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

/** A kind name no other test uses. The Query's type accepts only the four kinds, so tests cast. */
const freshKind = () => `t_${randomBytes(5).toString('hex')}` as 'receipt';

async function addSeries(tree: Tree, branchId: string | null, kind: string, nextValue: bigint | number = 1) {
  await owner.$transaction(async (tx) => {
    await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId, branchB]);
    await tx.$executeRaw`
      INSERT INTO number_series (business_id, branch_id, kind, prefix, next_value, width)
      VALUES (${tree.businessId}::uuid, ${branchId}::uuid, ${kind}, 'RC-T-', ${nextValue}::bigint, 6)`;
  });
}

/** Runs fn as erp_app in a request transaction for the tree's business and the given branches. */
const inRequest = <T>(
  tree: Tree,
  fn: () => Promise<T>,
  branchIds = [tree.branchId],
  businessIds = [tree.businessId],
) => runInTenantScope(app, { organizationId: tree.organizationId, businessIds, branchIds }, fn);

describe('NumberSeriesQuery.take (ADR 0015 section 2)', () => {
  it('takes consecutive values from a branch series, as raw decimal strings with prefix and width', async () => {
    const kind = freshKind();
    await addSeries(x, x.branchId, kind);
    expect(await inRequest(x, () => query.take(kind, x.branchId))).toEqual({
      prefix: 'RC-T-',
      value: '1',
      width: 6,
    });
    expect((await inRequest(x, () => query.take(kind, x.branchId)))?.value).toBe('2');
  });

  it('8. a value past 2^53 comes back exact (bigint as text, never a float)', async () => {
    const kind = freshKind();
    await addSeries(x, x.branchId, kind, 9_007_199_254_740_993n);
    expect((await inRequest(x, () => query.take(kind, x.branchId)))?.value).toBe('9007199254740993');
  });

  it('10. null takes the business-wide series and a branch id takes that branch series, never the other', async () => {
    const kind = freshKind();
    await addSeries(x, null, kind, 500);
    await addSeries(x, x.branchId, kind, 7);
    expect((await inRequest(x, () => query.take(kind, null)))?.value).toBe('500');
    expect((await inRequest(x, () => query.take(kind, x.branchId)))?.value).toBe('7');
    expect((await inRequest(x, () => query.take(kind, null)))?.value).toBe('501');
  });

  it('6. no series for the kind gives null and writes nothing', async () => {
    expect(await inRequest(x, () => query.take(freshKind(), x.branchId))).toBeNull();
  });

  it('1. two parallel claims in one branch get two distinct, consecutive values', async () => {
    const kind = freshKind();
    await addSeries(x, x.branchId, kind);
    const values = await Promise.all([1, 2].map(() => inRequest(x, () => query.take(kind, x.branchId))));
    expect(values.map((taken) => taken?.value).sort()).toEqual(['1', '2']);
  });

  it('2. a request that rolls back gives its number back', async () => {
    const kind = freshKind();
    await addSeries(x, x.branchId, kind);
    await expect(
      inRequest(x, async () => {
        await query.take(kind, x.branchId);
        throw new Error('rolled back on purpose');
      }),
    ).rejects.toThrow('rolled back on purpose');
    expect((await inRequest(x, () => query.take(kind, x.branchId)))?.value).toBe('1');
  });

  it("a branch outside the request's scope takes nothing (RLS), and another business's series never", async () => {
    const kind = freshKind();
    await addSeries(x, branchB, kind);
    await addSeries(y, null, kind);
    expect(await inRequest(x, () => query.take(kind, branchB))).toBeNull();
    expect(await inRequest(x, () => query.take(kind, null))).toBeNull();
  });

  it('refuses a request with more than one business in scope (numbers are taken for one business)', async () => {
    const kind = freshKind();
    await addSeries(x, null, kind);
    const twoBusinesses = await createTree(owner);
    await expect(
      inRequest(x, () => query.take(kind, null), [x.branchId], [x.businessId, twoBusinesses.businessId]),
      // runInTenantScope refuses several businesses outside a read-only route first; the Query's own check is the
      // second line, for a read-only scope (where the UPDATE would fail anyway).
    ).rejects.toThrow(/several businesses|exactly one business/);
  });

  it('outside a request transaction it fails instead of running unscoped', async () => {
    await expect(query.take(freshKind(), null)).rejects.toThrow();
  });
});
