import { AppError } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import type { ISalesPaymentQuery, NewSalesPayment } from './contracts/ISalesPaymentQuery.js';
import { BankPayment, BkashPayment, CardPayment, CashPayment } from './paymentMethods.js';
import { SalesPaymentRecorder, type RecordPaymentInput } from './SalesPaymentRecorder.js';
import { FakeNumberSeries } from './test/FakeNumberSeries.js';
import { FakePostingService } from './test/FakePostingService.js';

/** ADR 0016 tests 1 to 4, with the ADR 0012 fakes. The route-level tests 5–10 need A15's table (#64). */
const BRANCH = '01937000-0000-7000-8000-0000000000e0';
const PARTY = '01937000-0000-7000-8000-0000000000c1';
const PAYMENT = '01937000-0000-7000-8000-0000000000d1';
const INVOICE = '01937000-0000-7000-8000-0000000000d2';

class FakePaymentQuery implements ISalesPaymentQuery {
  inserted: NewSalesPayment[] = [];
  async newPaymentId(): Promise<string> {
    return PAYMENT;
  }
  async insertPayment(payment: NewSalesPayment): Promise<void> {
    this.inserted.push(payment);
  }
}

function setup() {
  const posting = new FakePostingService();
  const numbers = new FakeNumberSeries('RC-UTT-');
  const query = new FakePaymentQuery();
  const recorder = new SalesPaymentRecorder(query, posting, numbers, [
    new CashPayment(),
    new BankPayment(),
    new BkashPayment(),
    new CardPayment(),
  ]);
  return { posting, numbers, query, recorder };
}

const input = (fields: Partial<RecordPaymentInput> = {}): RecordPaymentInput => ({
  branchId: BRANCH,
  partyId: PARTY,
  invoiceId: INVOICE,
  method: 'cash',
  amount: '12500.00',
  externalRef: null,
  date: '2026-11-22',
  ...fields,
});

describe('SalesPaymentRecorder.record (ADR 0016)', () => {
  it.each([
    ['cash', 'cash', null],
    ['bank', 'bank', 'TRX-1'],
    ['bkash', 'mobile_money', '8N7A6B5C'],
    ['card', 'card_clearing', 'AUTH-1'],
  ] as const)(
    '1. %s posts Dr %s, Cr receivable with the party, for the same amount',
    async (method, role, ref) => {
      const { posting, query, recorder } = setup();
      const result = await recorder.record(input({ method, externalRef: ref }));
      const journal = posting.journals[0];
      expect(journal?.draft?.lines).toEqual([
        { role, debit: '12500.00', credit: '0.00' },
        { role: 'receivable', debit: '0.00', credit: '12500.00', partyId: PARTY },
      ]);
      expect(journal?.draft?.source).toEqual({ type: 'sales_payment', id: PAYMENT });
      expect(query.inserted).toEqual([
        {
          id: PAYMENT,
          branchId: BRANCH,
          partyId: PARTY,
          invoiceId: INVOICE,
          method,
          amount: '12500.00',
          externalRef: ref,
          receiptNumber: 'RC-UTT-000001',
          journalId: journal?.journalId,
        },
      ]);
      expect(result).toEqual({
        paymentId: PAYMENT,
        receiptNumber: 'RC-UTT-000001',
        journalId: journal?.journalId,
      });
    },
  );

  it('2. an advance (no invoice) credits customer_advance, never an income role', async () => {
    const { posting, recorder } = setup();
    await recorder.record(input({ invoiceId: null }));
    expect(posting.journals[0]?.draft?.lines[1]).toEqual({
      role: 'customer_advance',
      debit: '0.00',
      credit: '12500.00',
      partyId: PARTY,
    });
  });

  it.each(['bank', 'bkash', 'card'] as const)(
    '3. %s without an external id is refused before any number or journal',
    async (method) => {
      const { posting, numbers, query, recorder } = setup();
      const error = await recorder.record(input({ method, externalRef: null })).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).fields[0]?.code).toBe('payment.external_ref_required');
      expect(numbers.taken).toEqual([]);
      expect(posting.journals).toEqual([]);
      expect(query.inserted).toEqual([]);
    },
  );

  it.each([
    ['zero', '0.00'],
    ['negative', '-1.00'],
    ['not money', '12.5'],
  ])('a %s amount is refused before anything', async (_case, amount) => {
    const { posting, query, recorder } = setup();
    await expect(recorder.record(input({ amount }))).rejects.toThrow(AppError);
    expect(posting.journals).toEqual([]);
    expect(query.inserted).toEqual([]);
  });

  it('an unknown method is refused', async () => {
    const { recorder } = setup();
    await expect(recorder.record(input({ method: 'nagad' }))).rejects.toThrow(AppError);
  });

  it('4. if posting throws, no payment insert is attempted', async () => {
    const { posting, query, recorder } = setup();
    posting.failNextWith = new AppError('CONFLICT', 'Day closed', [
      { path: 'date', code: 'period.locked', message: 'Day closed' },
    ]);
    await expect(recorder.record(input())).rejects.toThrow('Day closed');
    expect(query.inserted).toEqual([]);
  });
});
