import { recordPaymentSchema, type PaymentMethod, type RecordPaymentInput } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useServices } from '../../app/servicesContext';
import { useActiveBusinessId } from '../../store/activeBusinessStore';

/** What the form holds: plain strings, as typed. `target` is an invoice id, or "advance". */
export interface PaymentFormValues {
  target: string;
  amount: string;
  method: PaymentMethod;
  externalRef: string;
}

/** "12500" → "12500.00", "12500.5" → "12500.50", commas dropped. Text only: no arithmetic on money. */
function toMoneyString(typed: string): string {
  const s = typed.replace(/[,\s]/g, '');
  if (/^\d+$/.test(s)) return `${s}.00`;
  if (/^\d+\.\d$/.test(s)) return `${s}0`;
  return s;
}

/** Form values to the shared payment body, checked with the shared schema (the server checks it again). */
export function toPaymentInput(partyId: string, v: PaymentFormValues) {
  return recordPaymentSchema.safeParse({
    partyId,
    invoiceId: v.target === 'advance' ? null : v.target,
    method: v.method,
    amount: toMoneyString(v.amount),
    externalRef: v.method === 'cash' ? null : v.externalRef,
    // This form has no note field yet.
    note: null,
  });
}

/** Records one payment. The caller keeps the Idempotency-Key, so a retry sends the same key. */
export function useRecordPayment(partyId: string) {
  const { salesPayments } = useServices();
  const businessId = useActiveBusinessId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, key }: { input: RecordPaymentInput; key: string }) =>
      salesPayments.recordPayment(input, key),
    // What the customer owes has changed; the profile reads it again next time.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['partyDues', businessId, partyId] }),
  });
}
