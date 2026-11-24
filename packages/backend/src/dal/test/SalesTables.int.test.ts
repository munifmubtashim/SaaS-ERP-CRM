import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { addBranch, createTree, setScope, type Tree } from './support/orgTree.js';
import {
  policies,
  rlsState,
  sourceIsInMigration,
  tablePrivileges,
  truncateRefusers,
} from './support/tableRules.js';

/**
 * Migrations sales_invoice (ADR 0022 section 1, amended: customer_name snapshot, Munif 24 Nov) and sales_payment
 * (ADR 0026 section 1), tested in SQL: invoice, invoice_line and sales_payment. Every row carries its journal (invariant
 * 4); posted is permanent apart from posted → voided; money numeric(18,2) and never negative; one bKash transaction id
 * once; tenancy on every table; and the known gaps (the party check, void and reissue), recorded as tests.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 4, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 4, txTimeoutMs: 15_000 });
const appSingle: DbClient = createDbClient(appUrl, { poolMax: 1, txTimeoutMs: 15_000 });

type Tx = Parameters<Parameters<DbClient['$transaction']>[0]>[0];
const TABLES = ['invoice', 'invoice_line', 'sales_payment'] as const;

let x: Tree;
let y: Tree;
let branchB: string;
const accounts = new Map<string, { debit: string; credit: string }>();
let partX: string;
let bikeX: string;
let partY: string;

function inScope<T>(db: DbClient, tree: Tree, fn: (tx: Tx) => Promise<T>, branchIds = [tree.branchId]) {
  return db.$transaction(async (tx) => {
    await setScope(tx, tree.organizationId, [tree.businessId], branchIds);
    return fn(tx);
  });
}

async function addAccounts(tree: Tree) {
  const [debit, credit] = await inScope(owner, tree, async (tx) => {
    const ids: string[] = [];
    for (const type of ['asset', 'income']) {
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO account (business_id, code, name, type)
        VALUES (${tree.businessId}::uuid, ${`A-${randomBytes(4).toString('hex')}`}, 'Sales test', ${type})
        RETURNING id::text`;
      if (!row) throw new Error('no account');
      ids.push(row.id);
    }
    return ids;
  });
  accounts.set(tree.businessId, { debit: debit ?? '', credit: credit ?? '' });
}

/** A balanced journal in `tree` at `branchId`, as the owner: what an invoice or a payment points at. */
async function journal(tree: Tree, branchId = tree.branchId): Promise<string> {
  const acc = accounts.get(tree.businessId);
  if (!acc) throw new Error('no accounts');
  return inScope(
    owner,
    tree,
    async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO journal (business_id, branch_id, number, journal_date, source_type, source_id, memo)
        VALUES (${tree.businessId}::uuid, ${branchId}::uuid, ${`JV-${randomBytes(5).toString('hex')}`}, CURRENT_DATE,
                'sales_invoice', ${randomUUID()}::uuid, 'Sale')
        RETURNING id::text`;
      if (!row) throw new Error('no journal');
      await tx.$executeRaw`
        INSERT INTO journal_line (business_id, journal_id, line_no, account_id, debit, credit) VALUES
          (${tree.businessId}::uuid, ${row.id}::uuid, 1, ${acc.debit}::uuid, 100.00, 0),
          (${tree.businessId}::uuid, ${row.id}::uuid, 2, ${acc.credit}::uuid, 0, 100.00)`;
      return row.id;
    },
    [tree.branchId, branchId],
  );
}

async function addProduct(tree: Tree, tracking: 'quantity' | 'serial'): Promise<string> {
  return inScope(owner, tree, async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO product (business_id, code, name, unit, tracking, sell_price)
      VALUES (${tree.businessId}::uuid, ${`P-${randomBytes(5).toString('hex')}`}, 'Brake pad set', 'pcs', ${tracking},
              1000.00)
      RETURNING id::text`;
    if (!row) throw new Error('no product');
    return row.id;
  });
}

async function addUnit(tree: Tree, productId: string): Promise<string> {
  return inScope(owner, tree, async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO serial_unit (business_id, branch_id, product_id, serial_no, unit_cost)
      VALUES (${tree.businessId}::uuid, ${tree.branchId}::uuid, ${productId}::uuid,
              ${`CH-${randomBytes(5).toString('hex')}`}, 150000.00)
      RETURNING id::text`;
    if (!row) throw new Error('no unit');
    return row.id;
  });
}

interface InvoiceFields {
  branchId?: string;
  businessId?: string;
  journalId?: string | null;
  subtotal?: string;
  discount?: string;
  total?: string;
  status?: string;
  number?: string;
  customerName?: string | null;
}

/** Inserts an invoice on `db` in `tree`'s scope (plus `branchIds`); a journal is made for it unless given. */
async function addInvoice(db: DbClient, tree: Tree, f: InvoiceFields = {}, branchIds?: string[]) {
  const branchId = f.branchId ?? tree.branchId;
  const journalId = f.journalId === undefined ? await journal(tree, branchId) : f.journalId;
  return inScope(
    db,
    tree,
    async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO invoice (business_id, branch_id, number, party_id, customer_name, invoice_date, subtotal,
                             discount, total, status, journal_id, sold_by)
        VALUES (${f.businessId ?? tree.businessId}::uuid, ${branchId}::uuid,
                ${f.number ?? `INV-${randomBytes(5).toString('hex')}`}, ${randomUUID()}::uuid,
                ${f.customerName === undefined ? 'Rahim Uddin' : f.customerName}, CURRENT_DATE,
                ${f.subtotal ?? '2300.00'}::numeric, ${f.discount ?? '0.00'}::numeric, ${f.total ?? '2300.00'}::numeric,
                ${f.status ?? 'posted'}, ${journalId}::uuid, ${randomUUID()}::uuid)
        RETURNING id::text`;
      if (!row) throw new Error('no invoice');
      return row.id;
    },
    branchIds ?? [tree.branchId, branchId],
  );
}

interface LineFields {
  productId?: string;
  serialUnitId?: string | null;
  qty?: string;
  unitPrice?: string;
  lineTotal?: string;
  costAmount?: string;
  lineNo?: number;
}

async function addLine(db: DbClient, tree: Tree, invoiceId: string, f: LineFields = {}) {
  return inScope(db, tree, async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO invoice_line (business_id, invoice_id, line_no, product_id, serial_unit_id, qty, unit_price,
                                line_total, cost_amount)
      VALUES (${tree.businessId}::uuid, ${invoiceId}::uuid, ${f.lineNo ?? 1}, ${f.productId ?? partX}::uuid,
              ${f.serialUnitId ?? null}::uuid, ${f.qty ?? '2.000'}::numeric, ${f.unitPrice ?? '1000.00'}::numeric,
              ${f.lineTotal ?? '2000.00'}::numeric, ${f.costAmount ?? '1400.00'}::numeric)
      RETURNING id::text`;
    if (!row) throw new Error('no line');
    return row.id;
  });
}

interface PaymentFields {
  invoiceId?: string | null;
  method?: string;
  externalRef?: string | null;
  amount?: string;
  status?: string;
  journalId?: string | null;
}

async function addPayment(db: DbClient, tree: Tree, f: PaymentFields = {}) {
  const journalId = f.journalId === undefined ? await journal(tree) : f.journalId;
  return inScope(db, tree, async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO sales_payment (business_id, branch_id, receipt_number, party_id, invoice_id, method, external_ref,
                                 amount, status, journal_id)
      VALUES (${tree.businessId}::uuid, ${tree.branchId}::uuid, ${`R-${randomBytes(5).toString('hex')}`},
              ${randomUUID()}::uuid, ${f.invoiceId ?? null}::uuid, ${f.method ?? 'cash'},
              ${f.externalRef ?? null}, ${f.amount ?? '1000.00'}::numeric, ${f.status ?? 'posted'},
              ${journalId}::uuid)
      RETURNING id::text`;
    if (!row) throw new Error('no payment');
    return row.id;
  });
}

beforeAll(async () => {
  [x, y] = await Promise.all([createTree(owner), createTree(owner)]);
  branchB = await addBranch(owner, x.organizationId, x.businessId, 'BRB');
  await Promise.all([addAccounts(x), addAccounts(y)]);
  [partX, bikeX, partY] = await Promise.all([
    addProduct(x, 'quantity'),
    addProduct(x, 'serial'),
    addProduct(y, 'quantity'),
  ]);
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect(), appSingle.$disconnect()]);
});

describe('the three tables follow the tenant-table rules', () => {
  it.each(TABLES)(
    '%s: RLS enabled and forced; no DELETE or ALL policy; TRUNCATE refused by a trigger',
    async (t) => {
      expect(await rlsState(owner, t)).toEqual([{ enabled: true, forced: true }]);
      const rows = await policies(owner, t);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((p) => p.cmd !== 'DELETE' && p.cmd !== 'ALL')).toBe(true);
      expect(await truncateRefusers(owner, t)).toEqual([`${t}_no_truncate`]);
    },
  );

  it('erp_app holds table-level SELECT and INSERT only (UPDATE only on the status and void columns)', async () => {
    for (const t of TABLES) expect(await tablePrivileges(owner, t, 'erp_app')).toEqual(['INSERT', 'SELECT']);
  });

  it('dal/sql/rls/sales_invoice.sql and sales_payment.sql appear, unchanged, in their migrations', () => {
    expect(sourceIsInMigration('sql/rls/sales_invoice.sql', 'sales_invoice')).toBe(true);
    expect(sourceIsInMigration('sql/rls/sales_payment.sql', 'sales_payment')).toBe(true);
  });
});

describe('ADR 0022 section 1: what an invoice must be', () => {
  it('a posted invoice with its journal, a customer name snapshot and a line commits as erp_app', async () => {
    const id = await addInvoice(app, x);
    await addLine(app, x, id);
    const [row] = await inScope(
      owner,
      x,
      (tx) => tx.$queryRaw<{ customer_name: string; total: string; status: string }[]>`
        SELECT customer_name, total::text, status FROM invoice WHERE id = ${id}::uuid`,
    );
    expect(row).toEqual({ customer_name: 'Rahim Uddin', total: '2300.00', status: 'posted' });
  });

  it('a walk-in sale has no customer name', async () => {
    await expect(addInvoice(app, x, { customerName: null })).resolves.toMatch(/^[0-9a-f-]{36}$/);
  });

  it('no invoice without its journal (invariant 4): journal_id is NOT NULL', async () => {
    await expect(addInvoice(owner, x, { journalId: null })).rejects.toThrow(/null value|not-null/i);
  });

  it("an invoice can't point at another business's journal (composite key)", async () => {
    await expect(addInvoice(owner, x, { journalId: await journal(y) })).rejects.toThrow(/foreign key/i);
  });

  it('one invoice per journal, and the number is unique per business', async () => {
    const journalId = await journal(x);
    await addInvoice(owner, x, { journalId });
    await expect(addInvoice(owner, x, { journalId })).rejects.toThrow(/unique|duplicate/i);
    const number = `INV-${randomBytes(5).toString('hex')}`;
    await addInvoice(owner, x, { number });
    await expect(addInvoice(owner, x, { number })).rejects.toThrow(/unique|duplicate/i);
  });

  it.each([
    ['total is not subtotal minus discount', { subtotal: '2300.00', discount: '100.00', total: '2300.00' }],
    ['a discount above the subtotal', { subtotal: '100.00', discount: '200.00', total: '-100.00' }],
    ['a negative subtotal', { subtotal: '-1.00', discount: '0.00', total: '-1.00' }],
    ['an unknown status', { status: 'draft' }],
  ])('%s is refused', async (_case, fields) => {
    await expect(addInvoice(owner, x, fields)).rejects.toThrow(/check/i);
  });

  it('amounts are numeric(18,2)', async () => {
    const id = await addInvoice(owner, x, { subtotal: '10.005', discount: '0', total: '10.01' });
    const [row] = await inScope(
      owner,
      x,
      (tx) => tx.$queryRaw<{ subtotal: string }[]>`SELECT subtotal::text FROM invoice WHERE id = ${id}::uuid`,
    );
    expect(row?.subtotal).toBe('10.01');
  });
});

describe('ADR 0022 section 1: invoice lines', () => {
  it.each([
    ['a zero quantity', { qty: '0' }],
    ['a negative quantity', { qty: '-1.000' }],
    ['a negative price', { unitPrice: '-1.00' }],
    ['a negative line total', { lineTotal: '-1.00' }],
    ['a negative cost', { costAmount: '-1.00' }],
  ])('%s is refused', async (_case, fields) => {
    const id = await addInvoice(owner, x);
    await expect(addLine(owner, x, id, fields)).rejects.toThrow(/check/i);
  });

  it('a serial unit is sold one at a time (qty = 1)', async () => {
    const id = await addInvoice(owner, x);
    const unit = await addUnit(x, bikeX);
    await expect(
      addLine(owner, x, id, { productId: bikeX, serialUnitId: unit, qty: '2.000' }),
    ).rejects.toThrow(/check/i);
    await expect(
      addLine(owner, x, id, { productId: bikeX, serialUnitId: unit, qty: '1.000' }),
    ).resolves.toMatch(/^[0-9a-f-]{36}$/);
  });

  it("a line can't sell another business's product (composite key)", async () => {
    const id = await addInvoice(owner, x);
    await expect(addLine(owner, x, id, { productId: partY })).rejects.toThrow(/foreign key/i);
  });

  it('line numbers are unique per invoice', async () => {
    const id = await addInvoice(owner, x);
    await addLine(owner, x, id, { lineNo: 1 });
    await expect(addLine(owner, x, id, { lineNo: 1 })).rejects.toThrow(/unique|duplicate/i);
  });
});

describe('posted is permanent (ADR 0022 section 1; invariant 2)', () => {
  it('erp_app can change nothing on an invoice but its status, and only posted → voided', async () => {
    const id = await addInvoice(app, x);
    await expect(
      inScope(app, x, (tx) => tx.$executeRaw`UPDATE invoice SET total = 1.00 WHERE id = ${id}::uuid`),
    ).rejects.toThrow(/permission denied/i);
    await inScope(
      app,
      x,
      (tx) =>
        tx.$executeRaw`UPDATE invoice SET status = 'voided', version = version + 1 WHERE id = ${id}::uuid`,
    );
    await expect(
      inScope(app, x, (tx) => tx.$executeRaw`UPDATE invoice SET status = 'posted' WHERE id = ${id}::uuid`),
    ).rejects.toThrow(/posted → voided|only change/i);
  });

  it('the owner, who bypasses RLS in dev, hits the trigger on any other change or a DELETE', async () => {
    const id = await addInvoice(owner, x);
    await expect(
      inScope(
        owner,
        x,
        (tx) => tx.$executeRaw`UPDATE invoice SET total = 1.00, subtotal = 1.00 WHERE id = ${id}::uuid`,
      ),
    ).rejects.toThrow(/posted → voided|only change/i);
    await expect(
      inScope(owner, x, (tx) => tx.$executeRaw`DELETE FROM invoice WHERE id = ${id}::uuid`),
    ).rejects.toThrow(/never deleted/i);
    await expect(
      inScope(app, x, (tx) => tx.$executeRaw`DELETE FROM invoice WHERE id = ${id}::uuid`),
    ).rejects.toThrow(/permission denied/i);
  });

  it('invoice lines are append-only for every role', async () => {
    const id = await addInvoice(owner, x);
    const line = await addLine(owner, x, id);
    for (const db of [app, owner]) {
      await expect(
        inScope(db, x, (tx) => tx.$executeRaw`UPDATE invoice_line SET qty = 1 WHERE id = ${line}::uuid`),
      ).rejects.toThrow(/permission denied|never updated or deleted/i);
      await expect(
        inScope(db, x, (tx) => tx.$executeRaw`DELETE FROM invoice_line WHERE id = ${line}::uuid`),
      ).rejects.toThrow(/permission denied|never updated or deleted/i);
    }
  });
});

describe('ADR 0026 section 1: sales payments', () => {
  it('a cash payment against an invoice commits as erp_app, with no transaction id', async () => {
    const invoiceId = await addInvoice(app, x);
    await expect(addPayment(app, x, { invoiceId })).resolves.toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([
    ['an unknown method', { method: 'due' }],
    ['bKash without its transaction id', { method: 'bkash', externalRef: null }],
    ['a zero amount', { amount: '0.00' }],
    ['a negative amount', { amount: '-5.00' }],
    ['a transaction id over 64 characters', { method: 'bkash', externalRef: 'T'.repeat(65) }],
    ['an unknown status', { status: 'pending' }],
  ])('%s is refused', async (_case, fields) => {
    await expect(addPayment(owner, x, fields)).rejects.toThrow(/check/i);
  });

  it('no payment without its journal: journal_id is NOT NULL', async () => {
    await expect(addPayment(owner, x, { journalId: null })).rejects.toThrow(/null value|not-null/i);
  });

  it('the same bKash transaction id is taken once while posted; once voided it can be entered again', async () => {
    const ref = `TX${randomBytes(5).toString('hex')}`;
    const first = await addPayment(app, x, { method: 'bkash', externalRef: ref });
    await expect(addPayment(app, x, { method: 'bkash', externalRef: ref })).rejects.toThrow(
      /unique|duplicate/i,
    );
    const voidJournal = await journal(x);
    await inScope(
      app,
      x,
      (tx) => tx.$executeRaw`
        UPDATE sales_payment SET status = 'voided', voided_journal_id = ${voidJournal}::uuid, void_reason = 'Wrong amount',
               voided_by = ${randomUUID()}::uuid, voided_at = now(), version = version + 1
         WHERE id = ${first}::uuid`,
    );
    await expect(addPayment(app, x, { method: 'bkash', externalRef: ref })).resolves.toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it('a void must carry its reversal journal, and a voided payment stays voided', async () => {
    const id = await addPayment(owner, x);
    await expect(
      inScope(
        owner,
        x,
        (tx) => tx.$executeRaw`UPDATE sales_payment SET status = 'voided' WHERE id = ${id}::uuid`,
      ),
    ).rejects.toThrow(/check/i);
  });

  it('erp_app can change nothing but the void columns; the owner hits the trigger; nothing is deleted', async () => {
    const id = await addPayment(owner, x);
    await expect(
      inScope(app, x, (tx) => tx.$executeRaw`UPDATE sales_payment SET amount = 1.00 WHERE id = ${id}::uuid`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      inScope(
        owner,
        x,
        (tx) => tx.$executeRaw`UPDATE sales_payment SET amount = 1.00 WHERE id = ${id}::uuid`,
      ),
    ).rejects.toThrow(/posted → voided|only change/i);
    await expect(
      inScope(owner, x, (tx) => tx.$executeRaw`DELETE FROM sales_payment WHERE id = ${id}::uuid`),
    ).rejects.toThrow(/never deleted/i);
  });

  it("a payment can't name another business's invoice (composite key)", async () => {
    const yInvoice = await addInvoice(owner, y);
    await expect(addPayment(owner, x, { invoiceId: yInvoice })).rejects.toThrow(/foreign key/i);
  });
});

describe('tenancy on every table (CLAUDE.md mandatory tests)', () => {
  let yIds: Record<(typeof TABLES)[number], string>;

  beforeAll(async () => {
    const invoiceId = await addInvoice(owner, y);
    const lineId = await addLine(owner, y, invoiceId, { productId: partY });
    const paymentId = await addPayment(owner, y, { invoiceId });
    yIds = { invoice: invoiceId, invoice_line: lineId, sales_payment: paymentId };
  });

  it.each(TABLES)("business X can't read or guess business Y's %s by id", async (t) => {
    const rows = await inScope(app, x, (tx) =>
      tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id::text FROM ${t} WHERE id = $1::uuid`, yIds[t]),
    );
    expect(rows).toEqual([]);
  });

  it("business X can't write an invoice or a payment into business Y", async () => {
    await expect(
      addInvoice(app, x, { businessId: y.businessId, journalId: await journal(x) }),
    ).rejects.toThrow(/row-level security|foreign key/i);
    await expect(
      inScope(
        app,
        x,
        (tx) => tx.$executeRaw`
          INSERT INTO sales_payment (business_id, branch_id, receipt_number, party_id, method, amount, journal_id)
          VALUES (${y.businessId}::uuid, ${y.branchId}::uuid, 'R-X', ${randomUUID()}::uuid, 'cash', 1.00,
                  ${randomUUID()}::uuid)`,
      ),
    ).rejects.toThrow(/row-level security|foreign key/i);
  });

  it("a branch-A scope sees none of branch B's invoices, lines or payments, and can't post to branch B", async () => {
    const bInvoice = await addInvoice(owner, x, { branchId: branchB }, [x.branchId, branchB]);
    await addLine(owner, x, bInvoice);
    for (const sql of [
      `SELECT id FROM invoice WHERE id = $1::uuid`,
      `SELECT id FROM invoice_line WHERE invoice_id = $1::uuid`,
    ]) {
      expect(await inScope(app, x, (tx) => tx.$queryRawUnsafe(sql, bInvoice))).toEqual([]);
    }
    await expect(addInvoice(app, x, { branchId: branchB }, [x.branchId])).rejects.toThrow(
      /row-level security/i,
    );
  });

  it('a pooled connection returns nothing until the tenant settings are set again', async () => {
    const id = await addInvoice(owner, x);
    expect(
      await inScope(appSingle, x, (tx) => tx.$queryRaw`SELECT id FROM invoice WHERE id = ${id}::uuid`),
    ).toHaveLength(1);
    await expect(
      appSingle.$transaction((tx) => tx.$queryRaw`SELECT id FROM invoice WHERE id = ${id}::uuid`),
    ).rejects.toThrow(/tenant scope not set/);
  });
});

describe('known gaps (Munif, 24 Nov), recorded so they show in every run', () => {
  it('GAP 2, decision 4: invoice.party_id and sales_payment.party_id have no foreign key yet, because the party table (A11) does not exist. When A11 lands this test fails: add the composite FKs (NOT VALID, then VALIDATE) on journal_line, invoice and sales_payment', async () => {
    const [row] = await owner.$queryRaw<{ exists: boolean }[]>`
      SELECT to_regclass('public.party') IS NOT NULL AS exists`;
    expect(row?.exists).toBe(false);
  });

  it.skip('GAP 3, void and reissue (C14): a posted invoice is voided by a reversal journal and reissued as a new document. Not built and not shown in the demo; the table already allows only posted → voided', () => {
    // Written when C14 plans the void route.
  });
});
