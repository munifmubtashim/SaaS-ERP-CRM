import { AppError } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import type { IClock } from './contracts/IClock.js';
import type { ISalesPaymentQuery, NewSalesPayment } from './contracts/ISalesPaymentQuery.js';
import { BankPayment, BkashPayment, CardPayment, CashPayment } from './paymentMethods.js';
import { SalesPaymentRecorder, type RecordPaymentInput } from './SalesPaymentRecorder.js';
import { FakeNumberSeries } from './test/FakeNumberSeries.js';
import { FakePostingService } from './test/FakePostingService.js';

/**
 * ADR 0016 tests 1 to 4 with the ADR 0012 fakes, plus the #97/#99 review fixes: the business date comes from the
 * server's clock in Dhaka, never from the caller; a payment above the invoice's due is refused; the external
 * reference is stored trimmed; a payment method registered twice is a startup error. Route tests 5–10 need A15.
 */
const BRANCH = '01937000-0000-7000-8000-0000000000e0';
const PARTY = '01937000-0000-7000-8000-0000000000c1';
const PAYMENT = '01937000-0000-7000-8000-0000000000d1';
const INVOICE = '01937000-0000-7000-8000-0000000000d2';
/** 19:30 UTC on 21 Nov is 01:30 on 22 Nov in Dhaka (UTC+6). */
const clock: IClock = { now: () => new Date('2026-11-21T19:30:00Z') };

class FakePaymentQuery implements ISalesPaymentQuery {
  inserted: NewSalesPayment[] = [];
  asked: { invoiceId: string; partyId: string }[] = [];
  constructor(private readonly dues: Record<string, string> = { [INVOICE]: '20000.00' }) {}
  async newPaymentId(): Promise<string> {
    return PAYMENT;
  }
  async invoiceDueForUpdate(invoiceId: string, partyId: string): Promise<string | null> {
    this.asked.push({ invoiceId, partyId });
    return this.dues[invoiceId] ?? null;
  }
  async insertPayment(payment: NewSalesPayment): Promise<void> {
    this.inserted.push(payment);
  }
}

function setup(query = new FakePaymentQuery()) {
  const posting = new FakePostingService();
  const numbers = new FakeNumberSeries('RC-UTT-');
  const recorder = new SalesPaymentRecorder(query, posting, numbers, clock, [
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
  ...fields,
});

async function fieldCode(promise: Promise<unknown>): Promise<{ code: string; field: string | undefined }> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return { code: (error as AppError).code, field: (error as AppError).fields[0]?.code };
}

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
          receivedAt: new Date('2026-11-21T19:30:00Z'),
          note: null,
          createdBy: null,
        },
      ]);
      expect(result).toEqual({
        paymentId: PAYMENT,
        receiptNumber: 'RC-UTT-000001',
        journalId: journal?.journalId,
        receivedAt: '2026-11-21T19:30:00.000Z',
      });
    },
  );

  it('2. an advance (no invoice) credits customer_advance, never an income role, and checks no due', async () => {
    const { posting, query, recorder } = setup();
    await recorder.record(input({ invoiceId: null }));
    expect(posting.journals[0]?.draft?.lines[1]).toEqual({
      role: 'customer_advance',
      debit: '0.00',
      credit: '12500.00',
      partyId: PARTY,
    });
    expect(query.asked).toEqual([]);
  });

  it.each(['bank', 'bkash', 'card'] as const)(
    '3. %s without an external id is refused before any number or journal',
    async (method) => {
      const { posting, numbers, query, recorder } = setup();
      expect(await fieldCode(recorder.record(input({ method, externalRef: '   ' })))).toEqual({
        code: 'VALIDATION_FAILED',
        field: 'payment.external_ref_required',
      });
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

describe('review fixes on #99', () => {
  it("the journal date is today's business date in Dhaka from the server clock, not from the caller", async () => {
    const { posting, recorder } = setup();
    const withDate = { ...input(), date: '2020-01-01' } as RecordPaymentInput;
    await recorder.record(withDate);
    expect(posting.journals[0]?.draft?.date).toBe('2026-11-22');
  });

  it('a payment above the invoice due is refused with 409 payment.exceeds_due, before any number or journal', async () => {
    const { posting, numbers, query, recorder } = setup(new FakePaymentQuery({ [INVOICE]: '12499.99' }));
    expect(await fieldCode(recorder.record(input()))).toEqual({
      code: 'CONFLICT',
      field: 'payment.exceeds_due',
    });
    expect(query.asked).toEqual([{ invoiceId: INVOICE, partyId: PARTY }]);
    expect(numbers.taken).toEqual([]);
    expect(posting.journals).toEqual([]);
  });

  it('a payment of exactly the due is accepted', async () => {
    const { query, recorder } = setup(new FakePaymentQuery({ [INVOICE]: '12500.00' }));
    await recorder.record(input());
    expect(query.inserted).toHaveLength(1);
  });

  it("an invoice that isn't this party's (or doesn't exist) is 404 payment.invoice_not_found", async () => {
    const { posting, recorder } = setup(new FakePaymentQuery({}));
    expect(await fieldCode(recorder.record(input()))).toEqual({
      code: 'NOT_FOUND',
      field: 'payment.invoice_not_found',
    });
    expect(posting.journals).toEqual([]);
  });

  it('stores the note and the creator, and the time received is the server clock (ADR 0057)', async () => {
    const { recorder, query } = setup();
    const done = await recorder.record(input({ note: 'Paid at the counter', createdBy: PARTY }));
    expect(query.inserted[0]).toMatchObject({
      note: 'Paid at the counter',
      createdBy: PARTY,
      receivedAt: new Date('2026-11-21T19:30:00Z'),
    });
    expect(done.receivedAt).toBe('2026-11-21T19:30:00.000Z');
  });

  it('the external reference is stored trimmed', async () => {
    const { query, recorder } = setup();
    await recorder.record(input({ method: 'bkash', externalRef: '  8N7A6B5C \n' }));
    expect(query.inserted[0]?.externalRef).toBe('8N7A6B5C');
  });

  it('registering one payment method twice is an error at construction', () => {
    expect(
      () =>
        new SalesPaymentRecorder(
          new FakePaymentQuery(),
          new FakePostingService(),
          new FakeNumberSeries(),
          clock,
          [new CashPayment(), new CashPayment()],
        ),
    ).toThrow(/cash.*registered twice/);
  });

  it('a receipt number the caller took earlier (a sale, ADR 0015 order) is used, and no second number is taken', async () => {
    const { recorder, numbers, query } = setup();
    const recorded = await recorder.record(input({ receiptNumber: 'RC-UTT-000777' }));
    expect(recorded.receiptNumber).toBe('RC-UTT-000777');
    expect(numbers.taken).toEqual([]);
    expect(query.inserted[0]?.receiptNumber).toBe('RC-UTT-000777');
  });
});
