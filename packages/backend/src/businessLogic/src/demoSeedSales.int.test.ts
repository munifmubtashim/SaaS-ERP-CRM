import { randomUUID } from 'node:crypto';
import { createDbClient, type DbClient, type DemoIds } from '@erp/dal';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Argon2PasswordHasher } from './Argon2PasswordHasher.js';
import { runDemoSeed, type DemoSeedPaths } from './demoSeed.js';
import { createManagers, DenyAllRoleSource } from './index.js';

/**
 * The demo seed's steps 6 and 7 and the spec's section 7 (docs/demo-seed-spec.md; ADR 0058 S3): 20 customers through
 * PartyManager, and 25 sales and their payments through SalesManager.postInvoice and recordPayment, each dated by the
 * seed's stepping clock. The books and the documents must agree from the first run. Read back through the migration
 * owner (a superuser locally), filtered by this test's own business.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 20_000 });
/** 10:00 in Dhaka on 1 Oct 2026: the opening day. The seed steps the clock forward from here. */
const OPENING = new Date('2026-10-01T04:00:00Z');
let current = OPENING;
const clock = { now: () => current, set: (at: Date) => (current = at) };
const { managers, provided, tenantScope, close } = createManagers({
  databaseUrl: appUrl,
  version: 'test',
  dbPoolMax: 2,
  dbTxTimeoutMs: 60_000,
  roleSource: new DenyAllRoleSource(),
  clock,
});
const paths: DemoSeedPaths = {
  stock: provided.stock,
  tenantScope,
  clock,
  party: managers.party,
  sales: managers.sales,
};
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
  ownerEmail: `sales-${ids.businessId.slice(0, 8)}@example.com`,
  ownerPassword: `Pw-${randomUUID()}`,
  usersPassword: `Users-${randomUUID()}`,
  usersEmailDomain: `t-${ids.businessId.slice(0, 8)}.invalid`,
  nodeEnv: 'test',
});
const B = () => ids.businessId;

interface InvoiceRow {
  id: string;
  party: string;
  walk_in: boolean;
  total: string;
  paid: string;
  date: string;
  bikes: number;
  fees: number;
  journal_ok: boolean;
}
const invoices = () =>
  owner.$queryRaw<InvoiceRow[]>`
    SELECT i.id::text, i.party_id::text AS party, p.is_walk_in AS walk_in, i.total::text,
           coalesce((SELECT sum(s.amount) FROM sales_payment s WHERE s.invoice_id = i.id AND s.status = 'posted'), 0)::numeric(18,2)::text AS paid,
           i.invoice_date::text AS date,
           (SELECT count(*)::int FROM invoice_line l WHERE l.invoice_id = i.id AND l.serial_unit_id IS NOT NULL) AS bikes,
           (SELECT count(*)::int FROM invoice_line l WHERE l.invoice_id = i.id AND l.is_pass_through) AS fees,
           EXISTS (SELECT 1 FROM journal j WHERE j.id = i.journal_id) AS journal_ok
      FROM invoice i JOIN party p ON p.id = i.party_id
     WHERE i.business_id = ${B()}::uuid ORDER BY i.invoice_date, i.number`;

const counts = async () => {
  const [row] = await owner.$queryRaw<Record<string, number>[]>`
    SELECT (SELECT count(*)::int FROM party WHERE business_id = ${B()}::uuid) AS parties,
           (SELECT count(*)::int FROM invoice WHERE business_id = ${B()}::uuid) AS invoices,
           (SELECT count(*)::int FROM sales_payment WHERE business_id = ${B()}::uuid) AS payments,
           (SELECT count(*)::int FROM journal WHERE business_id = ${B()}::uuid) AS journals,
           (SELECT count(*)::int FROM stock_movement WHERE business_id = ${B()}::uuid) AS movements`;
  return row;
};

beforeAll(async () => {
  await runDemoSeed(input(), hasher, ids, paths);
}, 240_000);

describe('customers (spec section 2, decisions 3 and 4)', () => {
  it('20 customers with the fake sequential phones, plus the one walk-in party', async () => {
    const rows = await owner.$queryRaw<
      { phone: string; walk_in: boolean; address: string | null; code: string }[]
    >`
      SELECT phone_e164 AS phone, is_walk_in AS walk_in, address, code FROM party
       WHERE business_id = ${B()}::uuid ORDER BY phone_e164`;
    const customers = rows.filter((r) => !r.walk_in);
    expect(rows.filter((r) => r.walk_in)).toHaveLength(1);
    expect(customers.map((c) => c.phone)).toEqual(
      Array.from({ length: 20 }, (_, i) => `+88017000000${String(i + 1).padStart(2, '0')}`),
    );
    for (const c of customers) {
      expect(c.code).toMatch(/^C-\d{6}$/);
      expect(c.address).toMatch(/^[^0-9]+, [^0-9]+, [^0-9]+$/); // village, upazila, district; no house number
    }
  });
});

describe('sales (spec section 2)', () => {
  let rows: InvoiceRow[];
  beforeAll(async () => {
    rows = await invoices();
  });

  it('25 sales: 18 paid in full, 4 partly paid, 3 fully due', () => {
    expect(rows).toHaveLength(25);
    const state = (r: InvoiceRow) => (r.paid === r.total ? 'paid' : r.paid === '0.00' ? 'due' : 'partly');
    const tally = rows.reduce<Record<string, number>>(
      (acc, r) => ({ ...acc, [state(r)]: (acc[state(r)] ?? 0) + 1 }),
      {},
    );
    expect(tally).toEqual({ paid: 18, partly: 4, due: 3 });
  });

  it('5 bike sales, 3 of them with a registration fee', () => {
    expect(rows.filter((r) => r.bikes > 0)).toHaveLength(5);
    expect(rows.filter((r) => r.fees > 0)).toHaveLength(3);
    expect(rows.filter((r) => r.fees > 0).every((r) => r.bikes > 0)).toBe(true);
  });

  it('a due always names a real customer, never the walk-in party', () => {
    expect(rows.filter((r) => r.walk_in && r.paid !== r.total)).toEqual([]);
  });

  it('are dated over the weeks after the opening day, before today', () => {
    const dates = new Set(rows.map((r) => r.date));
    expect(dates.size).toBeGreaterThanOrEqual(15);
    for (const d of dates) {
      expect(d > '2026-10-01').toBe(true);
      expect(d <= '2026-11-05').toBe(true);
    }
  });

  it('every sale has its journal (invariant 4)', () => {
    expect(rows.every((r) => r.journal_ok)).toBe(true);
  });
});

describe('payments (spec section 2)', () => {
  it('cash and bKash only; bKash with a transaction id; every payment has its journal, dated like it', async () => {
    const rows = await owner.$queryRaw<
      { method: string; ref: string | null; journal_date: string; received: string }[]
    >`
      SELECT s.method, s.external_ref AS ref, j.journal_date::text AS journal_date,
             (s.received_at AT TIME ZONE 'Asia/Dhaka')::date::text AS received
        FROM sales_payment s JOIN journal j ON j.id = s.journal_id WHERE s.business_id = ${B()}::uuid`;
    expect(rows.length).toBeGreaterThanOrEqual(22);
    expect(new Set(rows.map((r) => r.method))).toEqual(new Set(['cash', 'bkash']));
    for (const r of rows) {
      if (r.method === 'bkash') expect(r.ref).toMatch(/^[A-Z0-9]{8,10}$/);
      expect(r.journal_date).toBe(r.received);
    }
  });

  it('some partly paid sales get a later payment through recordPayment (POST /v1/payments)', async () => {
    const [row] = await owner.$queryRaw<{ later: number }[]>`
      SELECT count(*)::int AS later FROM sales_payment s JOIN invoice i ON i.id = s.invoice_id
       WHERE s.business_id = ${B()}::uuid AND (s.received_at AT TIME ZONE 'Asia/Dhaka')::date > i.invoice_date`;
    expect(row?.later).toBeGreaterThanOrEqual(2);
  });
});

describe('the books agree (spec section 7)', () => {
  it('the trial balance balances', async () => {
    const [row] = await owner.$queryRaw<{ debit: string; credit: string }[]>`
      SELECT sum(debit)::text AS debit, sum(credit)::text AS credit FROM journal_line WHERE business_id = ${B()}::uuid`;
    expect(row?.debit).toBe(row?.credit);
  });

  it('stock_balance equals the sum of the movements, after the sales', async () => {
    const drift = await owner.$queryRaw<{ product: string }[]>`
      SELECT m.product_id::text AS product FROM stock_movement m
       WHERE m.business_id = ${B()}::uuid GROUP BY m.product_id, m.branch_id
      HAVING sum(m.qty_delta) <> coalesce((SELECT sum(b.on_hand) FROM stock_balance b
                                            WHERE b.product_id = m.product_id AND b.branch_id = m.branch_id), 0)`;
    expect(drift).toEqual([]);
  });

  it("the ledger's inventory equals the stock side, after the sales", async () => {
    const [row] = await owner.$queryRaw<{ ledger: string; stock: string }[]>`
      SELECT (SELECT coalesce(sum(l.debit - l.credit), 0) FROM journal_line l
                JOIN account_role r ON r.account_id = l.account_id AND r.role = 'inventory'
               WHERE l.business_id = ${B()}::uuid)::numeric(18,2)::text AS ledger,
             (SELECT coalesce(sum(qty_delta * unit_cost), 0) FROM stock_movement
               WHERE business_id = ${B()}::uuid)::numeric(18,2)::text AS stock`;
    expect(row?.ledger).toBe(row?.stock);
  });

  it("each customer's due from the ledger equals the sum of their open invoices' dues (ADR 0026 section 3)", async () => {
    const parties = await owner.$queryRaw<{ id: string; documents: string }[]>`
      SELECT p.id::text, coalesce(sum(i.total - coalesce((SELECT sum(s.amount) FROM sales_payment s
                                                         WHERE s.invoice_id = i.id AND s.status = 'posted'), 0)), 0)
                         ::numeric(18,2)::text AS documents
        FROM party p LEFT JOIN invoice i ON i.party_id = p.id
       WHERE p.business_id = ${B()}::uuid GROUP BY p.id`;
    const scope = {
      organizationId: ids.organizationId,
      businessIds: [ids.businessId],
      branchIds: ids.branchIds,
      branchId: ids.branchIds[0],
    };
    for (const p of parties) {
      const balances = await tenantScope.run(scope, () => provided.partyLedger.balances(p.id), {
        readOnly: true,
      });
      expect(balances.receivable).toBe(p.documents);
    }
  });
});

describe('a second run (spec section 1)', () => {
  it('writes nothing more', async () => {
    const before = await counts();
    await runDemoSeed(input(), hasher, ids, paths);
    expect(await counts()).toEqual(before);
  });
});
