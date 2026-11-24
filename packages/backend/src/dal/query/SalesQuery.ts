import { BaseQuery } from './BaseQuery.js';

export interface InvoiceInsert {
  id: string;
  branchId: string;
  number: string;
  partyId: string;
  customerName: string | null;
  invoiceDate: string;
  subtotal: string;
  discount: string;
  total: string;
  journalId: string;
  soldBy: string;
}

export interface InvoiceLineInsert {
  invoiceId: string;
  lineNo: number;
  productId: string;
  serialUnitId: string | null;
  qty: string;
  unitPrice: string;
  lineTotal: string;
  costAmount: string;
}

/**
 * Sales module: database access for posting a sale (ADR 0022 section 2). Satisfies businessLogic's
 * contracts/ISalesQuery. Owner: Farhan; built by Munif for item 3b. Runs in the request's tenant transaction under
 * RLS; the tables' triggers keep a posted invoice permanent (sql/rls/sales_invoice.sql).
 */
export class SalesQuery extends BaseQuery {
  async productsForSale(
    productIds: readonly string[],
  ): Promise<{ id: string; tracking: string; status: string; sellPrice: string }[]> {
    return this.db.$queryRaw`
      SELECT id::text, tracking, status, sell_price::text AS "sellPrice" FROM product
       WHERE id = ANY (${[...productIds]}::uuid[])`;
  }

  async unitsForSale(
    unitIds: readonly string[],
  ): Promise<{ id: string; productId: string; branchId: string; status: string }[]> {
    if (unitIds.length === 0) return [];
    return this.db.$queryRaw`
      SELECT id::text, product_id::text AS "productId", branch_id::text AS "branchId", status FROM serial_unit
       WHERE id = ANY (${[...unitIds]}::uuid[])`;
  }

  async partyForSale(
    partyId: string,
  ): Promise<{ id: string; isWalkIn: boolean; isCustomer: boolean; status: string } | null> {
    const [row] = await this.db.$queryRaw<
      { id: string; isWalkIn: boolean; isCustomer: boolean; status: string }[]
    >`
      SELECT id::text, is_walk_in AS "isWalkIn", is_customer AS "isCustomer", status FROM party
       WHERE id = ${partyId}::uuid`;
    return row ?? null;
  }

  async newInvoiceId(): Promise<string> {
    const [row] = await this.db.$queryRaw<{ id: string }[]>`SELECT uuid_v7()::text AS id`;
    if (!row) throw new Error('uuid_v7() returned nothing');
    return row.id;
  }

  async insertInvoice(row: InvoiceInsert): Promise<void> {
    await this.requireOneBusiness('An invoice');
    await this.db.$executeRaw`
      INSERT INTO invoice (id, business_id, branch_id, number, party_id, customer_name, invoice_date, subtotal, discount,
                           total, journal_id, sold_by, created_by)
      VALUES (${row.id}::uuid, (SELECT app_business_ids())[1], ${row.branchId}::uuid, ${row.number},
              ${row.partyId}::uuid, ${row.customerName}, ${row.invoiceDate}::date, ${row.subtotal}::numeric(18,2),
              ${row.discount}::numeric(18,2), ${row.total}::numeric(18,2), ${row.journalId}::uuid, ${row.soldBy}::uuid,
              ${row.soldBy}::uuid)`;
  }

  async insertInvoiceLines(lines: InvoiceLineInsert[]): Promise<void> {
    for (const line of lines) {
      await this.db.$executeRaw`
        INSERT INTO invoice_line (business_id, invoice_id, line_no, product_id, serial_unit_id, qty, unit_price,
                                  line_total, cost_amount)
        VALUES ((SELECT app_business_ids())[1], ${line.invoiceId}::uuid, ${line.lineNo}, ${line.productId}::uuid,
                ${line.serialUnitId}::uuid, ${line.qty}::numeric(18,3), ${line.unitPrice}::numeric(18,2),
                ${line.lineTotal}::numeric(18,2), ${line.costAmount}::numeric(18,2))`;
    }
  }

  /** ADR 0020's conditional sell: only a unit still in stock changes, so a unit sold meanwhile counts 0. */
  async markUnitsSold(unitIds: readonly string[], invoiceId: string): Promise<number> {
    return this.db.$executeRaw`
      UPDATE serial_unit SET status = 'sold', invoice_id = ${invoiceId}::uuid, version = version + 1, updated_at = now()
       WHERE id = ANY (${[...unitIds]}::uuid[]) AND status = 'in_stock'`;
  }
}
