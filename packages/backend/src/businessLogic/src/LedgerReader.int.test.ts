import { randomBytes, randomUUID } from 'node:crypto';
import type { TenantScope } from '@erp/shared';
import { createDbClient } from '@erp/dal';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNT_ROLES, type AccountRole } from './contracts/provided/IPostingService.js';
import { createManagers, DenyAllRoleSource } from './index.js';

/**
 * M4 (Munif, 24 Nov), against real Postgres through the services createManagers builds:
 * - IPartyLedger.balances(partyId) (ADR 0024 question 1, ADR 0026 section 3): a customer's receivable and advance,
 *   from the ledger (invariant 1), as money strings; another business's party reads as nothing;
 * - ITrialBalance.read(asOf): every account with activity, its debits and credits up to a date, debits = credits; it
 *   closes ledger packet test 9: the registration fee shows under liabilities, never income.
 * Every value is invented.
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

interface World {
  org: string;
  business: string;
  branch: string;
  customer: string;
  part: string;
  fee: string;
}

const scopeOf = (w: World): TenantScope => ({
  organizationId: w.org,
  businessIds: [w.business],
  branchIds: [w.branch],
  branchId: w.branch,
});

async function one<T>(rows: Promise<T[]>): Promise<T> {
  const [row] = await rows;
  if (!row) throw new Error('no row');
  return row;
}

/** A business with its chart (12 roles), series, a customer, a stocked part (10 at ৳400.00) and a registration fee. */
async function newWorld(): Promise<World> {
  const w = {
    org: randomUUID(),
    business: randomUUID(),
    branch: randomUUID(),
    customer: '',
    part: '',
    fee: '',
  };
  const legal = randomUUID();
  await owner.$transaction(async (tx: Tx) => {
    await tx.$queryRaw`
      SELECT set_config('app.organization_id', ${w.org}, true), set_config('app.business_ids', ${w.business}, true),
             set_config('app.branch_ids', ${w.branch}, true)`;
    await tx.$executeRaw`INSERT INTO organization (id, name) VALUES (${w.org}::uuid, 'Ledger Test Org')`;
    await tx.$executeRaw`INSERT INTO legal_entity (id, organization_id, name)
      VALUES (${legal}::uuid, ${w.org}::uuid, 'Ledger Test Legal')`;
    await tx.$executeRaw`INSERT INTO business (id, organization_id, legal_entity_id, name)
      VALUES (${w.business}::uuid, ${w.org}::uuid, ${legal}::uuid, 'Ledger Test Business')`;
    await tx.$executeRaw`INSERT INTO branch (id, business_id, name, short_code)
      VALUES (${w.branch}::uuid, ${w.business}::uuid, 'Showroom', 'SHW')`;
    for (const role of ACCOUNT_ROLES) {
      const account = await one(tx.$queryRaw<{ id: string }[]>`
        INSERT INTO account (business_id, code, name, type)
        VALUES (${w.business}::uuid, ${`A-${role}`}, ${`Account for ${role}`}, ${TYPE_OF[role]}) RETURNING id::text`);
      await tx.$executeRaw`INSERT INTO account_role (business_id, role, account_id)
        VALUES (${w.business}::uuid, ${role}, ${account.id}::uuid)`;
    }
    for (const [kind, prefix] of [
      ['invoice', 'INV-'],
      ['receipt', 'RC-'],
      ['journal', 'JV-'],
    ] as const) {
      await tx.$executeRaw`INSERT INTO number_series (business_id, branch_id, kind, prefix)
        VALUES (${w.business}::uuid, ${w.branch}::uuid, ${kind}, ${prefix})`;
    }
    w.customer = (
      await one(tx.$queryRaw<{ id: string }[]>`
      INSERT INTO party (business_id, code, name, kind, is_customer, is_supplier, phone_e164, created_by)
      VALUES (${w.business}::uuid, ${`CU-${randomBytes(3).toString('hex')}`}, 'Sample Customer', 'person', true, false,
              '+8801700000001', ${randomUUID()}::uuid) RETURNING id::text`)
    ).id;
    w.part = (
      await one(tx.$queryRaw<{ id: string }[]>`
      INSERT INTO product (business_id, code, name, unit, tracking, sell_price)
      VALUES (${w.business}::uuid, 'PRT-BRK-0214', 'Brake pad set', 'pcs', 'quantity', 1000.00) RETURNING id::text`)
    ).id;
    w.fee = (
      await one(tx.$queryRaw<{ id: string }[]>`
      INSERT INTO product (business_id, code, name, unit, tracking, sell_price, is_pass_through)
      VALUES (${w.business}::uuid, 'FEE-REG', 'Registration fee', 'pcs', 'quantity', 18500.00, true)
      RETURNING id::text`)
    ).id;
  });
  await tenantScope.run(scopeOf(w), () =>
    provided.stock.move([
      {
        productId: w.part,
        branchId: w.branch,
        qtyDelta: '10.000',
        unitCost: '400.00',
        kind: 'opening',
        source: { type: 'test_opening', id: randomUUID() },
      },
    ]),
  );
  return w;
}

const sell = (w: World, lines: { productId: string; qty: string }[], paid: string) =>
  tenantScope.run(scopeOf(w), () =>
    managers.sales.postInvoice(
      {
        partyId: w.customer,
        customerName: 'Sample Customer',
        lines: lines.map((l) => ({ ...l, serialUnitId: null })),
        discount: '0.00',
        payments: paid === '0.00' ? [] : [{ method: 'cash', amount: paid, externalRef: null }],
      },
      { branchId: w.branch, userId: randomUUID() },
    ),
  );

const balances = (w: World, partyId: string) =>
  tenantScope.run(scopeOf(w), () => provided.partyLedger.balances(partyId));
const trialBalance = (w: World, asOf?: string) =>
  tenantScope.run(scopeOf(w), () => provided.trialBalance.read(asOf));

let world: World;

beforeAll(async () => {
  world = await newWorld();
});

afterAll(async () => {
  await Promise.all([close(), owner.$disconnect()]);
});

describe('IPartyLedger.balances (ADR 0024 question 1; ADR 0026 section 3)', () => {
  it('a customer with nothing posted owes nothing and holds no advance', async () => {
    const fresh = await newWorld();
    expect(await balances(fresh, fresh.customer)).toEqual({ receivable: '0.00', customerAdvance: '0.00' });
  });

  it('two sales leaving dues, then the receivable is what is still owed, from the ledger', async () => {
    const w = await newWorld();
    await sell(w, [{ productId: w.part, qty: '3' }], '1000.00'); // ৳3,000.00, ৳2,000.00 due
    await sell(w, [{ productId: w.part, qty: '1' }], '0.00'); // ৳1,000.00, all due
    expect(await balances(w, w.customer)).toEqual({ receivable: '3000.00', customerAdvance: '0.00' });
  });

  it('an advance the customer paid shows as customerAdvance, never as a smaller receivable', async () => {
    const w = await newWorld();
    await tenantScope.run(scopeOf(w), () =>
      provided.posting.post({
        branchId: w.branch,
        date: '2026-11-24',
        source: { type: 'sales_payment', id: randomUUID() },
        memo: 'Advance',
        lines: [
          { role: 'cash', debit: '5000.00', credit: '0.00' },
          { role: 'customer_advance', debit: '0.00', credit: '5000.00', partyId: w.customer },
        ],
      }),
    );
    expect(await balances(w, w.customer)).toEqual({ receivable: '0.00', customerAdvance: '5000.00' });
  });

  it("another business's customer reads as nothing: no amount crosses businesses", async () => {
    const [w, other] = [await newWorld(), await newWorld()];
    await sell(other, [{ productId: other.part, qty: '1' }], '0.00');
    expect(await balances(w, other.customer)).toEqual({ receivable: '0.00', customerAdvance: '0.00' });
    expect(await balances(other, other.customer)).toEqual({ receivable: '1000.00', customerAdvance: '0.00' });
  });
});

describe('ITrialBalance.read (M4)', () => {
  it('debits equal credits, and every row is an account with activity, money as strings', async () => {
    await sell(world, [{ productId: world.part, qty: '2' }], '500.00');
    const tb = await trialBalance(world);
    expect(tb.totals.debit).toBe(tb.totals.credit);
    expect(tb.rows.length).toBeGreaterThan(0);
    for (const row of tb.rows) {
      expect(row.debit).toMatch(/^\d+\.\d{2}$/);
      expect(row.credit).toMatch(/^\d+\.\d{2}$/);
    }
    expect(tb.rows.find((r) => r.code === 'A-receivable')).toMatchObject({
      type: 'asset',
      debit: '2000.00',
      credit: '500.00',
      balance: '1500.00',
    });
  });

  it('ledger packet test 9, finished: the registration fee shows under liabilities, never income', async () => {
    const w = await newWorld();
    await sell(w, [{ productId: w.fee, qty: '1' }], '18500.00');
    const tb = await trialBalance(w);
    expect(tb.rows.find((r) => r.code === 'A-pass_through_payable')).toMatchObject({
      type: 'liability',
      debit: '0.00',
      credit: '18500.00',
      balance: '-18500.00',
    });
    expect(tb.rows.filter((r) => r.type === 'income')).toEqual([]);
  });

  it('as of a date before anything was posted, the trial balance is empty and balanced at zero', async () => {
    const w = await newWorld();
    await sell(w, [{ productId: w.part, qty: '1' }], '1000.00');
    expect(await trialBalance(w, '2000-01-01')).toEqual({
      rows: [],
      totals: { debit: '0.00', credit: '0.00' },
    });
  });

  it('a date that is not YYYY-MM-DD is a consumer bug', async () => {
    await expect(trialBalance(world, '24/11/2026')).rejects.toThrow(/YYYY-MM-DD/);
  });
});
