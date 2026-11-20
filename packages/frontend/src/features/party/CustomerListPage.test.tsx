import type { PartyDetail, PartyListItem, PartyListQueryInput, PartyListResponse } from '@erp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import { ApiRequestError, type IHttpClient, type IPartyService } from '../../services';
import { PartyService } from '../../services/partyService';
import { activeBusinessStore } from '../../store/activeBusinessStore';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { CustomerListPage } from './CustomerListPage';

// Obviously fake sample data only.
const BIZ_A = '0196f000-0000-7000-8000-0000000000a1';
const BIZ_B = '0196f000-0000-7000-8000-0000000000b1';

function customer(n: number, patch: Partial<PartyListItem> = {}): PartyListItem {
  const nn = String(n).padStart(2, '0');
  return {
    id: `0196f000-0000-7000-8000-0000000c00${nn}`,
    code: `C-00${nn}`,
    name: `Sample Customer ${nn}`,
    nameBn: null,
    kind: 'person',
    isCustomer: true,
    isSupplier: false,
    phone: `+88017000000${nn}`,
    area: 'Mirpur',
    status: 'active',
    ...patch,
  };
}

/** Answers from a fixed list per business, two rows a page, and records every query it receives. */
class FakePartyService implements IPartyService {
  readonly queries: (PartyListQueryInput & { businessId: string })[] = [];
  constructor(
    private readonly rows: Record<string, PartyListItem[]>,
    private readonly failWith?: Error,
  ) {}

  async list(query: PartyListQueryInput): Promise<PartyListResponse> {
    const businessId = activeBusinessStore.get();
    this.queries.push({ ...query, businessId });
    if (this.failWith) throw this.failWith;
    const search = query.search?.toLowerCase();
    const matching = (this.rows[businessId] ?? []).filter(
      (r) => !search || r.name.toLowerCase().includes(search),
    );
    const start = query.cursor ? Number(query.cursor) : 0;
    const end = start + 2;
    return { items: matching.slice(start, end), nextCursor: end < matching.length ? String(end) : null };
  }
  get(): Promise<PartyDetail> {
    return Promise.reject(new Error('The list page never asks for one customer.'));
  }
}

function renderPage(party: IPartyService, locale: 'en' | 'bn' = 'en') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ServicesContext.Provider value={fakeServices(new FakeHealthService(new Error('unused')), { party })}>
      <QueryClientProvider client={client}>
        <I18nProvider locale={locale}>
          <MemoryRouter>
            <CustomerListPage />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
}

const rowNames = () =>
  screen
    .getAllByRole('row')
    .slice(1) // the header row
    .map((row) => within(row).getAllByRole('cell')[1]?.textContent);

afterEach(() => act(() => activeBusinessStore.set(BIZ_A)));

describe('CustomerListPage (F1b, mock data)', () => {
  it('shows loading, then the first page of customers with their code, phone and area', async () => {
    renderPage(new FakePartyService({ [BIZ_A]: [customer(1), customer(2), customer(3)] }));
    expect(screen.getByText('Loading customers…')).toBeInTheDocument();
    expect(await screen.findByText('Sample Customer 01')).toBeInTheDocument();
    expect(rowNames()).toEqual(['Sample Customer 01', 'Sample Customer 02']);
    expect(screen.getByText('C-0001')).toBeInTheDocument();
    expect(screen.getByText('+8801700000001')).toBeInTheDocument();
    expect(screen.getAllByText('Mirpur')).toHaveLength(2);
  });

  it('shows the Bangla name under the name, and nothing extra when there is none', async () => {
    renderPage(new FakePartyService({ [BIZ_A]: [customer(1, { nameBn: 'নমুনা গ্রাহক এক' }), customer(2)] }));
    const bangla = await screen.findByText('নমুনা গ্রাহক এক');
    expect(bangla).toHaveAttribute('lang', 'bn');
    expect(rowNames()).toEqual(['Sample Customer 01নমুনা গ্রাহক এক', 'Sample Customer 02']);
  });

  it('never shows a national ID, even if the API sent one (ADR 0006 section 3)', async () => {
    // A fake API that wrongly sends NID fields. The real PartyService checks the reply with the shared
    // list schema, which drops every field that is not a list field.
    const nid = '0000000000123';
    const http: IHttpClient = {
      getJson: async (_path, schema) =>
        schema.parse({
          items: [{ ...customer(1), nid, nationalId: nid, nidCiphertext: nid }],
          nextCursor: null,
        }),
    };
    const party = new PartyService(http);
    const [row] = (await party.list({ role: 'customer' })).items;
    expect(Object.keys(row ?? {}).some((key) => /nid|national/i.test(key))).toBe(false);

    const { container } = renderPage(party);
    await screen.findByText('Sample Customer 01');
    expect(container.textContent).not.toContain(nid);
    expect(container.innerHTML).not.toContain(nid);
  });

  it('links each customer to their profile', async () => {
    renderPage(new FakePartyService({ [BIZ_A]: [customer(1)] }));
    const link = await screen.findByRole('link', { name: 'Sample Customer 01' });
    expect(link).toHaveAttribute('href', `/customers/${customer(1).id}`);
  });

  it('asks only for customers, never suppliers', async () => {
    const party = new FakePartyService({ [BIZ_A]: [customer(1)] });
    renderPage(party);
    await screen.findByText('Sample Customer 01');
    expect(party.queries.every((q) => q.role === 'customer')).toBe(true);
  });

  it('"Load more" adds the next page, and disappears on the last page', async () => {
    renderPage(new FakePartyService({ [BIZ_A]: [customer(1), customer(2), customer(3)] }));
    await screen.findByText('Sample Customer 01');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Sample Customer 03')).toBeInTheDocument();
    expect(rowNames()).toEqual(['Sample Customer 01', 'Sample Customer 02', 'Sample Customer 03']);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('searches as the user types and shows a "no match" state', async () => {
    const party = new FakePartyService({ [BIZ_A]: [customer(1), customer(2, { name: 'Karim Traders' })] });
    renderPage(party);
    await screen.findByText('Sample Customer 01');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search customers' }), {
      target: { value: 'karim' },
    });
    await waitFor(() => expect(rowNames()).toEqual(['Karim Traders']));
    expect(party.queries.at(-1)?.search).toBe('karim');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search customers' }), {
      target: { value: 'zzz' },
    });
    expect(await screen.findByText('No customer matches “zzz”.')).toBeInTheDocument();
  });

  it('filters by status', async () => {
    const party = new FakePartyService({ [BIZ_A]: [customer(1)] });
    renderPage(party);
    await screen.findByText('Sample Customer 01');
    fireEvent.click(screen.getByRole('button', { name: 'Inactive' }));
    await waitFor(() => expect(party.queries.at(-1)?.status).toBe('inactive'));
    expect(screen.getByRole('button', { name: 'Inactive' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows a first-use empty state when the business has no customers yet', async () => {
    renderPage(new FakePartyService({ [BIZ_A]: [] }));
    expect(await screen.findByText('No customers yet.')).toBeInTheDocument();
  });

  it('shows an error with a retry button when the list cannot be loaded', async () => {
    renderPage(new FakePartyService({}, new TypeError('Failed to fetch')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load customers.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows a no-permission state on 403, without a retry button', async () => {
    const forbidden = new ApiRequestError(403, {
      code: 'FORBIDDEN',
      message: 'No access',
      fields: [],
      requestId: 'req-test',
    });
    renderPage(new FakePartyService({}, forbidden));
    expect(await screen.findByText('You do not have permission to see customers.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('a business switch shows the new business and clears the search and loaded pages (ADR 0007)', async () => {
    const party = new FakePartyService({
      [BIZ_A]: [customer(1), customer(2), customer(3)],
      [BIZ_B]: [customer(51, { name: 'Other Business Customer' })],
    });
    renderPage(party);
    await screen.findByText('Sample Customer 01');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('Sample Customer 03');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search customers' }), {
      target: { value: 'sample' },
    });
    await waitFor(() => expect(party.queries.at(-1)?.search).toBe('sample'));

    act(() => activeBusinessStore.set(BIZ_B));

    expect(await screen.findByText('Other Business Customer')).toBeInTheDocument();
    expect(rowNames()).toEqual(['Other Business Customer']);
    expect(screen.getByRole('searchbox', { name: 'Search customers' })).toHaveValue('');
    const last = party.queries.at(-1);
    expect(last).toMatchObject({ businessId: BIZ_B, cursor: undefined });
    expect(last?.search).toBeUndefined();
  });

  it('renders in Bangla', async () => {
    renderPage(new FakePartyService({ [BIZ_A]: [customer(1)] }), 'bn');
    expect(await screen.findByRole('heading', { name: 'গ্রাহক' })).toBeInTheDocument();
  });
});
