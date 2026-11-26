import type { RecordedPayment, RecordPaymentInput } from '../SalesPaymentRecorder.js';

/** What SalesManager needs to take a payment at the sale (ADR 0022 step 7): ADR 0016's recorder, in the same transaction. */
export interface ISalesPaymentRecorder {
  record(input: RecordPaymentInput): Promise<RecordedPayment>;
}
