/**
 * Plain data for the 29 Nov demo seed (plan: feat/demo). Everything here is invented: no real person,
 * phone, NID, business or product line. Money is a two-decimal string, quantity a three-decimal string,
 * as in the API (CLAUDE.md conventions).
 */

/** Same shape as businessLogic's IClock, so SystemClock or a fixed test clock can be passed in. */
export interface DemoClock {
  now(): Date;
}

export interface DemoBranch {
  code: string;
  name: string;
  business: 'Demo Motors' | 'Demo Parts';
}

export interface DemoProduct {
  code: string;
  name: string;
  brand: string | null;
  category: 'motorcycle' | 'parts' | 'accessories' | 'lubricants';
  unit: string;
  tracking: 'serial' | 'quantity';
  /** Selling price, money string. */
  price: string;
  /** Purchase cost for the opening stock receipts; a hidden field once shown (plan 2.5). */
  unitCost: string;
}

export interface DemoCustomer {
  code: string;
  name: string;
  nameBn: string | null;
  /** E.164, only in the fake +88017000000NN range used by every fixture. */
  phone: string;
  area: string;
}

/** One serial-tracked unit in opening stock. The engine number belongs to the Vehicle pack (spec O-11). */
export interface DemoUnit {
  chassisNo: string;
  engineNo: string;
  colour: string;
  productCode: string;
  branchCode: string;
}

export interface DemoPartStock {
  productCode: string;
  branchCode: string;
  qty: string;
}

export type PaymentMethod = 'cash' | 'bank' | 'bkash' | 'card';

export interface InvoiceLineRequest {
  productCode: string;
  /** Set for a serial-tracked unit; that line's qty is always "1.000". */
  chassisNo: string | null;
  qty: string;
  unitPrice: string;
  lineTotal: string;
}

export interface PaymentRequest {
  method: PaymentMethod;
  amount: string;
  /** Typed-in transaction id for Bank, bKash and Card (plan 1.5, answer 4); null for Cash. */
  externalRef: string | null;
}

/** What the seed will send to the POS write path, one per sale. Plain data, no ids from the database. */
export interface InvoiceRequest {
  idempotencyKey: string;
  /** ISO 8601, UTC; within shop hours in Asia/Dhaka. */
  soldAt: string;
  branchCode: string;
  /** null for a walk-in customer (parts only). */
  customerCode: string | null;
  lines: InvoiceLineRequest[];
  discount: string;
  total: string;
  payments: PaymentRequest[];
}
