import { randomBytes, randomUUID } from 'node:crypto';
import type { TenantScope } from '@erp/shared';
import { createDbClient } from '@erp/dal';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNT_ROLES, type AccountRole } from './contracts/provided/IPostingService.js';
import { createManagers, DenyAllRoleSource } from './index.js';

/**
 * The books and the stock agree (Munif, 24 Nov; invariants 1 and 3), against real Postgres: after opening stock and
 * a sale, the ledger's inventory balance (the dashboard's stock value) equals, per business, the sum of on hand ×
 * average cost over the counted products plus the own cost of each serial unit in stock (serial units never average,
 * invariant 7). Stock movements post no journal, so opening stock needs its own balanced opening journal, Dr inventory
 * / Cr an opening-balance equity account: the demo seed posts exactly that (docs/demo-seed-spec.md). The amounts here
 * don't round; a sale at an average that rounds to paisa can leave a paisa between the two, by design (ADR 0021 §2).
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

const w = {
  org: randomUUID(),
  business: randomUUID(),
  branch: randomUUID(),
  inventory: '',
  equity: '',
  customer: '',
  pads: '',
  oil: '',
  bike: '',
  unitA: '',
  unitB: '',
};
const scope = (): TenantScope => ({
  organizationId: w.org,
  businessIds: [w.business],
  branchIds: [w.branch],
  branchId: w.branch,
});

function asOwner<T>(fn: (tx: Tx) => Promise<T>) {
  return owner.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT set_config('app.organization_id', ${w.org}, true), set_config('app.business_ids', ${w.business}, true),
             set_config('app.branch_ids', ${w.branch}, true)`;
    return fn(tx);
  });
}

async function id(rows: Promise<{ id: string }[]>): Promise<string> {
  const [row] = await rows;
  if (!row) throw new Error('no row');
  return row.id;
}

/** On hand × average cost over counted products, plus each serial unit's own cost, as the stock side sees it. */
async function stockSideValue(): Promise<string> {
  const [row] = await asOwner(
    (tx) => tx.$queryRaw<{ value: string }[]>`
      SELECT ((SELECT coalesce(sum(sb.on_hand * sc.avg_cost), 0)
                 FROM stock_balance sb
                 JOIN stock_cost sc ON sc.business_id = sb.business_id AND sc.branch_id = sb.branch_id
                                   AND sc.product_id = sb.product_id
                 JOIN product p ON p.id = sb.product_id
                WHERE sb.business_id = ${w.business}::uuid AND p.tracking = 'quantity')
            + (SELECT coalesce(sum(u.unit_cost), 0) FROM serial_unit u
                WHERE u.business_id = ${w.business}::uuid AND u.status = 'in_stock'))::numeric(18,2)::text AS value`,
  );
  return row?.value ?? '';
}

async function ledgerInventory(): Promise<string> {
  const tb = await tenantScope.run(scope(), () => provided.trialBalance.read());
  return tb.rows.find((r) => r.accountId === w.inventory)?.balance ?? '0.00';
}

beforeAll(async () => {
  const legal = randomUUID();
  await asOwner(async (tx) => {
    await tx.$executeRaw`INSERT INTO organization (id, name) VALUES (${w.org}::uuid, 'Stock Value Org')`;
    await tx.$executeRaw`INSERT INTO legal_entity (id, organization_id, name)
      VALUES (${legal}::uuid, ${w.org}::uuid, 'Stock Value Legal')`;
    await tx.$executeRaw`INSERT INTO business (id, organization_id, legal_entity_id, name)
      VALUES (${w.business}::uuid, ${w.org}::uuid, ${legal}::uuid, 'Stock Value Business')`;
    await tx.$executeRaw`INSERT INTO branch (id, business_id, name, short_code)
      VALUES (${w.branch}::uuid, ${w.business}::uuid, 'Showroom', 'SHW')`;
    for (const role of ACCOUNT_ROLES) {
      const account = await id(tx.$queryRaw<{ id: string }[]>`
        INSERT INTO account (business_id, code, name, type)
        VALUES (${w.business}::uuid, ${`A-${role}`}, ${`Account for ${role}`}, ${TYPE_OF[role]}) RETURNING id::text`);
      if (role === 'inventory') w.inventory = account;
      await tx.$executeRaw`INSERT INTO account_role (business_id, role, account_id)
        VALUES (${w.business}::uuid, ${role}, ${account}::uuid)`;
    }
    // The opening-balance equity account: a plain equity account, not one of the 12 roles.
    w.equity = await id(tx.$queryRaw<{ id: string }[]>`
      INSERT INTO account (business_id, code, name, type)
      VALUES (${w.business}::uuid, 'A-opening-equity', 'Opening balance equity', 'equity') RETURNING id::text`);
    for (const [kind, prefix] of [
      ['invoice', 'INV-'],
      ['receipt', 'RC-'],
      ['journal', 'JV-'],
    ] as const) {
      await tx.$executeRaw`INSERT INTO number_series (business_id, branch_id, kind, prefix)
        VALUES (${w.business}::uuid, ${w.branch}::uuid, ${kind}, ${prefix})`;
    }
    w.customer = await id(tx.$queryRaw<{ id: string }[]>`
      INSERT INTO party (business_id, code, name, kind, is_customer, is_supplier, phone_e164, created_by)
      VALUES (${w.business}::uuid, 'CU-0001', 'Sample Customer', 'person', true, false, '+8801700000001',
              ${randomUUID()}::uuid) RETURNING id::text`);
    const product = (code: string, tracking: string, price: string) =>
      id(tx.$queryRaw<{ id: string }[]>`
        INSERT INTO product (business_id, code, name, unit, tracking, sell_price)
        VALUES (${w.business}::uuid, ${code}, ${`Product ${code}`}, 'pcs', ${tracking}, ${price}::numeric)
        RETURNING id::text`);
    w.pads = await product('PRT-BRK-0214', 'quantity', '1000.00');
    w.oil = await product('OIL-1L', 'quantity', '450.00');
    w.bike = await product('VL3-150', 'serial', '185000.00');
    const unit = (cost: string) =>
      id(tx.$queryRaw<{ id: string }[]>`
        INSERT INTO serial_unit (business_id, branch_id, product_id, serial_no, unit_cost)
        VALUES (${w.business}::uuid, ${w.branch}::uuid, ${w.bike}::uuid, ${`VL3-${randomBytes(3).toString('hex')}`},
                ${cost}::numeric) RETURNING id::text`);
    w.unitA = await unit('150000.00');
    w.unitB = await unit('148500.00');
  });

  // Opening stock through the stock service, as the seed brings it in.
  const opening = (productId: string, qty: string, unitCost: string, unitId?: string) => ({
    productId,
    branchId: w.branch,
    qtyDelta: qty,
    unitCost,
    ...(unitId ? { unitId } : {}),
    kind: 'opening' as const,
    source: { type: 'opening_stock', id: randomUUID() },
  });
  await tenantScope.run(scope(), () =>
    provided.stock.move([
      opening(w.pads, '10.000', '400.00'),
      opening(w.oil, '4.000', '125.50'),
      opening(w.bike, '1.000', '150000.00', w.unitA),
      opening(w.bike, '1.000', '148500.00', w.unitB),
    ]),
  );

  // The seed's opening journal: Dr inventory / Cr opening equity, for the value just brought in.
  const value = await stockSideValue();
  await asOwner(async (tx) => {
    const journal = await id(tx.$queryRaw<{ id: string }[]>`
      INSERT INTO journal (business_id, branch_id, number, journal_date, source_type, source_id, memo)
      VALUES (${w.business}::uuid, ${w.branch}::uuid, 'JV-OPENING', (now() AT TIME ZONE 'Asia/Dhaka')::date,
              'opening_stock', ${randomUUID()}::uuid, 'Opening stock') RETURNING id::text`);
    await tx.$executeRaw`
      INSERT INTO journal_line (business_id, journal_id, line_no, account_id, debit, credit) VALUES
        (${w.business}::uuid, ${journal}::uuid, 1, ${w.inventory}::uuid, ${value}::numeric, 0),
        (${w.business}::uuid, ${journal}::uuid, 2, ${w.equity}::uuid, 0, ${value}::numeric)`;
  });
});

afterAll(async () => {
  await Promise.all([close(), owner.$disconnect()]);
});

describe('the ledger stock value equals the stock (invariants 1 and 3)', () => {
  it('after opening stock and its opening journal: 10 × 400 + 4 × 125.50 + 150,000 + 148,500', async () => {
    expect(await stockSideValue()).toBe('303002.00');
    expect(await ledgerInventory()).toBe('303002.00');
  });

  it('after a sale of 2 brake pad sets and one bike, both sides fall by exactly the cost sold', async () => {
    await tenantScope.run(scope(), () =>
      managers.sales.postInvoice(
        {
          partyId: w.customer,
          customerName: 'Sample Customer',
          lines: [
            { productId: w.pads, serialUnitId: null, qty: '2' },
            { productId: w.bike, serialUnitId: w.unitA, qty: '1' },
          ],
          discount: '0.00',
          payments: [{ method: 'cash', amount: '187000.00', externalRef: null }],
        },
        { branchId: w.branch, userId: randomUUID() },
      ),
    );
    // 303,002.00 − (2 × 400.00) − 150,000.00
    expect(await stockSideValue()).toBe('152202.00');
    expect(await ledgerInventory()).toBe('152202.00');
  });

  it('the owner dashboard shows the same stock value', async () => {
    const dashboard = await tenantScope.run(scope(), () =>
      managers.report.ownerDashboard({ canSeeCost: true }),
    );
    expect(dashboard.totals.stockValue).toBe(await stockSideValue());
  });
});
