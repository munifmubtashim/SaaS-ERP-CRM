import type { FollowUpListItem, FollowUpListQueryInput, FollowUpListResponse } from '@erp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import { ApiRequestError, type ICrmService } from '../../services';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { FollowUpListPage } from './FollowUpListPage';

// Obviously fake sample data only.
function followUp(n: number, patch: Partial<FollowUpListItem> = {}): FollowUpListItem {
  const nn = String(n).padStart(2, '0');
  return {
    id: `0196f000-0000-7000-8000-0000000f00${nn}`,
    partyId: `0196f000-0000-7000-8000-0000000c00${nn}`,
    partyName: `Sample Customer ${nn}`,
    collectorId: '0196f000-0000-7000-8000-0000000d0001',
    collectorName: 'Sample Collector',
    channel: 'call',
    outcome: 'promised',
    promise: { promisedOn: '2026-11-20', amount: '1234567.50', status: 'broken' },
    note: null,
    contactedAt: '2026-11-16T08:45:00.000Z',
    ...patch,
  };
}

/** Answers from a fixed list, two rows a page, filtered like the API; records every query it receives. */
class FakeCrmService implements ICrmService {
  readonly queries: FollowUpListQueryInput[] = [];
  constructor(
    private readonly rows: FollowUpListItem[],
    private failWith?: Error,
  ) {}

  succeedFromNowOn() {
    this.failWith = undefined;
  }

  recordFollowUp(): never {
    throw new Error('The list does not record follow-ups.');
  }

  listCollectors(): never {
    throw new Error('The list does not load collectors.');
  }

  async listFollowUps(query: FollowUpListQueryInput): Promise<FollowUpListResponse> {
    this.queries.push(query);
    if (this.failWith) throw this.failWith;
    const matching = this.rows.filter(
      (r) => !query.promiseStatus || r.promise?.status === query.promiseStatus,
    );
    const start = query.cursor ? Number(query.cursor) : 0;
    const end = start + 2;
    return { items: matching.slice(start, end), nextCursor: end < matching.length ? String(end) : null };
  }
}

function renderPage(crm: ICrmService, locale: 'en' | 'bn' = 'en', state: unknown = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ServicesContext.Provider value={fakeServices(new FakeHealthService(new Error('unused')), { crm })}>
      <QueryClientProvider client={client}>
        <I18nProvider locale={locale}>
          <MemoryRouter initialEntries={[{ pathname: '/follow-ups', state }]}>
            <FollowUpListPage />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
}

const ROWS = [
  followUp(1),
  followUp(2, {
    partyName: 'Sample Customer 02',
    promise: { promisedOn: '2026-11-28', amount: '18500.00', status: 'open' },
  }),
  followUp(3, { outcome: 'no_answer', promise: null, note: 'Rang twice' }),
];

describe('FollowUpListPage (CR-05, mock data)', () => {
  it('shows a loading state, then opens on the broken promises (exception first)', async () => {
    const crm = new FakeCrmService(ROWS);
    renderPage(crm);
    expect(screen.getByText('Loading follow-ups…')).toHaveAttribute('aria-busy', 'true');

    const link = await screen.findByRole('link', { name: 'Sample Customer 01' });
    expect(link).toHaveAttribute('href', `/customers/${ROWS[0]?.partyId}`);
    expect(crm.queries[0]).toMatchObject({ promiseStatus: 'broken' });
    expect(screen.getByRole('button', { name: 'Broken' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Sample Customer 02')).not.toBeInTheDocument();
  });

  it('shows the amount with ৳ and lakh grouping, the promise date in Dhaka, and the status as text', async () => {
    renderPage(new FakeCrmService(ROWS));
    const row = (await screen.findByText('Sample Customer 01')).closest('tr');
    if (!row) throw new Error('no row');
    expect(within(row).getByText('৳12,34,567.50')).toBeInTheDocument();
    expect(within(row).getByText('20/11/2026')).toBeInTheDocument();
    expect(within(row).getByText('Broken')).toBeInTheDocument();
    expect(within(row).getByText('Sample Collector')).toBeInTheDocument();
  });

  it('lists every follow-up under "All", with the outcome for a follow-up without a promise', async () => {
    const crm = new FakeCrmService(ROWS);
    renderPage(crm);
    await screen.findByText('Sample Customer 01');
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    await screen.findByText('Sample Customer 02');
    expect(crm.queries.at(-1)?.promiseStatus).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    const row = (await screen.findByText('Sample Customer 03')).closest('tr');
    if (!row) throw new Error('no row');
    expect(within(row).getByText('No answer')).toBeInTheDocument();
    expect(within(row).getByText('Rang twice')).toBeInTheDocument();
  });

  it("links each row to the follow-up form for that row's customer", async () => {
    renderPage(new FakeCrmService(ROWS));
    const row = (await screen.findByText('Sample Customer 01')).closest('tr');
    if (!row) throw new Error('no row');
    expect(within(row).getByRole('link', { name: 'Record follow-up' })).toHaveAttribute(
      'href',
      `/follow-ups/new?partyId=${ROWS[0]?.partyId}`,
    );
  });

  it('after a saved promise, says so and opens on Open, where the new promise is', async () => {
    const crm = new FakeCrmService(ROWS);
    renderPage(crm, 'en', { saved: true, promiseStatus: 'open' });
    expect(screen.getByRole('status')).toHaveTextContent('Follow-up saved.');
    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-pressed', 'true');
    await screen.findByText('Sample Customer 02');
    expect(crm.queries[0]).toMatchObject({ promiseStatus: 'open' });
  });

  it('after a save without a promise, says so in Bangla and keeps the usual Broken filter', async () => {
    renderPage(new FakeCrmService(ROWS), 'bn', { saved: true });
    expect(screen.getByRole('status')).toHaveTextContent('ফলো-আপ সংরক্ষণ হয়েছে।');
    expect(screen.getByRole('button', { name: 'ভঙ্গ' })).toHaveAttribute('aria-pressed', 'true');
    await screen.findByText('Sample Customer 01');
  });

  it('shows no saved message on a normal visit', async () => {
    renderPage(new FakeCrmService(ROWS));
    await screen.findByText('Sample Customer 01');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says there are no broken promises when there are none', async () => {
    renderPage(new FakeCrmService([ROWS[1] as FollowUpListItem]));
    expect(await screen.findByText('No broken promises.')).toBeInTheDocument();
  });

  it('says there are no follow-ups yet under "All" with none at all', async () => {
    renderPage(new FakeCrmService([]));
    await screen.findByText('No broken promises.');
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(await screen.findByText('No follow-ups yet.')).toBeInTheDocument();
  });

  it('shows an error with a retry button, and the list after a retry', async () => {
    const crm = new FakeCrmService(ROWS, new Error('network down'));
    renderPage(crm);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load follow-ups.');
    crm.succeedFromNowOn();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Sample Customer 01')).toBeInTheDocument();
  });

  it('says the user may not see follow-ups on a 403, with no retry', async () => {
    const forbidden = new ApiRequestError(403, {
      code: 'FORBIDDEN',
      message: 'Forbidden',
      fields: [],
      requestId: 'test',
    });
    renderPage(new FakeCrmService(ROWS, forbidden));
    expect(await screen.findByText('You do not have permission to see follow-ups.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('is in Bangla when the language is Bangla', async () => {
    renderPage(new FakeCrmService(ROWS), 'bn');
    expect(screen.getByRole('heading', { name: 'ফলো-আপ' })).toBeInTheDocument();
    await screen.findByText('Sample Customer 01');
    expect(screen.getByRole('button', { name: 'ভঙ্গ' })).toHaveAttribute('aria-pressed', 'true');
  });
});
