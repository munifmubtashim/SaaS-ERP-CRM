import { recordPaymentSchema, type RecordPaymentInput, type SalesPayment } from '@erp/shared';
import type { ISalesPaymentService } from '../salesPaymentService';

/** The sample branch every sample payment is taken at. Invented. */
const SAMPLE_BRANCH = '0196f000-0000-7000-8000-0000000001a1';

/**
 * Sample customer payments, marked "Demo data" by the screens (frontend-wiring.md). Stays the default until invoice
 * reads exist: the POS pays sample invoices, whose ids the API doesn't know. Behaves like the API where it can: the
 * same key replays the first answer, and each new payment gets the next receipt number.
 */
export class SampleSalesPaymentService implements ISalesPaymentService {
  private readonly byKey = new Map<string, SalesPayment>();
  private nextReceipt = 1;

  async recordPayment(payment: RecordPaymentInput, idempotencyKey: string): Promise<SalesPayment> {
    const replay = this.byKey.get(idempotencyKey);
    if (replay) return replay;
    const parsed = recordPaymentSchema.parse(payment);
    const recorded: SalesPayment = {
      id: crypto.randomUUID(),
      receiptNumber: `RC-DEMO-${String(this.nextReceipt++).padStart(6, '0')}`,
      partyId: parsed.partyId,
      invoiceId: parsed.invoiceId,
      branchId: SAMPLE_BRANCH,
      method: parsed.method,
      externalRef: parsed.externalRef,
      amount: parsed.amount,
      status: 'posted',
      receivedAt: new Date().toISOString(),
      note: parsed.note,
    };
    this.byKey.set(idempotencyKey, recorded);
    return recorded;
  }
}
