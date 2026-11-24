import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { createTree, setScope, type Tree } from './support/orgTree.js';
import { sourceIsInMigration } from './support/tableRules.js';

/**
 * Migration pass_through_fee (item 3d; ledger packet 4.4 and decision 6, Munif 24 Nov): two generic product settings,
 * "pass-through fee" and "VAT on fee" (off by default), and the flag copied onto the invoice line at posting. A
 * pass-through fee is money held for someone else (a registration fee for the authority), never revenue and never
 * stock. The core stays generic: nothing here names a registration authority (spec O-11).
 */
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!ownerUrl) throw new Error('MIGRATION_DATABASE_URL must be set (see .env.example).');
const owner: DbClient = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 10_000 });

let x: Tree;
type Tx = Parameters<Parameters<DbClient['$transaction']>[0]>[0];
const inX = <T>(fn: (tx: Tx) => Promise<T>) =>
  owner.$transaction(async (tx) => {
    await setScope(tx, x.organizationId, [x.businessId], [x.branchId]);
    return fn(tx);
  });

async function addProduct(fields: { tracking?: string; passThrough?: boolean; vatOnFee?: boolean } = {}) {
  return inX(async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string; is_pass_through: boolean; vat_on_fee: boolean }[]>`
      INSERT INTO product (business_id, code, name, unit, tracking, sell_price, is_pass_through, vat_on_fee)
      VALUES (${x.businessId}::uuid, ${`P-${randomBytes(4).toString('hex')}`}, 'Registration fee', 'pcs',
              ${fields.tracking ?? 'quantity'}, 18500.00, ${fields.passThrough ?? false}, ${fields.vatOnFee ?? false})
      RETURNING id::text, is_pass_through, vat_on_fee`;
    if (!row) throw new Error('no product');
    return row;
  });
}

beforeAll(async () => {
  x = await createTree(owner);
});

afterAll(async () => {
  await owner.$disconnect();
});

describe('product settings: pass-through fee and VAT on fee', () => {
  it('both are off by default, so an ordinary product is neither', async () => {
    const product = await inX(async (tx) => {
      const [row] = await tx.$queryRaw<{ is_pass_through: boolean; vat_on_fee: boolean }[]>`
        INSERT INTO product (business_id, code, name, unit, tracking, sell_price)
        VALUES (${x.businessId}::uuid, ${`P-${randomBytes(4).toString('hex')}`}, 'Brake pad set', 'pcs', 'quantity', 1000.00)
        RETURNING is_pass_through, vat_on_fee`;
      return row;
    });
    expect(product).toEqual({ is_pass_through: false, vat_on_fee: false });
  });

  it('a pass-through fee with VAT off is accepted', async () => {
    expect(await addProduct({ passThrough: true })).toMatchObject({
      is_pass_through: true,
      vat_on_fee: false,
    });
  });

  it('VAT on fee is refused on a product that is not a pass-through fee', async () => {
    await expect(addProduct({ vatOnFee: true })).rejects.toThrow(/check/i);
  });

  it('a pass-through fee is never a serial (stocked unit) product', async () => {
    await expect(addProduct({ passThrough: true, tracking: 'serial' })).rejects.toThrow(/check/i);
  });

  it('erp_app can change neither setting (no column grant): set once by the owner or the seed', async () => {
    const rows = await owner.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.column_privileges
       WHERE table_name = 'product' AND grantee = 'erp_app' AND privilege_type = 'UPDATE'
         AND column_name IN ('is_pass_through', 'vat_on_fee')`;
    expect(rows).toEqual([]);
  });
});

describe('the flag copied onto the invoice line at posting', () => {
  async function line(fields: { passThrough: boolean; cost: string; unit?: string | null }) {
    return inX(async (tx) => {
      const product = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO product (business_id, code, name, unit, tracking, sell_price, is_pass_through)
        VALUES (${x.businessId}::uuid, ${`P-${randomBytes(4).toString('hex')}`}, 'Fee', 'pcs', 'quantity', 18500.00,
                ${fields.passThrough})
        RETURNING id::text`;
      const accounts: string[] = [];
      for (const type of ['asset', 'liability']) {
        const [a] = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO account (business_id, code, name, type)
          VALUES (${x.businessId}::uuid, ${`A-${randomBytes(4).toString('hex')}`}, 'Fee test', ${type}) RETURNING id::text`;
        accounts.push(a?.id ?? '');
      }
      const [journal] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO journal (business_id, branch_id, number, journal_date, source_type, source_id, memo)
        VALUES (${x.businessId}::uuid, ${x.branchId}::uuid, ${`JV-${randomBytes(4).toString('hex')}`}, CURRENT_DATE,
                'sales_invoice', ${randomUUID()}::uuid, 'Fee') RETURNING id::text`;
      await tx.$executeRaw`
        INSERT INTO journal_line (business_id, journal_id, line_no, account_id, debit, credit) VALUES
          (${x.businessId}::uuid, ${journal?.id}::uuid, 1, ${accounts[0]}::uuid, 18500.00, 0),
          (${x.businessId}::uuid, ${journal?.id}::uuid, 2, ${accounts[1]}::uuid, 0, 18500.00)`;
      const [party] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO party (business_id, code, name, kind, is_customer, is_supplier, phone_e164, created_by)
        VALUES (${x.businessId}::uuid, ${`CU-${randomBytes(4).toString('hex')}`}, 'Sample Customer', 'person', true,
                false, '+8801700000001', ${randomUUID()}::uuid) RETURNING id::text`;
      const [invoice] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO invoice (business_id, branch_id, number, party_id, invoice_date, subtotal, discount, total,
                             journal_id, sold_by)
        VALUES (${x.businessId}::uuid, ${x.branchId}::uuid, ${`INV-${randomBytes(4).toString('hex')}`},
                ${party?.id}::uuid, CURRENT_DATE, 18500.00, 0, 18500.00, ${journal?.id}::uuid, ${randomUUID()}::uuid)
        RETURNING id::text`;
      const [row] = await tx.$queryRaw<{ is_pass_through: boolean }[]>`
        INSERT INTO invoice_line (business_id, invoice_id, line_no, product_id, qty, unit_price, line_total,
                                  cost_amount, is_pass_through)
        VALUES (${x.businessId}::uuid, ${invoice?.id}::uuid, 1, ${product[0]?.id}::uuid, 1, 18500.00, 18500.00,
                ${fields.cost}::numeric, ${fields.passThrough})
        RETURNING is_pass_through`;
      return row;
    });
  }

  it('a pass-through line records the flag and carries no cost', async () => {
    expect(await line({ passThrough: true, cost: '0.00' })).toEqual({ is_pass_through: true });
  });

  it('a pass-through line with a cost is refused: a fee is never stock', async () => {
    await expect(line({ passThrough: true, cost: '100.00' })).rejects.toThrow(/check/i);
  });

  it('dal/sql/rls/pass_through_fee.sql appears, unchanged, in the pass_through_fee migration', () => {
    expect(sourceIsInMigration('sql/rls/pass_through_fee.sql', 'pass_through_fee')).toBe(true);
  });
});
