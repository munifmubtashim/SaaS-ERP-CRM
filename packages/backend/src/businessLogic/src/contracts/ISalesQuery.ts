/**
 * What SalesManager needs from the database to post a sale (ADR 0022 section 2). Owned by businessLogic; dal's
 * SalesQuery satisfies it. Every call runs in the request's tenant transaction, under RLS. Money is a two-decimal
 * string, a quantity a numeric(18,3) string.
 */
export interface ProductForSale {
  id: string;
  /** serial or quantity. */
  tracking: string;
  /** active or archived; an archived product can't be sold (C2). */
  status: string;
  /** Copied onto the line at sale time (P-07). */
  sellPrice: string;
}

export interface UnitForSale {
  id: string;
  productId: string;
  branchId: string;
  status: string;
}

export interface PartyForSale {
  id: string;
  isWalkIn: boolean;
  isCustomer: boolean;
  status: string;
}

export interface NewInvoice {
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

export interface NewInvoiceLine {
  invoiceId: string;
  lineNo: number;
  productId: string;
  serialUnitId: string | null;
  qty: string;
  unitPrice: string;
  lineTotal: string;
  /** The cost the stock service used: a hidden field, stored, never answered. */
  costAmount: string;
}

export interface ISalesQuery {
  productsForSale(productIds: readonly string[]): Promise<ProductForSale[]>;
  unitsForSale(unitIds: readonly string[]): Promise<UnitForSale[]>;
  /** The party if it is in the caller's business, else null. */
  partyForSale(partyId: string): Promise<PartyForSale | null>;
  /** A fresh uuid_v7() from the database, so the journal and the movements can name the invoice first. */
  newInvoiceId(): Promise<string>;
  insertInvoice(row: NewInvoice): Promise<void>;
  insertInvoiceLines(lines: NewInvoiceLine[]): Promise<void>;
  /** Marks the units sold on this invoice (in_stock → sold, conditional); returns how many changed. */
  markUnitsSold(unitIds: readonly string[], invoiceId: string): Promise<number>;
}
