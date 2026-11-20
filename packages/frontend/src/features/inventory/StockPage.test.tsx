import type { StockListQueryInput, StockListResponse, StockRow } from '@erp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import { ApiRequestError, type IInventoryService } from '../../services';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { StockPage } from './StockPage';

// Synthetic sample only.
const oil: StockRow = {
  productId: '0196f000-0000-7000-8000-000000000205',
  productCode: 'P-0101',
  productName: 'Engine oil 10W-30, 1 litre',
  branchId: '0196f000-0000-7000-8000-0000000000a2',
  branchName: 'Uttara',
  onHand: '1240.000',
};
const pads: StockRow = { ...oil, productCode: 'P-0102', productName: 'Front brake pad', onHand: '0.000' };

type Answer = StockListResponse | Error | 'pending';

class FakeInventoryService implements IInventoryService {
  calls: StockListQueryInput[] = [];
  constructor(private readonly answers: Answer[]) {}
  stock(query: StockListQueryInput): Promise<StockListResponse> {
    this.calls.push(query);
    const answer = this.answers[Math.min(this.calls.length - 1, this.answers.length - 1)] as Answer;
    if (answer === 'pending') return new Promise(() => {});
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  }
}

function renderPage(inventory: IInventoryService, locale: 'en' | 'bn' = 'en') {
  const services = fakeServices(new FakeHealthService(new Error('unused')), { inventory });
  render(
    <ServicesContext.Provider value={services}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <I18nProvider locale={locale}>
          <MemoryRouter>
            <StockPage />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
}

const page = (items: StockRow[], nextCursor: string | null = null) => ({ items, nextCursor });

describe('StockPage', () => {
  it('shows each product in each branch with its quantity on hand, lakh-grouped, no trailing zeros', async () => {
    renderPage(new FakeInventoryService([page([oil])]));
    const row = (await screen.findByText('Engine oil 10W-30, 1 litre')).closest('tr') as HTMLElement;
    expect(within(row).getByText('P-0101')).toBeInTheDocument();
    expect(within(row).getByText('Uttara')).toBeInTheDocument();
    expect(within(row).getByText('1,240')).toBeInTheDocument();
  });

  it('marks out-of-stock rows in words, not only by colour', async () => {
    renderPage(new FakeInventoryService([page([pads])]));
    const row = (await screen.findByText('Front brake pad')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Out of stock')).toBeInTheDocument();
  });

  it('links to the product list', async () => {
    renderPage(new FakeInventoryService([page([oil])]));
    expect(await screen.findByRole('link', { name: 'Products' })).toHaveAttribute(
      'href',
      '/inventory/products',
    );
  });

  it('shows a loading state', () => {
    renderPage(new FakeInventoryService(['pending']));
    expect(screen.getByText('Loading stock…')).toBeInTheDocument();
  });

  it('shows an error with a retry that asks again', async () => {
    renderPage(new FakeInventoryService([new TypeError('Failed to fetch'), page([oil])]));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the stock.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Engine oil 10W-30, 1 litre')).toBeInTheDocument();
  });

  it('says so, without a table, when the caller may not see stock', async () => {
    renderPage(new FakeInventoryService([new ApiRequestError(403, null)]));
    expect(await screen.findByText('You do not have permission to see stock.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('has an empty state', async () => {
    renderPage(new FakeInventoryService([page([])]));
    expect(await screen.findByText('No stock recorded yet.')).toBeInTheDocument();
  });

  it('searches on submit and names the search when nothing matches', async () => {
    const inventory = new FakeInventoryService([page([oil]), page([])]);
    renderPage(inventory);
    await screen.findByText('Engine oil 10W-30, 1 litre');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search stock' }), { target: { value: 'chain' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(await screen.findByText('No stock matches “chain”.')).toBeInTheDocument();
    expect(inventory.calls.at(-1)).toMatchObject({ search: 'chain' });
  });

  it('loads the next page with the cursor', async () => {
    const inventory = new FakeInventoryService([page([oil], 'c2'), page([pads])]);
    renderPage(inventory);
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Front brake pad')).toBeInTheDocument();
    expect(inventory.calls.at(-1)).toMatchObject({ cursor: 'c2' });
  });

  it('renders in Bangla with Bangla digits', async () => {
    renderPage(new FakeInventoryService([page([oil])]), 'bn');
    expect(await screen.findByText('১,২৪০')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'মজুদ' })).toBeInTheDocument();
  });
});
