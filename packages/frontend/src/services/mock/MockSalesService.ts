import {
  formatMoney,
  parseMoney,
  subtractMoney,
  recordPaymentSchema,
  sumMoney,
  type CustomerDues,
  type OpenInvoice,
  type RecordPaymentInput,
  type SalesPayment,
} from '@erp/shared';
import type { ISalesService } from '../salesService';
import { findSampleParty, notFound, sampleNumber } from './MockPartyService';

// Synthetic sample amounts only: a bike, a service bill and a parts order, each part paid.
const SAMPLE_BILLS = [
  { total: '185000.00', paid: '50000.00' },
  { total: '2500.00', paid: '0.00' },
  { total: '64000.00', paid: '20000.00' },
];
/** One sample customer owes a 9-digit amount, to check that long amounts fit on screen. */
const BIG_BILL = { total: '123456789.00', paid: '0.00' };
const BIG_BILL_CUSTOMER = 18;

function sampleInvoices(n: number): OpenInvoice[] {
  // Every fourth customer owes nothing, so the empty state is easy to reach.
  if (n % 4 === 0) return [];
  const count = 1 + (n % 3);
  return Array.from({ length: count }, (_, i) => {
    const bill = n === BIG_BILL_CUSTOMER && i === 0 ? BIG_BILL : (SAMPLE_BILLS[(n + i) % 3] ?? BIG_BILL);
    const day = String(1 + ((n + i * 5) % 20)).padStart(2, '0');
    return {
      invoiceId: `0196f000-0000-7000-8000-0000001${String(n).padStart(3, '0')}${i}0`,
      invoiceNumber: `INV-${String(n * 10 + i).padStart(6, '0')}`,
      invoiceDate: `2026-11-${day}T04:00:00.000Z`,
      total: bill.total,
      paid: bill.paid,
      // Money only through the shared helpers: no float arithmetic.
      due: formatMoney(subtractMoney(parseMoney(bill.total), parseMoney(bill.paid))),
    };
  });
}

/** The one sample branch every mock payment is received in; the real server takes it from the request. */
const SAMPLE_BRANCH_ID = '0196f000-0000-7000-8000-0000000000c1';

/**
 * Stands in for the Sales routes until A15. Answers like the API will: only the active business's
 * customers (the tenant scope, ADR 0007), and dues that add up.
 */
export class MockSalesService implements ISalesService {
  /** Payments by Idempotency-Key, so a repeat returns the first result (ADR 0011). */
  private readonly payments = new Map<string, SalesPayment>();

  constructor(
    private readonly activeBusinessId: () => string,
    private readonly delayMs = 400,
  ) {}

  /** Stands in for GET /v1/parties/:id/dues. */
  async dues(partyId: string): Promise<CustomerDues> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    if (!findSampleParty(this.activeBusinessId(), partyId)) throw notFound();
    const n = sampleNumber(partyId);
    const openInvoices = sampleInvoices(n);
    return {
      partyId,
      totalDue: formatMoney(sumMoney(openInvoices.map((i) => parseMoney(i.due)))),
      advance: n % 6 === 0 ? '5000.00' : '0.00',
      openInvoices,
    };
  }

  /**
   * Stands in for POST /v1/payments. Shapes only: it does not change the dues above, and posts no journal
   * (A16, ADR 0016).
   */
  async recordPayment(input: RecordPaymentInput, idempotencyKey: string): Promise<SalesPayment> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const earlier = this.payments.get(idempotencyKey);
    if (earlier) return earlier;
    const body = recordPaymentSchema.parse(input);
    if (!findSampleParty(this.activeBusinessId(), body.partyId)) throw notFound();
    const n = this.payments.size + 1;
    const payment: SalesPayment = {
      ...body,
      id: `0196f000-0000-7000-8000-0000002${String(n).padStart(5, '0')}`,
      receiptNumber: `R-${String(n).padStart(6, '0')}`,
      branchId: SAMPLE_BRANCH_ID,
      status: 'posted',
      receivedAt: new Date().toISOString(),
    };
    this.payments.set(idempotencyKey, payment);
    return payment;
  }
}
