import { randomUUID } from 'node:crypto';
import { AppError } from '@erp/shared';
import { createDbClient, type DbClient, type DemoIds } from '@erp/dal';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Argon2PasswordHasher } from './Argon2PasswordHasher.js';
import { runDemoSeed, type DemoSeedPaths } from './demoSeed.js';
import { createManagers, DenyAllRoleSource } from './index.js';

/**
 * The demo seed's steps 4 and 5 (docs/demo-seed-spec.md sections 2, 4a and 7; ADR 0058 S2): opening stock and the
 * chassis units come in through IStockService.move (kind opening), dated the seed's opening day by the injected clock,
 * and the Showroom gets one opening journal, Dr inventory and Cr Opening balance equity, for the stock's value. The
 * Service centre holds no opening stock, so it gets no journal (a journal line can't be zero). Read back through the
 * migration owner (a superuser locally), filtered by this test's own business.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 20_000 });
/** 10:00 in Dhaka on 1 Oct 2026: the business date is 2026-10-01. The seed's clock, as the script builds it. */
const OPENING = new Date('2026-10-01T04:00:00Z');
const clock = { now: () => OPENING };
const { provided, tenantScope, close } = createManagers({
  databaseUrl: appUrl,
  version: 'test',
  dbPoolMax: 2,
  dbTxTimeoutMs: 60_000,
  roleSource: new DenyAllRoleSource(),
  clock,
});
const paths: DemoSeedPaths = { stock: provided.stock, tenantScope, clock };
const hasher = new Argon2PasswordHasher();

afterAll(async () => {
  await Promise.all([owner.$disconnect(), close()]);
});

const ids: DemoIds = {
  organizationId: randomUUID(),
  legalEntityId: randomUUID(),
  businessId: randomUUID(),
  branchIds: [randomUUID(), randomUUID()],
  ownerUserId: randomUUID(),
  ownerScopeId: randomUUID(),
};

const input = () => ({
  migrationDatabaseUrl: ownerUrl,
  appDatabaseUrl: appUrl,
  ownerEmail: `stock-${ids.businessId.slice(0, 8)}@example.com`,
  ownerPassword: `Pw-${randomUUID()}`,
  usersPassword: `Users-${randomUUID()}`,
  usersEmailDomain: `t-${ids.businessId.slice(0, 8)}.invalid`,
  nodeEnv: 'test',
});

const B = () => ids.businessId;
const counts = async () => {
  const [row] = await owner.$queryRaw<{ movements: number; journals: number; lines: number }[]>`
    SELECT (SELECT count(*)::int FROM stock_movement WHERE business_id = ${B()}::uuid) AS movements,
           (SELECT count(*)::int FROM journal WHERE business_id = ${B()}::uuid) AS journals,
           (SELECT count(*)::int FROM journal_line WHERE business_id = ${B()}::uuid) AS lines`;
  return row;
};
/** The stock side: on hand × cost over the demo's opening movements (one cost per product, so the average). */
const stockValue = async () => {
  const [row] = await owner.$queryRaw<{ value: string }[]>`
    SELECT coalesce(sum(qty_delta * unit_cost), 0)::numeric(18,2)::text AS value FROM stock_movement
     WHERE business_id = ${B()}::uuid AND source_type = 'demo_opening'`;
  return row?.value;
};

beforeAll(async () => {
  await runDemoSeed(input(), hasher, ids, paths);
}, 120_000);

describe('opening stock (spec section 2, invariants 3 and 7)', () => {
  it('comes in as opening movements at the Showroom, dated the opening day', async () => {
    const rows = await owner.$queryRaw<{ kind: string; branch: string; date: string; n: number }[]>`
      SELECT kind, branch_id::text AS branch, movement_date::text AS date, count(*)::int AS n FROM stock_movement
       WHERE business_id = ${B()}::uuid GROUP BY kind, branch_id, movement_date`;
    expect(rows).toEqual([
      { kind: 'opening', branch: ids.branchIds[0], date: '2026-10-01', n: expect.any(Number) },
    ]);
    expect(rows[0]?.n).toBeGreaterThanOrEqual(64);
  });

  it('stock_balance equals the sum of the movements for every product and branch', async () => {
    const drift = await owner.$queryRaw<{ product: string }[]>`
      SELECT m.product_id::text AS product FROM stock_movement m
       WHERE m.business_id = ${B()}::uuid GROUP BY m.product_id, m.branch_id
      HAVING sum(m.qty_delta) <> coalesce((SELECT sum(b.on_hand) FROM stock_balance b
                                            WHERE b.product_id = m.product_id AND b.branch_id = m.branch_id), 0)`;
    expect(drift).toEqual([]);
  });

  it('every chassis unit is in stock exactly once, at its own cost', async () => {
    const units = await owner.$queryRaw<{ in_ledger: string; same_cost: boolean }[]>`
      SELECT coalesce(sum(m.qty_delta), 0)::text AS in_ledger, bool_and(m.unit_cost = s.unit_cost) AS same_cost
        FROM serial_unit s LEFT JOIN stock_movement m ON m.serial_unit_id = s.id
       WHERE s.business_id = ${B()}::uuid GROUP BY s.id`;
    expect(units.length).toBeGreaterThanOrEqual(26);
    expect(units.every((u) => Number(u.in_ledger) === 1 && u.same_cost)).toBe(true);
  });
});

describe('the opening journal (spec section 4a)', () => {
  it('the Showroom has one, numbered from its journal series and dated the opening day; the Service centre none', async () => {
    const journals = await owner.$queryRaw<
      { branch: string; number: string; date: string; source: string }[]
    >`
      SELECT branch_id::text AS branch, number, journal_date::text AS date, source_type AS source FROM journal
       WHERE business_id = ${B()}::uuid`;
    expect(journals).toEqual([
      { branch: ids.branchIds[0], number: 'JV-SHW-000001', date: '2026-10-01', source: 'opening_stock' },
    ]);
  });

  it('is Dr inventory, Cr Opening balance equity, for the stock side, and balances', async () => {
    const value = await stockValue();
    const lines = await owner.$queryRaw<{ account: string; debit: string; credit: string }[]>`
      SELECT a.name AS account, l.debit::text, l.credit::text FROM journal_line l
        JOIN journal j ON j.id = l.journal_id JOIN account a ON a.id = l.account_id
       WHERE j.business_id = ${B()}::uuid AND j.source_type = 'opening_stock' ORDER BY l.line_no`;
    expect(lines).toEqual([
      { account: 'Inventory', debit: value, credit: '0.00' },
      { account: 'Opening balance equity', debit: '0.00', credit: value },
    ]);
    expect(Number(value)).toBeGreaterThan(0);
  });

  it("the ledger's inventory balance equals the stock side (dashboard stock value)", async () => {
    const [row] = await owner.$queryRaw<{ balance: string }[]>`
      SELECT coalesce(sum(l.debit - l.credit), 0)::numeric(18,2)::text AS balance FROM journal_line l
        JOIN account_role r ON r.account_id = l.account_id AND r.role = 'inventory'
       WHERE l.business_id = ${B()}::uuid`;
    expect(row?.balance).toBe(await stockValue());
  });
});

describe('a second run (spec section 1) and the guard', () => {
  it('writes nothing more: no movement, journal or line', async () => {
    const before = await counts();
    await runDemoSeed(input(), hasher, ids, paths);
    expect(await counts()).toEqual(before);
  });

  it('refuses an app database that is not on this machine, before writing anything', async () => {
    const error = await runDemoSeed(
      { ...input(), appDatabaseUrl: 'postgresql://erp_app:x@db.example.com:5432/erp' },
      hasher,
      { ...ids, organizationId: randomUUID(), businessId: randomUUID() },
      paths,
    ).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('FORBIDDEN');
  });
});
