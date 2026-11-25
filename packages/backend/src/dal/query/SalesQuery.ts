import { Prisma } from '../generated/prisma/client.js';
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
  isPassThrough: boolean;
}

/** One invoice as the list shows it (ADR 0059 section 2). Money as strings; no cost column is read. */
export interface InvoiceSummaryRow {
  id: string;
  number: string;
  branchId: string;
  partyId: string;
  invoiceDate: string;
  issuedAt: Date;
  customerName: string;
  total: string;
  paid: string;
  due: string;
  status: 'posted' | 'voided';
}

export interface InvoiceDetailRow extends InvoiceSummaryRow {
  soldBy: string;
  subtotal: string;
  discount: string;
  lines: { description: string; quantity: string; unitPrice: string; amount: string }[];
  payments: {
    receivedAt: Date;
    receiptNumber: string;
    method: 'cash' | 'bank' | 'bkash' | 'card';
    amount: string;
    externalRef: string | null;
  }[];
}

/** The summary columns of the invoice reads; soldBy, subtotal and discount ride along for the detail. */
const SUMMARY_SELECT = Prisma.sql`
  SELECT i.id::text AS id,
         i.number,
         i.branch_id::text AS "branchId",
         i.party_id::text AS "partyId",
         to_char(i.invoice_date, 'YYYY-MM-DD') AS "invoiceDate",
         i.created_at AS "issuedAt",
         coalesce(i.customer_name, p.name) AS "customerName",
         i.total::numeric(18,2)::text AS total,
         coalesce(pay.paid, 0)::numeric(18,2)::text AS paid,
         (i.total - coalesce(pay.paid, 0))::numeric(18,2)::text AS due,
         i.status,
         coalesce(u.display_name, '—') AS "soldBy",
         i.subtotal::numeric(18,2)::text AS subtotal,
         i.discount::numeric(18,2)::text AS discount
    FROM invoice i
    JOIN party p ON p.id = i.party_id
    LEFT JOIN app_user u ON u.id = i.sold_by
    LEFT JOIN LATERAL (SELECT sum(sp.amount) AS paid
                         FROM sales_payment sp
                        WHERE sp.invoice_id = i.id AND sp.status = 'posted') pay ON true`;

/**
 * Sales module: database access for posting a sale (ADR 0022 section 2). Satisfies businessLogic's
 * contracts/ISalesQuery, and IInvoiceReadQuery for the invoice reads (ADR 0059 section 2). Owner: Farhan; built by Munif
 * for item 3b. Runs in the request's tenant transaction under
 * RLS; the tables' triggers keep a posted invoice permanent (sql/rls/sales_invoice.sql).
 */
export class SalesQuery extends BaseQuery {
  async productsForSale(productIds: readonly string[]): Promise<
    {
      id: string;
      tracking: string;
      status: string;
      sellPrice: string;
      isPassThrough: boolean;
      vatOnFee: boolean;
    }[]
  > {
    return this.db.$queryRaw`
      SELECT id::text, tracking, status, sell_price::text AS "sellPrice", is_pass_through AS "isPassThrough",
             vat_on_fee AS "vatOnFee" FROM product
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
                                  line_total, cost_amount, is_pass_through)
        VALUES ((SELECT app_business_ids())[1], ${line.invoiceId}::uuid, ${line.lineNo}, ${line.productId}::uuid,
                ${line.serialUnitId}::uuid, ${line.qty}::numeric(18,3), ${line.unitPrice}::numeric(18,2),
                ${line.lineTotal}::numeric(18,2), ${line.costAmount}::numeric(18,2), ${line.isPassThrough})`;
    }
  }

  /** ADR 0020's conditional sell: only a unit still in stock changes, so a unit sold meanwhile counts 0. */
  async markUnitsSold(unitIds: readonly string[], invoiceId: string): Promise<number> {
    return this.db.$executeRaw`
      UPDATE serial_unit SET status = 'sold', invoice_id = ${invoiceId}::uuid, version = version + 1, updated_at = now()
       WHERE id = ANY (${[...unitIds]}::uuid[]) AND status = 'in_stock'`;
  }

  /**
   * The scope's invoices, newest first (ids are uuid v7), after `beforeId` when paging. Paid is the posted payments, at
   * the sale and after; the name is the invoice's, or the party's when the counter left it blank. Under RLS, so another
   * business's invoice is never read.
   */
  async listInvoices(filter: {
    partyId?: string;
    branchId?: string;
    beforeId?: string;
    limit: number;
  }): Promise<InvoiceSummaryRow[]> {
    return this.db.$queryRaw<InvoiceSummaryRow[]>`
      ${SUMMARY_SELECT}
       WHERE (${filter.partyId ?? null}::uuid IS NULL OR i.party_id = ${filter.partyId ?? null}::uuid)
         AND (${filter.branchId ?? null}::uuid IS NULL OR i.branch_id = ${filter.branchId ?? null}::uuid)
         AND (${filter.beforeId ?? null}::uuid IS NULL OR i.id < ${filter.beforeId ?? null}::uuid)
       ORDER BY i.id DESC
       LIMIT ${filter.limit}`;
  }

  /** One invoice with its lines (by line number) and posted payments (oldest first); null when not in the scope. */
  async findInvoice(id: string): Promise<InvoiceDetailRow | null> {
    const [summary] = await this.db.$queryRaw<
      (InvoiceSummaryRow & Pick<InvoiceDetailRow, 'soldBy' | 'subtotal' | 'discount'>)[]
    >`
      ${SUMMARY_SELECT}
       WHERE i.id = ${id}::uuid`;
    if (!summary) return null;
    const lines = await this.db.$queryRaw<InvoiceDetailRow['lines']>`
      SELECT pr.name AS description,
             l.qty::numeric(18,3)::text AS quantity,
             l.unit_price::numeric(18,2)::text AS "unitPrice",
             l.line_total::numeric(18,2)::text AS amount
        FROM invoice_line l
        JOIN product pr ON pr.id = l.product_id
       WHERE l.invoice_id = ${id}::uuid
       ORDER BY l.line_no`;
    const payments = await this.db.$queryRaw<InvoiceDetailRow['payments']>`
      SELECT received_at AS "receivedAt",
             receipt_number AS "receiptNumber",
             method,
             amount::numeric(18,2)::text AS amount,
             external_ref AS "externalRef"
        FROM sales_payment
       WHERE invoice_id = ${id}::uuid AND status = 'posted'
       ORDER BY received_at, receipt_number`;
    return { ...summary, lines, payments };
  }
}
