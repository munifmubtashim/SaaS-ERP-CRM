import type {
  CustomerDues,
  ErrorCode,
  PartyDetail,
  PartyListResponse,
  RecordPaymentInput,
  SalesPayment,
} from '@erp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import {
  ApiRequestError,
  type DemoService,
  type IPartyService,
  type ISalesPaymentService,
} from '../../services';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { RecordPaymentPage } from './RecordPaymentPage';

// Obviously fake sample data only.
const BIZ_A = '0196f000-0000-7000-8000-0000000000a1';
const ID = '0196f000-0000-7000-8000-000000c00001';
const INVOICE = '0196f000-0000-7000-8000-000000000201';

const profile: PartyDetail = {
  id: ID,
  businessId: BIZ_A,
  code: 'C-0001',
  name: 'Abdur Rahman',
  nameBn: 'আব্দুর রহমান',
  kind: 'person',
  isCustomer: true,
  isSupplier: false,
  phone: '+8801700000001',
  altPhone: null,
  email: null,
  address: null,
  area: 'Mirpur',
  status: 'active',
  createdAt: '2026-11-01T04:00:00.000Z',
  updatedAt: '2026-11-01T04:00:00.000Z',
  version: 1,
  nidLast4: null,
  creditLimit: null,
  payTermDays: null,
  onCreditHold: false,
  isWalkIn: false,
};

const dues: CustomerDues = {
  partyId: ID,
  totalDue: '135000.00',
  advance: '0.00',
  openInvoices: [
    {
      invoiceId: INVOICE,
      invoiceNumber: 'INV-000101',
      invoiceDate: '2026-11-02T04:00:00.000Z',
      total: '185000.00',
      paid: '50000.00',
      due: '135000.00',
    },
  ],
};

class FakeParty implements Pick<IPartyService, 'list' | 'get'> {
  constructor(public failWith?: Error) {}
  list(): Promise<PartyListResponse> {
    return Promise.reject(new Error('not used'));
  }
  async get(): Promise<PartyDetail> {
    if (this.failWith) throw this.failWith;
    return profile;
  }
}

/** The dues (party.dues) and the payments (salesPayments): records every payment request; fails the first `failures`. */
class FakeSales implements Pick<IPartyService, 'dues'>, ISalesPaymentService {
  requests: { input: RecordPaymentInput; key: string }[] = [];
  constructor(
    private readonly answer: CustomerDues = dues,
    private failures = 0,
  ) {}
  async dues(): Promise<CustomerDues> {
    return this.answer;
  }
  async recordPayment(input: RecordPaymentInput, idempotencyKey: string): Promise<SalesPayment> {
    this.requests.push({ input, key: idempotencyKey });
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error('network down');
    }
    return {
      id: '0196f000-0000-7000-8000-000000000301',
      receiptNumber: 'R-000007',
      partyId: input.partyId,
      invoiceId: input.invoiceId,
      branchId: '0196f000-0000-7000-8000-0000000000b1',
      method: input.method,
      externalRef: input.externalRef ?? null,
      amount: input.amount,
      status: 'posted',
      receivedAt: '2026-11-21T04:00:00.000Z',
      note: input.note ?? null,
    };
  }
}

const apiError = (status: number, code: ErrorCode) =>
  new ApiRequestError(status, { code, message: code, fields: [], requestId: 'test' });

function renderPage(
  customers: FakeParty,
  sales: FakeSales,
  locale: 'en' | 'bn' = 'en',
  demo: ReadonlySet<DemoService> = new Set(),
) {
  const party: IPartyService = {
    // These fakes answer one customer whatever is asked.
    list: () => customers.list(),
    get: () => customers.get(),
    dues: () => sales.dues(),
    create: () => Promise.reject(new Error('This test never adds a customer.')),
    update: () => Promise.reject(new Error('This test never edits a customer.')),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ServicesContext.Provider
      value={fakeServices(new FakeHealthService(new Error('unused')), { party, salesPayments: sales, demo })}
    >
      <QueryClientProvider client={client}>
        <I18nProvider locale={locale}>
          <MemoryRouter initialEntries={[`/customers/${ID}/payment`]}>
            <Routes>
              <Route path="customers/:id/payment" element={<RecordPaymentPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
}

const typeAmount = (value: string) =>
  fireEvent.change(screen.getByLabelText('Amount (৳)'), { target: { value } });
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
/** "Continue" validates asynchronously; wait until the confirm step is on screen. */
async function continueToConfirm() {
  click('Continue');
  await screen.findByRole('heading', { name: 'Check before recording' });
}

describe('RecordPaymentPage (mock data)', () => {
  it('names the customer and what they owe, and starts on their open invoice, paid in cash', async () => {
    renderPage(new FakeParty(), new FakeSales());
    expect(await screen.findByRole('heading', { name: 'Record payment' })).toBeInTheDocument();
    expect(screen.getByText('Abdur Rahman')).toBeInTheDocument();
    expect(await screen.findByLabelText('Payment for')).toHaveValue(INVOICE);
    expect(screen.getByRole('radio', { name: 'Cash' })).toBeChecked();
    expect(screen.queryByLabelText('Transaction id')).not.toBeInTheDocument();
  });

  it('has no date field: the server sets the business date', async () => {
    const { container } = renderPage(new FakeParty(), new FakeSales());
    await screen.findByLabelText('Payment for');
    expect(container.querySelector('input[type="date"], input[type="datetime-local"]')).toBeNull();
    expect(screen.queryByLabelText(/date/i)).not.toBeInTheDocument();
  });

  it('refuses a zero, blank or non-number amount, and sends nothing', async () => {
    const sales = new FakeSales();
    renderPage(new FakeParty(), sales);
    await screen.findByLabelText('Payment for');
    for (const value of ['', '0', 'abc', '12.345']) {
      typeAmount(value);
      click('Continue');
      expect(await screen.findByText(/Enter an amount above zero/)).toBeInTheDocument();
    }
    expect(sales.requests).toHaveLength(0);
  });

  it('asks for the transaction id for bKash, Bank and Card', async () => {
    renderPage(new FakeParty(), new FakeSales());
    await screen.findByLabelText('Payment for');
    typeAmount('5000');
    fireEvent.click(screen.getByRole('radio', { name: 'bKash' }));
    click('Continue');
    expect(await screen.findByText('Enter the transaction id for this method.')).toBeInTheDocument();
  });

  it('confirms in words what will be recorded, then records it once and shows the receipt', async () => {
    const sales = new FakeSales();
    renderPage(new FakeParty(), sales);
    await screen.findByLabelText('Payment for');
    typeAmount('5000');
    fireEvent.click(screen.getByRole('radio', { name: 'bKash' }));
    fireEvent.change(screen.getByLabelText('Transaction id'), { target: { value: ' TXN-0001 ' } });
    click('Continue');
    expect(
      await screen.findByText('Record ৳5,000.00 by bKash from Abdur Rahman for invoice INV-000101?'),
    ).toBeInTheDocument();
    expect(sales.requests).toHaveLength(0);

    click('Record payment');
    expect(await screen.findByRole('heading', { name: 'Payment recorded' })).toBeInTheDocument();
    expect(screen.getByText('R-000007')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to customer' })).toHaveAttribute(
      'href',
      `/customers/${ID}`,
    );
    expect(sales.requests).toHaveLength(1);
    expect(sales.requests[0]?.input).toEqual({
      partyId: ID,
      invoiceId: INVOICE,
      method: 'bkash',
      amount: '5000.00',
      externalRef: 'TXN-0001',
      note: null,
    });
  });

  it('retries a failed request with the same Idempotency-Key, so a payment is never recorded twice', async () => {
    const sales = new FakeSales(dues, 1);
    renderPage(new FakeParty(), sales);
    await screen.findByLabelText('Payment for');
    typeAmount('2500.5');
    await continueToConfirm();
    click('Record payment');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not confirm the payment.');
    click('Try again');
    expect(await screen.findByRole('heading', { name: 'Payment recorded' })).toBeInTheDocument();
    expect(sales.requests).toHaveLength(2);
    expect(sales.requests[0]?.input.amount).toBe('2500.50');
    expect(sales.requests[1]?.key).toBe(sales.requests[0]?.key);
  });

  it('"Change" goes back to the form with the values kept', async () => {
    renderPage(new FakeParty(), new FakeSales());
    await screen.findByLabelText('Payment for');
    typeAmount('5000');
    await continueToConfirm();
    click('Change');
    expect(screen.getByLabelText('Amount (৳)')).toHaveValue('5000');
  });

  it('takes an advance when nothing is due: no invoice, and the confirm says so', async () => {
    const sales = new FakeSales({ partyId: ID, totalDue: '0.00', advance: '0.00', openInvoices: [] });
    renderPage(new FakeParty(), sales);
    expect(await screen.findByLabelText('Payment for')).toHaveValue('advance');
    typeAmount('10000');
    await continueToConfirm();
    expect(
      screen.getByText('Record ৳10,000.00 by Cash from Abdur Rahman as an advance (no invoice yet)?'),
    ).toBeInTheDocument();
    click('Record payment');
    await screen.findByRole('heading', { name: 'Payment recorded' });
    expect(sales.requests[0]?.input.invoiceId).toBeNull();
  });

  it('shows "not found" with a way back for a customer outside the active business', async () => {
    renderPage(new FakeParty(apiError(404, 'NOT_FOUND')), new FakeSales());
    expect(await screen.findByText('This customer was not found in this business.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to customers' })).toHaveAttribute('href', '/customers');
  });

  it('renders in Bangla', async () => {
    renderPage(new FakeParty(), new FakeSales(), 'bn');
    expect(await screen.findByRole('heading', { name: 'টাকা জমা নিন' })).toBeInTheDocument();
  });
});

describe('the Demo data badge (task 4, ADR 0057 P3)', () => {
  it('marks the payment form while payments are sample (sales.payments), and not when they are real', async () => {
    const sample = renderPage(new FakeParty(), new FakeSales(), 'en', new Set(['sales.payments']));
    expect(await sample.findByText('Demo data')).toBeInTheDocument();
    sample.unmount();
    renderPage(new FakeParty(), new FakeSales());
    await screen.findByRole('heading', { name: 'Record payment' });
    expect(screen.queryByText('Demo data')).not.toBeInTheDocument();
  });
});
