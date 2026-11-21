import type { ProductListItem, ProductListQueryInput, ProductListResponse } from '@erp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import { ApiRequestError, type IProductService } from '../../services';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { ProductListPage } from './ProductListPage';

// Synthetic sample only.
const bike: ProductListItem = {
  id: '0196f000-0000-7000-8000-000000000201',
  code: 'P-0001',
  name: 'Padma 110 Standard',
  brand: 'Padma Moto',
  unit: 'pcs',
  tracking: 'serial',
  status: 'active',
};
const pad: ProductListItem = {
  id: '0196f000-0000-7000-8000-000000000202',
  code: 'P-0102',
  name: 'Front brake pad',
  brand: null,
  unit: 'set',
  tracking: 'quantity',
  status: 'archived',
};

type Answer = ProductListResponse | Error | 'pending';

class FakeProductService implements IProductService {
  calls: ProductListQueryInput[] = [];
  constructor(private readonly answers: Answer[]) {}
  list(query: ProductListQueryInput): Promise<ProductListResponse> {
    this.calls.push(query);
    const answer = this.answers[Math.min(this.calls.length - 1, this.answers.length - 1)] as Answer;
    if (answer === 'pending') return new Promise(() => {});
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  }
}

/** Shows the current address, so a test can check what the page wrote into it. */
function Location() {
  const { pathname, search } = useLocation();
  return <output aria-label="location">{pathname + search}</output>;
}

function renderPage(product: IProductService, locale: 'en' | 'bn' = 'en', url = '/inventory/products') {
  const services = fakeServices(new FakeHealthService(new Error('unused')), { product });
  render(
    <ServicesContext.Provider value={services}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <I18nProvider locale={locale}>
          <MemoryRouter initialEntries={[url]}>
            <ProductListPage />
            <Location />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
}

const page = (items: ProductListItem[], nextCursor: string | null = null) => ({ items, nextCursor });

describe('ProductListPage', () => {
  it('lists each product with its code, brand, unit and how it is tracked', async () => {
    renderPage(new FakeProductService([page([bike, pad])]));
    const row = (await screen.findByText('Padma 110 Standard')).closest('tr') as HTMLElement;
    expect(within(row).getByText('P-0001')).toBeInTheDocument();
    expect(within(row).getByText('Padma Moto')).toBeInTheDocument();
    expect(within(row).getByText('Serial numbers')).toBeInTheDocument();
    const padRow = screen.getByText('Front brake pad').closest('tr') as HTMLElement;
    expect(within(padRow).getByText('Counted')).toBeInTheDocument();
    expect(within(padRow).getByText('Archived')).toBeInTheDocument();
  });

  it('shows a loading state', () => {
    renderPage(new FakeProductService(['pending']));
    expect(screen.getByText('Loading products…')).toBeInTheDocument();
  });

  it('shows an error with a retry that asks again', async () => {
    const product = new FakeProductService([new TypeError('Failed to fetch'), page([bike])]);
    renderPage(product);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the products.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Padma 110 Standard')).toBeInTheDocument();
  });

  it('says so, without a table, when the caller may not see products', async () => {
    renderPage(new FakeProductService([new ApiRequestError(403, null)]));
    expect(await screen.findByText('You do not have permission to see products.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('has an empty state that says what to do next', async () => {
    renderPage(new FakeProductService([page([])]));
    expect(await screen.findByText('No products yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('searches when the search is submitted, and names the search when nothing matches', async () => {
    const product = new FakeProductService([page([bike]), page([])]);
    renderPage(product);
    await screen.findByText('Padma 110 Standard');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search products' }), {
      target: { value: ' xyz ' },
    });
    fireEvent.submit(screen.getByRole('search'));
    expect(await screen.findByText('No products match “xyz”.')).toBeInTheDocument();
    expect(product.calls.at(-1)).toMatchObject({ search: 'xyz' });
  });

  it('filters by status', async () => {
    const product = new FakeProductService([page([bike, pad]), page([pad])]);
    renderPage(product);
    await screen.findByText('Padma 110 Standard');
    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    await screen.findByRole('button', { name: 'Archived', pressed: true });
    expect(product.calls.at(-1)).toMatchObject({ status: 'archived' });
  });

  it('loads the next page with the cursor', async () => {
    const product = new FakeProductService([page([bike], 'c2'), page([pad])]);
    renderPage(product);
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Front brake pad')).toBeInTheDocument();
    expect(screen.getByText('Padma 110 Standard')).toBeInTheDocument();
    expect(product.calls.at(-1)).toMatchObject({ cursor: 'c2' });
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('renders in Bangla', async () => {
    renderPage(new FakeProductService([page([bike])]), 'bn');
    expect(await screen.findByRole('heading', { name: 'পণ্য' })).toBeInTheDocument();
    expect(await screen.findByText('সিরিয়াল নম্বর')).toBeInTheDocument();
  });

  it('starts from the search and status in the address, so a shared link opens the same list', async () => {
    const product = new FakeProductService([page([pad])]);
    renderPage(product, 'en', '/inventory/products?search=brake&status=archived');
    await screen.findByText('Front brake pad');
    expect(product.calls[0]).toMatchObject({ search: 'brake', status: 'archived' });
    expect(screen.getByRole('searchbox', { name: 'Search products' })).toHaveValue('brake');
    expect(screen.getByRole('button', { name: 'Archived', pressed: true })).toBeInTheDocument();
  });

  it('writes the submitted search and the chosen status into the address', async () => {
    renderPage(new FakeProductService([page([bike])]));
    await screen.findByText('Padma 110 Standard');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search products' }), {
      target: { value: ' padma ' },
    });
    fireEvent.submit(screen.getByRole('search'));
    fireEvent.click(screen.getByRole('button', { name: 'Active' }));
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent(
      '/inventory/products?search=padma&status=active',
    );
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('status', { name: 'location' })).toHaveTextContent(
      '/inventory/products?search=padma',
    );
  });

  it('ignores a status in the address that is not a known one', async () => {
    const product = new FakeProductService([page([bike])]);
    renderPage(product, 'en', '/inventory/products?status=deleted');
    await screen.findByText('Padma 110 Standard');
    expect(product.calls[0]?.status).toBeUndefined();
    expect(screen.getByRole('button', { name: 'All', pressed: true })).toBeInTheDocument();
  });
});
