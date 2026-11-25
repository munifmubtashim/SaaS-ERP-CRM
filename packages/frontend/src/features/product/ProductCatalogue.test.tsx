import type { ProductListItem, ProductListQueryInput } from '@erp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import type { IProductService } from '../../services';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { ProductsPage } from './ProductsPage';

/** The Products page's catalogue (task 5): every product, with the way to add one and to open one. Invented values. */
const row = (n: number, fields: Partial<ProductListItem> = {}): ProductListItem => ({
  id: `0196f000-0000-7000-8000-000000000${700 + n}`,
  code: `P-0${n}`,
  name: `Sample Product ${n}`,
  brand: null,
  unit: 'pcs',
  tracking: 'quantity',
  status: 'active',
  ...fields,
});

class FakeProduct implements IProductService {
  queries: ProductListQueryInput[] = [];
  constructor(private readonly items: ProductListItem[]) {}
  models = async () => [];
  list = async (query: ProductListQueryInput) => {
    this.queries.push(query);
    return { items: this.items.filter((p) => !query.status || p.status === query.status), nextCursor: null };
  };
  get = () => Promise.reject(new Error('not used'));
  create = () => Promise.reject(new Error('not used'));
  edit = () => Promise.reject(new Error('not used'));
}

function renderPage(product: IProductService) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ServicesContext.Provider value={fakeServices(new FakeHealthService(new Error('unused')), { product })}>
      <QueryClientProvider client={client}>
        <I18nProvider locale="en">
          <MemoryRouter>
            <ProductsPage />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
}

describe('the product catalogue', () => {
  it('offers "Add product" on the page, which opens the form', async () => {
    renderPage(new FakeProduct([]));
    expect(await screen.findByRole('link', { name: 'Add product' })).toHaveAttribute('href', '/products/new');
  });

  it('lists the active products; each name opens its edit form', async () => {
    renderPage(new FakeProduct([row(1), row(2, { tracking: 'serial', brand: 'Sample Motors' })]));
    fireEvent.click(screen.getByRole('button', { name: 'All products' }));
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('link', { name: 'Sample Product 2' })).toHaveAttribute(
      'href',
      '/products/0196f000-0000-7000-8000-000000000702/edit',
    );
    expect(within(table).getByText('By serial number')).toBeInTheDocument();
  });

  it('keeps code and unit under each name, for a phone where those columns are hidden', async () => {
    renderPage(new FakeProduct([row(1, { unit: 'litre' })]));
    fireEvent.click(screen.getByRole('button', { name: 'All products' }));
    const link = await screen.findByRole('link', { name: 'Sample Product 1' });
    expect(link.closest('td')).toHaveTextContent('P-01 · litre');
  });

  it('shows archived products when asked', async () => {
    const product = new FakeProduct([row(1), row(3, { status: 'archived' })]);
    renderPage(product);
    fireEvent.click(screen.getByRole('button', { name: 'All products' }));
    await screen.findByRole('link', { name: 'Sample Product 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    expect(await screen.findByRole('link', { name: 'Sample Product 3' })).toBeInTheDocument();
    expect(product.queries.at(-1)).toEqual(expect.objectContaining({ status: 'archived' }));
  });

  it('says so when there are no products yet', async () => {
    renderPage(new FakeProduct([]));
    fireEvent.click(screen.getByRole('button', { name: 'All products' }));
    expect(await screen.findByText('No products yet. Add the first one.')).toBeInTheDocument();
  });
});
