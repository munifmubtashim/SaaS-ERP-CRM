import { randomBytes, randomUUID } from 'node:crypto';
import type { TenantScope } from '@erp/shared';
import { createDbClient } from '@erp/dal';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNT_ROLES, type AccountRole } from './contracts/provided/IPostingService.js';
import { createManagers, DenyAllRoleSource } from './index.js';

/**
 * Ledger packet test 9 (item 3d; invariant 8; decision 6), against real Postgres through the SalesManager that
 * createManagers builds: a bike sale with a registration fee posts the fee to pass_through_payable, a liability, and
 * nothing of it to sales_revenue; with VAT on fee off there is no VAT line; the fee moves no stock and carries no
 * cost, and its invoice line records the flag. Every value is invented.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const { managers, provided, tenantScope, close } = createManagers({
  databaseUrl: appUrl,
  version: 'test',
  dbPoolMax: 4,
  dbTxTimeoutMs: 15_000,
  roleSource: new DenyAllRoleSource(),
});
const owner = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 10_000 });
type Tx = Parameters<Parameters<typeof owner.$transaction>[0]>[0];

const TYPE_OF: Record<AccountRole, string> = {
  cash: 'asset',
  bank: 'asset',
  mobile_money: 'asset',
  card_clearing: 'asset',
  receivable: 'asset',
  inventory: 'asset',
  customer_advance: 'liability',
  pass_through_payable: 'liability',
  vat_output_payable: 'liability',
  sales_revenue: 'income',
  service_revenue: 'income',
  cost_of_goods_sold: 'expense',
};

const ids = {
  org: randomUUID(),
  legal: randomUUID(),
  business: randomUUID(),
  branch: randomUUID(),
  customer: '',
  bike: '',
  unit: '',
  fee: '',
};
const scope = (): TenantScope => ({
  organizationId: ids.org,
  businessIds: [ids.business],
  branchIds: [ids.branch],
  branchId: ids.branch,
});

function asOwner<T>(fn: (tx: Tx) => Promise<T>) {
  return owner.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT set_config('app.organization_id', ${ids.org}, true), set_config('app.business_ids', ${ids.business}, true),
             set_config('app.branch_ids', ${ids.branch}, true)`;
    return fn(tx);
  });
}

async function one<T>(rows: Promise<T[]>): Promise<T> {
  const [row] = await rows;
  if (!row) throw new Error('no row');
  return row;
}

beforeAll(async () => {
  await asOwner(async (tx) => {
    await tx.$executeRaw`INSERT INTO organization (id, name) VALUES (${ids.org}::uuid, 'Fee Test Org')`;
    await tx.$executeRaw`INSERT INTO legal_entity (id, organization_id, name)
      VALUES (${ids.legal}::uuid, ${ids.org}::uuid, 'Fee Test Legal')`;
    await tx.$executeRaw`INSERT INTO business (id, organization_id, legal_entity_id, name)
      VALUES (${ids.business}::uuid, ${ids.org}::uuid, ${ids.legal}::uuid, 'Fee Test Business')`;
    await tx.$executeRaw`INSERT INTO branch (id, business_id, name, short_code)
      VALUES (${ids.branch}::uuid, ${ids.business}::uuid, 'Showroom', 'SHW')`;
    for (const role of ACCOUNT_ROLES) {
      const account = await one(tx.$queryRaw<{ id: string }[]>`
        INSERT INTO account (business_id, code, name, type)
        VALUES (${ids.business}::uuid, ${`A-${role}`}, ${`Account for ${role}`}, ${TYPE_OF[role]}) RETURNING id::text`);
      await tx.$executeRaw`INSERT INTO account_role (business_id, role, account_id)
        VALUES (${ids.business}::uuid, ${role}, ${account.id}::uuid)`;
    }
    for (const [kind, prefix] of [
      ['invoice', 'INV-'],
      ['receipt', 'RC-'],
      ['journal', 'JV-'],
    ] as const) {
      await tx.$executeRaw`INSERT INTO number_series (business_id, branch_id, kind, prefix)
        VALUES (${ids.business}::uuid, ${ids.branch}::uuid, ${kind}, ${prefix})`;
    }
    ids.customer = (
      await one(tx.$queryRaw<{ id: string }[]>`
      INSERT INTO party (business_id, code, name, kind, is_customer, is_supplier, phone_e164, created_by)
      VALUES (${ids.business}::uuid, 'CU-0001', 'Sample Customer', 'person', true, false, '+8801700000001',
              ${randomUUID()}::uuid) RETURNING id::text`)
    ).id;
    ids.bike = (
      await one(tx.$queryRaw<{ id: string }[]>`
      INSERT INTO product (business_id, code, name, unit, tracking, sell_price)
      VALUES (${ids.business}::uuid, 'VL3-150', 'Velo 150 V3', 'pcs', 'serial', 185000.00) RETURNING id::text`)
    ).id;
    ids.fee = (
      await one(tx.$queryRaw<{ id: string }[]>`
      INSERT INTO product (business_id, code, name, unit, tracking, sell_price, is_pass_through)
      VALUES (${ids.business}::uuid, 'FEE-REG', 'Registration fee', 'pcs', 'quantity', 18500.00, true)
      RETURNING id::text`)
    ).id;
    ids.unit = (
      await one(tx.$queryRaw<{ id: string }[]>`
      INSERT INTO serial_unit (business_id, branch_id, product_id, serial_no, unit_cost)
      VALUES (${ids.business}::uuid, ${ids.branch}::uuid, ${ids.bike}::uuid, ${`VL3-${randomBytes(3).toString('hex')}`},
              150000.00) RETURNING id::text`)
    ).id;
  });
  await tenantScope.run(scope(), () =>
    provided.stock.move([
      {
        productId: ids.bike,
        branchId: ids.branch,
        qtyDelta: '1.000',
        unitId: ids.unit,
        unitCost: '150000.00',
        kind: 'opening',
        source: { type: 'test_opening', id: randomUUID() },
      },
    ]),
  );
});

afterAll(async () => {
  await Promise.all([close(), owner.$disconnect()]);
});

describe('ledger packet test 9: the registration fee is pass-through money (invariant 8)', () => {
  it('a bike sale with the fee: fee to pass_through_payable (a liability), nothing of it to revenue, no VAT line', async () => {
    const posted = await tenantScope.run(scope(), () =>
      managers.sales.postInvoice(
        {
          partyId: ids.customer,
          customerName: 'Sample Customer',
          lines: [
            { productId: ids.bike, serialUnitId: ids.unit, qty: '1' },
            { productId: ids.fee, serialUnitId: null, qty: '1' },
          ],
          discount: '0.00',
          payments: [{ method: 'cash', amount: '203500.00', externalRef: null }],
        },
        { branchId: ids.branch, userId: randomUUID() },
      ),
    );
    expect(posted).toMatchObject({ total: '203500.00', paid: '203500.00', due: '0.00' });

    const lines = await asOwner(
      (tx) => tx.$queryRaw<{ role: string; type: string; debit: string; credit: string }[]>`
        SELECT r.role, a.type, l.debit::text, l.credit::text
          FROM invoice i
          JOIN journal_line l ON l.journal_id = i.journal_id
          JOIN account a ON a.id = l.account_id
          JOIN account_role r ON r.account_id = a.id
         WHERE i.id = ${posted.id}::uuid
         ORDER BY l.line_no`,
    );
    expect(lines).toEqual([
      { role: 'receivable', type: 'asset', debit: '203500.00', credit: '0.00' },
      { role: 'sales_revenue', type: 'income', debit: '0.00', credit: '185000.00' },
      { role: 'pass_through_payable', type: 'liability', debit: '0.00', credit: '18500.00' },
      { role: 'cost_of_goods_sold', type: 'expense', debit: '150000.00', credit: '0.00' },
      { role: 'inventory', type: 'asset', debit: '0.00', credit: '150000.00' },
    ]);

    const stored = await asOwner(
      (tx) => tx.$queryRaw<{ product_id: string; is_pass_through: boolean; cost_amount: string }[]>`
        SELECT product_id::text, is_pass_through, cost_amount::text FROM invoice_line
         WHERE invoice_id = ${posted.id}::uuid ORDER BY line_no`,
    );
    expect(stored).toEqual([
      { product_id: ids.bike, is_pass_through: false, cost_amount: '150000.00' },
      { product_id: ids.fee, is_pass_through: true, cost_amount: '0.00' },
    ]);
    const feeMovements = await asOwner(
      (tx) => tx.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM stock_movement WHERE product_id = ${ids.fee}::uuid`,
    );
    expect(feeMovements[0]?.n).toBe(0);
  });
});
