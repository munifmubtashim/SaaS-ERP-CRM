import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { createTree, setScope, type Tree } from './support/orgTree.js';
import { addParty } from './support/party.js';
import { sourceIsInMigration, tablePrivileges } from './support/tableRules.js';

/**
 * Migration report_views (ADR 0023, amended by Munif on 24 Nov): the security_invoker view report_owner_dashboard,
 * one row per business with four figures from the ledger only (invariant 1, spec C-05):
 * - dues: the receivable balance;
 * - collections today: payment debits less payment-reversal credits on cash, bank, mobile money and card clearing,
 *   dated today in Dhaka (a payment voided the same day nets to zero);
 * - revenue month to date: sales and service revenue from the 1st of this Dhaka month to today;
 * - stock value: the inventory account's balance (hidden from callers without product.cost.view by the Manager).
 * ADR 0023 tests 1, 5, 7 and 8 here; the route, the roles and the read-only transaction are tested in the api.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 2, txTimeoutMs: 10_000 });
const appSingle: DbClient = createDbClient(appUrl, { poolMax: 1, txTimeoutMs: 10_000 });
type Tx = Parameters<Parameters<DbClient['$transaction']>[0]>[0];

const ROLES = {
  cash: 'asset',
  mobile_money: 'asset',
  receivable: 'asset',
  inventory: 'asset',
  sales_revenue: 'income',
  service_revenue: 'income',
  pass_through_payable: 'liability',
  cost_of_goods_sold: 'expense',
} as const;
type Role = keyof typeof ROLES;

interface Books {
  tree: Tree;
  account: Record<Role | 'opening', string>;
  customer: string;
}

const inScope = <T>(db: DbClient, tree: Tree, fn: (tx: Tx) => Promise<T>) =>
  db.$transaction(async (tx) => {
    await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId]);
    return fn(tx);
  });

async function newBooks(): Promise<Books> {
  const tree = await createTree(owner);
  const account = {} as Record<Role | 'opening', string>;
  await inScope(owner, tree, async (tx) => {
    for (const [role, type] of [...Object.entries(ROLES), ['opening', 'equity']] as [
      Role | 'opening',
      string,
    ][]) {
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO account (business_id, code, name, type)
        VALUES (${tree.businessId}::uuid, ${`A-${role}`}, ${`Account ${role}`}, ${type}) RETURNING id::text`;
      account[role] = row?.id ?? '';
      if (role !== 'opening') {
        await tx.$executeRaw`INSERT INTO account_role (business_id, role, account_id)
          VALUES (${tree.businessId}::uuid, ${role}, ${account[role]}::uuid)`;
      }
    }
  });
  return { tree, account, customer: await addParty(owner, tree) };
}

interface Line {
  account: Role | 'opening';
  debit?: string;
  credit?: string;
  party?: boolean;
}

/** Posts one journal as the owner, dated `days` from today in Dhaka; returns its id. */
async function post(
  books: Books,
  lines: Line[],
  f: { sourceType?: string; days?: number; reversalOf?: string } = {},
): Promise<string> {
  return inScope(owner, books.tree, async (tx) => {
    const sourceId = f.reversalOf ?? randomUUID();
    const [journal] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO journal (business_id, branch_id, number, journal_date, source_type, source_id, memo, reversal_of)
      VALUES (${books.tree.businessId}::uuid, ${books.tree.branchId}::uuid, ${`JV-${randomBytes(5).toString('hex')}`},
              (now() AT TIME ZONE 'Asia/Dhaka')::date + ${f.days ?? 0}::int,
              ${f.reversalOf ? 'reversal' : (f.sourceType ?? 'sales_invoice')}, ${sourceId}::uuid, 'Report test',
              ${f.reversalOf ?? null}::uuid)
      RETURNING id::text`;
    let n = 0;
    for (const line of lines) {
      n += 1;
      await tx.$executeRaw`
        INSERT INTO journal_line (business_id, journal_id, line_no, account_id, debit, credit, party_id)
        VALUES (${books.tree.businessId}::uuid, ${journal?.id}::uuid, ${n}, ${books.account[line.account]}::uuid,
                ${line.debit ?? '0'}::numeric, ${line.credit ?? '0'}::numeric,
                ${line.party ? books.customer : null}::uuid)`;
    }
    return journal?.id ?? '';
  });
}

const payment = (books: Books, role: Role, amount: string, days = 0) =>
  post(
    books,
    [
      { account: role, debit: amount },
      { account: 'receivable', credit: amount, party: true },
    ],
    { sourceType: 'sales_payment', days },
  );

const voidOf = (books: Books, journalId: string, role: Role, amount: string, days = 0) =>
  post(
    books,
    [
      { account: role, credit: amount },
      { account: 'receivable', debit: amount, party: true },
    ],
    { reversalOf: journalId, days },
  );

interface Row {
  business_id: string;
  dues: string;
  collections_today: string;
  revenue_month: string;
  stock_value: string;
}

const read = (books: Books, db: DbClient = app) =>
  inScope(
    db,
    books.tree,
    (tx) => tx.$queryRaw<Row[]>`
      SELECT business_id::text, dues::text, collections_today::text, revenue_month::text, stock_value::text
        FROM report_owner_dashboard`,
  );

let books: Books;
let other: Books;

beforeAll(async () => {
  [books, other] = await Promise.all([newBooks(), newBooks()]);
  // Opening stock in the books: Dr inventory 5,000.00 / Cr opening equity.
  await post(books, [
    { account: 'inventory', debit: '5000.00' },
    { account: 'opening', credit: '5000.00' },
  ]);
  // A sale today: ৳3,000.00 on credit, cost ৳400.00.
  await post(books, [
    { account: 'receivable', debit: '3000.00', party: true },
    { account: 'sales_revenue', credit: '3000.00' },
    { account: 'cost_of_goods_sold', debit: '400.00' },
    { account: 'inventory', credit: '400.00' },
  ]);
  // Service revenue today, paid in cash at once: ৳600.00.
  await post(books, [
    { account: 'receivable', debit: '600.00', party: true },
    { account: 'service_revenue', credit: '600.00' },
  ]);
  await payment(books, 'cash', '600.00');
  // A registration fee: pass-through money, never revenue.
  await post(books, [
    { account: 'receivable', debit: '18500.00', party: true },
    { account: 'pass_through_payable', credit: '18500.00' },
  ]);
  await payment(books, 'cash', '18500.00');
  // A payment of ৳1,000.00 today.
  await payment(books, 'cash', '1000.00');
  // Farhan's example on #61: ৳50,000.00 by mobile money, voided the same day.
  const voided = await payment(books, 'mobile_money', '50000.00');
  await voidOf(books, voided, 'mobile_money', '50000.00');
  // Last month's sale (outside month to date) and yesterday's payment (outside today).
  await post(
    books,
    [
      { account: 'receivable', debit: '7000.00', party: true },
      { account: 'sales_revenue', credit: '7000.00' },
    ],
    { days: -40 },
  );
  await payment(books, 'cash', '2000.00', -1);
  // Another business's activity, which X must never see.
  await post(other, [
    { account: 'receivable', debit: '99999.00', party: true },
    { account: 'sales_revenue', credit: '99999.00' },
  ]);
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect(), appSingle.$disconnect()]);
});

describe('ADR 0023 test 1 (amended): the figures equal the ledger', () => {
  it('dues, collections today (voids netted), revenue month to date (no fee, no last month) and stock value', async () => {
    expect(await read(books)).toEqual([
      {
        business_id: books.tree.businessId,
        // 3,000 + 600 + 18,500 + 7,000 owed; 600 + 18,500 + 1,000 + 2,000 paid; the voided 50,000 nets to zero.
        dues: '7000.00',
        // Today: 600 + 18,500 + 1,000; the 50,000 voided today nets to zero; yesterday's 2,000 is not today.
        collections_today: '20100.00',
        // Sales 3,000 + service 600; never the 18,500 fee; last month's 7,000 is outside the month.
        revenue_month: '3600.00',
        // Opening 5,000 less the 400 sold.
        stock_value: '4600.00',
      },
    ]);
  });

  it('a payment voided on a later day stays in its own day and lowers the day of the void', async () => {
    const b = await newBooks();
    const yesterday = await payment(b, 'mobile_money', '50000.00', -1);
    await voidOf(b, yesterday, 'mobile_money', '50000.00');
    await payment(b, 'cash', '8000.00');
    expect((await read(b))[0]?.collections_today).toBe('-42000.00');
  });
});

describe('ADR 0023 tests 3, 5, 7 and 8: the view is safe', () => {
  it("reads with the caller's RLS (security_invoker) and filters on organization and business; erp_app has SELECT only", async () => {
    const [view] = await owner.$queryRaw<{ options: string[] }[]>`
      SELECT coalesce(reloptions, '{}') AS options FROM pg_class WHERE relname = 'report_owner_dashboard'`;
    expect(view?.options).toContain('security_invoker=true');
    expect(await tablePrivileges(owner, 'report_owner_dashboard', 'erp_app')).toEqual(['SELECT']);
  });

  it("a scope of business X sees only X's row: Y's figures never appear", async () => {
    const rows = await read(books);
    expect(rows.map((r) => r.business_id)).toEqual([books.tree.businessId]);
    expect((await read(other))[0]?.revenue_month).toBe('99999.00');
  });

  it('read outside a scope, the view raises (the RLS functions raise when unset); a pooled connection resets', async () => {
    expect(await read(books, appSingle)).toHaveLength(1);
    await expect(
      appSingle.$transaction((tx) => tx.$queryRaw`SELECT * FROM report_owner_dashboard`),
    ).rejects.toThrow(/tenant scope not set/);
  });

  it('every figure is numeric(18,2) text, never a float', async () => {
    const [row] = await read(books);
    for (const value of [row?.dues, row?.collections_today, row?.revenue_month, row?.stock_value]) {
      expect(value).toMatch(/^-?\d+\.\d{2}$/);
    }
  });

  it('dal/sql/views/report.sql appears, unchanged, in the report_views migration', () => {
    expect(sourceIsInMigration('sql/views/report.sql', 'report_views')).toBe(true);
  });
});
