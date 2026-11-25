import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from '../utils/permissions.js';
import {
  invoiceDetailSchema,
  invoiceListQuerySchema,
  invoiceListResponseSchema,
  invoiceSummarySchema,
} from './sales.schema.js';

/**
 * F4, the invoice reads (ADR 0059 section 2): GET /v1/invoices and GET /v1/invoices/:id. The POS view shapes become the
 * contract, with the ids and the document status an API answer needs. No cost or margin anywhere (plan 2.5). Every value
 * is invented.
 */
const summary = {
  id: '0196f000-0000-7000-8000-0000000006a1',
  number: 'INV-000012',
  branchId: '0196f000-0000-7000-8000-0000000001a1',
  partyId: '0196f000-0000-7000-8000-000000000501',
  invoiceDate: '2026-11-20',
  issuedAt: '2026-11-20T05:12:00.000Z',
  customerName: 'Shirin Akter',
  total: '3000.00',
  paid: '400.00',
  due: '2600.00',
  status: 'posted',
  paymentStatus: 'partly_paid',
};

const detail = {
  ...summary,
  soldBy: 'Sample Cashier',
  subtotal: '3000.00',
  discount: '0.00',
  lines: [
    { description: 'Clutch cable, 150 cc', quantity: '3.000', unitPrice: '1000.00', amount: '3000.00' },
  ],
  payments: [
    {
      receivedAt: '2026-11-21T06:00:00.000Z',
      receiptNumber: 'RC-SHW-000004',
      method: 'cash',
      amount: '400.00',
      externalRef: null,
    },
  ],
};

describe('invoiceSummarySchema and invoiceDetailSchema', () => {
  it('parse a summary and a detail; money is a string with two decimals', () => {
    expect(invoiceSummarySchema.parse(summary)).toEqual(summary);
    expect(invoiceDetailSchema.parse(detail)).toEqual(detail);
    expect(invoiceSummarySchema.safeParse({ ...summary, total: 3000 }).success).toBe(false);
  });

  it('the payment status is paid, partly_paid or due; the document status posted or voided', () => {
    for (const paymentStatus of ['paid', 'partly_paid', 'due']) {
      expect(invoiceSummarySchema.safeParse({ ...summary, paymentStatus }).success).toBe(true);
    }
    expect(invoiceSummarySchema.safeParse({ ...summary, paymentStatus: 'overdue' }).success).toBe(false);
    expect(invoiceSummarySchema.safeParse({ ...summary, status: 'voided' }).success).toBe(true);
    expect(invoiceSummarySchema.safeParse({ ...summary, status: 'draft' }).success).toBe(false);
  });

  it('carry no cost: a cost key is dropped, never passed on', () => {
    const parsed = invoiceDetailSchema.parse({
      ...detail,
      costTotal: '1800.00',
      lines: [{ ...detail.lines[0], costAmount: '1800.00' }],
    });
    expect(JSON.stringify(parsed)).not.toMatch(/cost/i);
  });

  it('a list page has items and an opaque cursor', () => {
    expect(invoiceListResponseSchema.parse({ items: [summary], nextCursor: null }).items).toHaveLength(1);
  });
});

describe('invoiceListQuerySchema', () => {
  it('filters by party and branch, both optional ids; the limit defaults', () => {
    expect(invoiceListQuerySchema.parse({})).toEqual({ limit: 25 });
    expect(invoiceListQuerySchema.parse({ partyId: summary.partyId, limit: '10' })).toEqual({
      partyId: summary.partyId,
      limit: 10,
    });
    expect(invoiceListQuerySchema.safeParse({ partyId: 'not-an-id' }).success).toBe(false);
    expect(invoiceListQuerySchema.safeParse({ businessId: summary.partyId }).success).toBe(false);
  });
});

describe('sales.invoice.view (ADR 0059 section 2)', () => {
  it('is a code, and every default role holds it', () => {
    expect(PERMISSIONS).toContain('sales.invoice.view');
    for (const codes of Object.values(DEFAULT_ROLE_PERMISSIONS)) {
      expect(codes).toContain('sales.invoice.view');
    }
  });
});
