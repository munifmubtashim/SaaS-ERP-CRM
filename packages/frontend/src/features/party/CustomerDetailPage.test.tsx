import type { CustomerDues, ErrorCode, PartyDetail, PartyListResponse } from '@erp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import {
  ApiRequestError,
  type IHttpPatch,
  type DemoService,
  type IHttpClient,
  type IPartyService,
} from '../../services';
import { PartyService } from '../../services/partyService';
import { activeBusinessStore } from '../../store/activeBusinessStore';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { CustomerDetailPage } from './CustomerDetailPage';

// Obviously fake sample data only.
const BIZ_A = '0196f000-0000-7000-8000-0000000000a1';
const BIZ_B = '0196f000-0000-7000-8000-0000000000b1';
const ID = '0196f000-0000-7000-8000-000000c00001';

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
  address: 'House 12, Road 3',
  area: 'Mirpur',
  status: 'active',
  createdAt: '2026-11-01T04:00:00.000Z',
  updatedAt: '2026-11-01T04:00:00.000Z',
  version: 1,
  nidLast4: '1234',
  creditLimit: '50000.00',
  payTermDays: 30,
  onCreditHold: false,
  isWalkIn: false,
};

const dues: CustomerDues = {
  partyId: ID,
  totalDue: '137500.00',
  advance: '0.00',
  openInvoices: [
    {
      invoiceId: '0196f000-0000-7000-8000-000000000201',
      invoiceNumber: 'INV-000101',
      invoiceDate: '2026-11-02',
      total: '185000.00',
      paid: '50000.00',
      due: '135000.00',
    },
    {
      invoiceId: '0196f000-0000-7000-8000-000000000202',
      invoiceNumber: 'INV-000118',
      invoiceDate: '2026-11-10',
      total: '2500.00',
      paid: '0.00',
      due: '2500.00',
    },
  ],
};

/** Knows one customer, in business A only, like the tenant scope. Fails with `failWith` when given. */
class FakeParty implements Pick<IPartyService, 'list' | 'get'> {
  calls = 0;
  constructor(
    private readonly answer: PartyDetail = profile,
    public failWith?: Error,
  ) {}
  list(): Promise<PartyListResponse> {
    return Promise.reject(new Error('not used'));
  }
  async get(id: string): Promise<PartyDetail> {
    this.calls += 1;
    if (this.failWith) throw this.failWith;
    if (activeBusinessStore.get() !== BIZ_A || id !== ID) throw notFound();
    return this.answer;
  }
}

/** The dues' fake: dues now come from the party service (task 4 T2, key party.dues). */
class FakeSales implements Pick<IPartyService, 'dues'> {
  calls = 0;
  constructor(
    private readonly answer: CustomerDues = dues,
    public failWith?: Error,
  ) {}
  async dues(): Promise<CustomerDues> {
    this.calls += 1;
    if (this.failWith) throw this.failWith;
    return this.answer;
  }
}

function apiError(status: number, code: ErrorCode) {
  return new ApiRequestError(status, { code, message: code, fields: [], requestId: 'test' });
}
const notFound = () => apiError(404, 'NOT_FOUND');

function renderPage(
  customers: Pick<IPartyService, 'list' | 'get'>,
  duesOf: Pick<IPartyService, 'dues'>,
  locale: 'en' | 'bn' = 'en',
  demo: ReadonlySet<DemoService> = new Set(),
) {
  const party: IPartyService = {
    list: (query) => customers.list(query),
    get: (id) => customers.get(id),
    dues: (partyId) => duesOf.dues(partyId),
    create: () => Promise.reject(new Error('This test never adds a customer.')),
    update: () => Promise.reject(new Error('This test never edits a customer.')),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ServicesContext.Provider
      value={fakeServices(new FakeHealthService(new Error('unused')), { party, demo })}
    >
      <QueryClientProvider client={client}>
        <I18nProvider locale={locale}>
          <MemoryRouter initialEntries={[`/customers/${ID}`]}>
            <Routes>
              <Route path="customers/:id" element={<CustomerDetailPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
}

afterEach(() => act(() => activeBusinessStore.set(BIZ_A)));

describe('CustomerDetailPage (mock data)', () => {
  it('shows loading, then the customer: name, Bangla name, code, phone, area and address', async () => {
    renderPage(new FakeParty(), new FakeSales());
    expect(screen.getByText('Loading customer…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Abdur Rahman' })).toBeInTheDocument();
    expect(screen.getByText('আব্দুর রহমান')).toHaveAttribute('lang', 'bn');
    expect(screen.getByText('C-0001')).toBeInTheDocument();
    expect(screen.getByText('+8801700000001')).toBeInTheDocument();
    expect(screen.getByText('House 12, Road 3, Mirpur')).toBeInTheDocument();
  });

  it('shows only the last four NID digits, and never a full NID the API wrongly sent', async () => {
    const fullNid = '1990000001234';
    // The real PartyService checks the reply with partyDetailSchema, which drops every unknown key.
    const http: IHttpClient & IHttpPatch = {
      getJson: async (_path, schema) => schema.parse({ ...profile, nid: fullNid, nationalId: fullNid }),
      postJson: () => Promise.reject(new Error('not used')),
      post: () => Promise.reject(new Error('not used')),
      patchJson: () => Promise.reject(new Error('not used')),
    };
    const { container } = renderPage(new PartyService(http), new FakeSales());
    expect(await screen.findByText('•••• 1234')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain(fullNid);
  });

  it('leads with the total due in taka, lakh-grouped, with the open invoices below', async () => {
    renderPage(new FakeParty(), new FakeSales());
    const hero = await screen.findByLabelText('Total due');
    expect(hero).toHaveTextContent('৳1,37,500.00');
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    const first = within(rows[0] as HTMLElement)
      .getAllByRole('cell')
      .map((c) => c.textContent);
    expect(first).toEqual(['INV-000101', '02/11/2026', '৳1,85,000.00', '৳50,000.00', '৳1,35,000.00']);
  });

  it('shows the credit limit and pay terms, and "No limit" when none is set', async () => {
    const { unmount } = renderPage(new FakeParty(), new FakeSales());
    expect(await screen.findByText('৳50,000.00')).toBeInTheDocument();
    expect(screen.getByText('30 days')).toBeInTheDocument();
    unmount();
    renderPage(new FakeParty({ ...profile, creditLimit: null, payTermDays: null }), new FakeSales());
    expect(await screen.findByText('No limit')).toBeInTheDocument();
    expect(screen.getByText('Business default')).toBeInTheDocument();
  });

  it('marks a credit hold and an inactive customer in words, not by colour alone', async () => {
    renderPage(new FakeParty({ ...profile, onCreditHold: true, status: 'inactive' }), new FakeSales());
    expect(await screen.findByText('On credit hold')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('says so when nothing is due, and shows an advance the customer has paid', async () => {
    renderPage(
      new FakeParty(),
      new FakeSales({ partyId: ID, totalDue: '0.00', advance: '5000.00', openInvoices: [] }),
    );
    expect(await screen.findByText('Nothing due.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Advance held')).toHaveTextContent('৳5,000.00');
  });

  it('shows a 9-digit amount in full', async () => {
    const big = { ...dues, totalDue: '123456789.00' };
    renderPage(new FakeParty(), new FakeSales(big));
    expect(await screen.findByLabelText('Total due')).toHaveTextContent('৳12,34,56,789.00');
  });

  it('lets both cards shrink to a phone screen, so a wide invoice row never widens the page', async () => {
    // jsdom can't measure layout. Without min-w-0, a grid item can't be narrower than its content, so a
    // 9-digit invoice row made the page wider than a 390 px phone (checked in Chromium on #51).
    const { container } = renderPage(new FakeParty(), new FakeSales({ ...dues, totalDue: '123456789.00' }));
    await screen.findByLabelText('Total due');
    const cards = container.querySelectorAll('section.glass');
    expect(cards).toHaveLength(2);
    for (const card of cards) expect(card).toHaveClass('min-w-0');
  });

  it.each([
    ['en', ['Total', 'Paid', 'Due']],
    ['bn', ['মোট', 'পরিশোধ', 'বাকি']],
  ] as const)(
    'on a narrow card (%s), the open invoices stack with each amount labelled, so Paid and Due never scroll away',
    async (locale, labels) => {
      // jsdom can't measure layout. In Chromium on #51, a 9-digit invoice in a 390 px phone pushed Paid and
      // Due off the side of the card (the table scrolled inside it). Now the table sits in a container query:
      // below 36rem each row is a block and every amount cell names its column through data-label.
      const nineDigits: CustomerDues = {
        ...dues,
        totalDue: '123456789.00',
        openInvoices: [
          {
            invoiceId: '0196f000-0000-7000-8000-000000000203',
            invoiceNumber: 'INV-000180',
            invoiceDate: '2026-11-19',
            total: '123456789.00',
            paid: '0.00',
            due: '123456789.00',
          },
        ],
      };
      const { container } = renderPage(new FakeParty(), new FakeSales(nineDigits), locale);
      const table = await screen.findByRole('table');
      expect(table.parentElement).toHaveClass('@container');
      expect(table.parentElement).not.toHaveClass('overflow-x-auto');
      expect(table).toHaveClass('block', '@xl:table');

      const [row] = within(table).getAllByRole('row').slice(1);
      const amounts = within(row as HTMLElement)
        .getAllByRole('cell')
        .slice(2);
      expect(amounts.map((cell) => cell.getAttribute('data-label'))).toEqual(labels);
      for (const cell of amounts) expect(cell).toHaveClass('before:content-[attr(data-label)]');
      // The labels come from CSS, so the cell text stays just the amount.
      const due = locale === 'en' ? '৳12,34,56,789.00' : '৳১২,৩৪,৫৬,৭৮৯.০০';
      expect(amounts[2]?.textContent).toBe(due);

      // Screen readers still get the column headers.
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent);
      expect(headers.slice(2)).toEqual(labels);
      expect(container.querySelector('thead')).toHaveClass('sr-only', '@xl:not-sr-only');
    },
  );

  it('offers "Record payment" as the next action', async () => {
    renderPage(new FakeParty(), new FakeSales());
    const link = await screen.findByRole('link', { name: 'Record payment' });
    expect(link).toHaveAttribute('href', `/customers/${ID}/payment`);
  });

  it('shows "not found" with a way back for an unknown customer', async () => {
    renderPage(new FakeParty(profile, notFound()), new FakeSales());
    expect(await screen.findByText('This customer was not found in this business.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to customers' })).toHaveAttribute('href', '/customers');
  });

  it('shows a no-permission state on 403', async () => {
    renderPage(new FakeParty(profile, apiError(403, 'FORBIDDEN')), new FakeSales());
    expect(await screen.findByText('You do not have permission to see this customer.')).toBeInTheDocument();
  });

  it('shows an error with a retry that asks again', async () => {
    const party = new FakeParty(profile, new Error('offline'));
    renderPage(party, new FakeSales());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load this customer.');
    party.failWith = undefined;
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Abdur Rahman' })).toBeInTheDocument();
    expect(party.calls).toBe(2);
  });

  it('keeps the profile on screen when only the dues fail, and retries the dues alone', async () => {
    const party = new FakeParty();
    const sales = new FakeSales(dues, new Error('offline'));
    renderPage(party, sales);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load the dues.');
    expect(screen.getByRole('heading', { name: 'Abdur Rahman' })).toBeInTheDocument();
    sales.failWith = undefined;
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Total due')).toHaveTextContent('৳1,37,500.00');
    expect(party.calls).toBe(1);
  });

  it('stops showing the customer after a switch to another business (ADR 0007)', async () => {
    renderPage(new FakeParty(), new FakeSales());
    await screen.findByRole('heading', { name: 'Abdur Rahman' });
    act(() => activeBusinessStore.set(BIZ_B));
    expect(await screen.findByText('This customer was not found in this business.')).toBeInTheDocument();
    expect(screen.queryByText('Abdur Rahman')).not.toBeInTheDocument();
  });

  it('works in Bangla, with Bangla digits in amounts', async () => {
    renderPage(new FakeParty(), new FakeSales(), 'bn');
    expect(await screen.findByLabelText('মোট বাকি')).toHaveTextContent('৳১,৩৭,৫০০.০০');
    expect(screen.getByRole('link', { name: 'টাকা জমা নিন' })).toBeInTheDocument();
  });
});

describe('the Demo data badge (task 4, frontend-wiring.md)', () => {
  it('marks the dues while they are sample (party.dues), and the profile only while it is sample (party)', async () => {
    const duesOnly = renderPage(new FakeParty(), new FakeSales(), 'en', new Set(['party.dues']));
    await screen.findByLabelText('Total due');
    expect(screen.getAllByText('Demo data')).toHaveLength(1);
    duesOnly.unmount();
    renderPage(new FakeParty(), new FakeSales(), 'en', new Set(['party', 'party.dues']));
    await screen.findByLabelText('Total due');
    expect(screen.getAllByText('Demo data')).toHaveLength(2);
  });
});
