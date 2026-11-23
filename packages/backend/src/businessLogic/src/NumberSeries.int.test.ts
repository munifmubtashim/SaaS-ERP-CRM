import { randomBytes, randomUUID } from 'node:crypto';
import { AppError } from '@erp/shared';
import { createDbClient } from '@erp/dal';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createManagers, DenyAllRoleSource } from './index.js';
import type { NumberSeriesKind } from './contracts/provided/INumberSeries.js';

/**
 * ADR 0015 tests 6, 8 and 10 end to end, against real Postgres: NumberSeries over the real NumberSeriesQuery, both
 * built by createManagers as the api builds them, inside a request transaction (tenantScope) as erp_app. Also two
 * parallel claims (test 1). The unit tests with a fake Query stay in NumberSeries.test.ts.
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

const ids = { org: randomUUID(), legal: randomUUID(), business: randomUUID(), branch: randomUUID() };
const scope = { organizationId: ids.org, businessIds: [ids.business], branchIds: [ids.branch] };
/** Kind names no other test uses; NumberSeries accepts only the four kinds, so tests cast. */
const freshKind = () => `t_${randomBytes(5).toString('hex')}` as NumberSeriesKind;

/** As the owner, inside the tree's scope: the organization tree once, then one series per test. */
async function asOwner(
  sql: (tx: Parameters<Parameters<typeof owner.$transaction>[0]>[0]) => Promise<unknown>,
) {
  await owner.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT set_config('app.organization_id', ${ids.org}, true), set_config('app.business_ids', ${ids.business}, true),
             set_config('app.branch_ids', ${ids.branch}, true)`;
    await sql(tx);
  });
}

const addSeries = (kind: string, branchId: string | null, nextValue: number, prefix: string) =>
  asOwner(
    (tx) => tx.$executeRaw`
      INSERT INTO number_series (business_id, branch_id, kind, prefix, next_value, width)
      VALUES (${ids.business}::uuid, ${branchId}::uuid, ${kind}, ${prefix}, ${nextValue}, 6)`,
  );

const next = (kind: NumberSeriesKind, branchId: string | null) =>
  tenantScope.run(scope, () => provided.numberSeries.next(kind, branchId));

beforeAll(async () => {
  await asOwner(async (tx) => {
    await tx.$executeRaw`INSERT INTO organization (id, name) VALUES (${ids.org}::uuid, 'NS Test Org')`;
    await tx.$executeRaw`
      INSERT INTO legal_entity (id, organization_id, name) VALUES (${ids.legal}::uuid, ${ids.org}::uuid, 'NS Legal')`;
    await tx.$executeRaw`
      INSERT INTO business (id, organization_id, legal_entity_id, name)
      VALUES (${ids.business}::uuid, ${ids.org}::uuid, ${ids.legal}::uuid, 'NS Business')`;
    await tx.$executeRaw`
      INSERT INTO branch (id, business_id, name, short_code) VALUES (${ids.branch}::uuid, ${ids.business}::uuid, 'NS Branch', 'NSB')`;
  });
});

afterAll(async () => {
  await Promise.all([close(), owner.$disconnect()]);
});

describe('NumberSeries over the real Query (ADR 0015)', () => {
  it('8. pads to the width with the prefix: RC-UTT-000001, then 000002', async () => {
    const kind = freshKind();
    await addSeries(kind, ids.branch, 1, 'RC-UTT-');
    expect(await next(kind, ids.branch)).toBe('RC-UTT-000001');
    expect(await next(kind, ids.branch)).toBe('RC-UTT-000002');
  });

  it('8. a value longer than the width prints in full: 1,000,000 at width 6 is RC-UTT-1000000', async () => {
    const kind = freshKind();
    await addSeries(kind, ids.branch, 1_000_000, 'RC-UTT-');
    expect(await next(kind, ids.branch)).toBe('RC-UTT-1000000');
  });

  it('10. null takes the business-wide series, a branch id the branch series', async () => {
    const kind = freshKind();
    await addSeries(kind, null, 41, 'C-');
    await addSeries(kind, ids.branch, 1, 'RC-UTT-');
    expect(await next(kind, null)).toBe('C-000041');
    expect(await next(kind, ids.branch)).toBe('RC-UTT-000001');
  });

  it('6. no series for the kind is 409 number_series.missing, and nothing is written', async () => {
    const error = await next(freshKind(), ids.branch).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('CONFLICT');
    expect((error as AppError).fields.map((field) => field.code)).toEqual(['number_series.missing']);
  });

  it('1. two parallel claims give two distinct, consecutive numbers', async () => {
    const kind = freshKind();
    await addSeries(kind, ids.branch, 1, 'RC-UTT-');
    const numbers = await Promise.all([next(kind, ids.branch), next(kind, ids.branch)]);
    expect(numbers.sort()).toEqual(['RC-UTT-000001', 'RC-UTT-000002']);
  });
});
