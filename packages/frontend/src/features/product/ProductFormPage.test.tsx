import type { ErrorCode, ProductCreate, ProductDetail, ProductEdit } from '@erp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import { ApiRequestError, type IProductService } from '../../services';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { ProductFormPage } from './ProductFormPage';

/**
 * The add, edit and archive product form (task 5; ADR 0052): POST and PATCH /v1/products through IProductService.
 * Code and tracking are fixed once the product exists (#105). Archiving is a PATCH with status "archived", after a
 * confirm step that names the product. Every value is invented.
 */
const ID = '0196f000-0000-7000-8000-000000000701';
const helmet: ProductDetail = {
  id: ID,
  code: 'HLM-01',
  name: 'Sample Helmet',
  nameBn: null,
  brand: 'Sample Brand',
  category: 'Accessories',
  unit: 'pcs',
  tracking: 'quantity',
  sellPrice: '1850.00',
  status: 'active',
  version: 3,
};

const apiError = (
  status: number,
  code: ErrorCode,
  fields: { path: string; code: string; message: string }[] = [],
) => new ApiRequestError(status, { code, message: code, fields, requestId: 'test' });

class FakeProduct implements IProductService {
  created: ProductCreate[] = [];
  edited: { id: string; input: ProductEdit }[] = [];
  reads: string[] = [];
  constructor(
    private readonly refuse: ApiRequestError[] = [],
    private readonly stored: ProductDetail = helmet,
  ) {}
  models = () => Promise.reject(new Error('not used'));
  list = () => Promise.reject(new Error('not used'));
  get = async (id: string) => {
    this.reads.push(id);
    return this.stored;
  };
  async create(input: ProductCreate): Promise<ProductDetail> {
    this.created.push(input);
    const refusal = this.refuse.shift();
    if (refusal) throw refusal;
    return { ...helmet, ...input, status: 'active', version: 1 };
  }
  async edit(id: string, input: ProductEdit): Promise<ProductDetail> {
    this.edited.push({ id, input });
    const refusal = this.refuse.shift();
    if (refusal) throw refusal;
    return { ...this.stored, ...input, version: this.stored.version + 1 };
  }
}

function renderForm(product: IProductService, path: string, locale: 'en' | 'bn' = 'en') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ServicesContext.Provider value={fakeServices(new FakeHealthService(new Error('unused')), { product })}>
      <QueryClientProvider client={client}>
        <I18nProvider locale={locale}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="products/new" element={<ProductFormPage />} />
              <Route path="products/:id/edit" element={<ProductFormPage />} />
              <Route path="products" element={<p>Products page</p>} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fillNew = () => {
  type('Code', 'HLM-01');
  type('Name', 'Sample Helmet');
  type('Unit', 'pcs');
  type('Selling price (৳)', '1,850');
  fireEvent.click(screen.getByLabelText('Counted by quantity'));
};

describe('adding a product', () => {
  it('sends the typed product, the price as a money string, and returns to the products', async () => {
    const product = new FakeProduct();
    renderForm(product, '/products/new');
    await screen.findByRole('heading', { name: 'Add product' });
    fillNew();
    type('Category', 'Accessories');
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    expect(await screen.findByText('Products page')).toBeInTheDocument();
    expect(product.created).toEqual([
      {
        code: 'HLM-01',
        name: 'Sample Helmet',
        nameBn: null,
        brand: null,
        category: 'Accessories',
        unit: 'pcs',
        tracking: 'quantity',
        sellPrice: '1850.00',
      },
    ]);
    expect(product.reads).toEqual([]);
  });

  it('refuses a price that is not an amount before sending anything, naming the field', async () => {
    const product = new FakeProduct();
    renderForm(product, '/products/new');
    await screen.findByRole('heading', { name: 'Add product' });
    fillNew();
    type('Selling price (৳)', '18.505');
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    expect(await screen.findByText('Enter a price like 1850 or 1850.50.')).toBeInTheDocument();
    expect(screen.getByLabelText('Selling price (৳)')).toHaveAttribute('aria-invalid', 'true');
    expect(product.created).toEqual([]);
  });

  it('a code already used is shown on the code field', async () => {
    const product = new FakeProduct([
      apiError(409, 'CONFLICT', [{ path: 'code', code: 'product.code_taken', message: 'taken' }]),
    ]);
    renderForm(product, '/products/new');
    await screen.findByRole('heading', { name: 'Add product' });
    fillNew();
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    expect(await screen.findByText('Another product already has this code.')).toBeInTheDocument();
    expect(screen.getByLabelText('Code')).toHaveAttribute('aria-invalid', 'true');
  });

  it('a user who may not manage products sees why', async () => {
    renderForm(new FakeProduct([apiError(403, 'FORBIDDEN')]), '/products/new');
    await screen.findByRole('heading', { name: 'Add product' });
    fillNew();
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    expect(
      await screen.findByText('Only the owner or a business manager can add or change products.'),
    ).toBeInTheDocument();
  });

  it('makes the person choose the tracking: it cannot change later', async () => {
    const product = new FakeProduct();
    renderForm(product, '/products/new');
    await screen.findByRole('heading', { name: 'Add product' });
    type('Code', 'HLM-01');
    type('Name', 'Sample Helmet');
    type('Unit', 'pcs');
    type('Selling price (৳)', '1850');
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    expect(await screen.findByText('Choose how it is counted. It cannot change later.')).toBeInTheDocument();
    expect(product.created).toEqual([]);
  });

  it('shows the form in Bangla', async () => {
    renderForm(new FakeProduct(), '/products/new', 'bn');
    expect(await screen.findByRole('heading', { name: 'নতুন পণ্য' })).toBeInTheDocument();
  });
});

describe('editing a product', () => {
  it('shows code and tracking as fixed, and sends the changes with the version read', async () => {
    const product = new FakeProduct();
    renderForm(product, `/products/${ID}/edit`);
    expect(await screen.findByRole('heading', { name: 'Edit product' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Sample Helmet')).toBeInTheDocument();
    expect(screen.queryByLabelText('Code')).toBeNull();
    expect(screen.getByText('HLM-01')).toBeInTheDocument();
    type('Selling price (৳)', '1950');
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    expect(await screen.findByText('Products page')).toBeInTheDocument();
    expect(product.edited).toEqual([
      {
        id: ID,
        input: {
          version: 3,
          name: 'Sample Helmet',
          nameBn: null,
          brand: 'Sample Brand',
          category: 'Accessories',
          unit: 'pcs',
          sellPrice: '1950.00',
        },
      },
    ]);
  });

  it('a stale version says someone else changed it, and keeps what was typed', async () => {
    const product = new FakeProduct([
      apiError(409, 'CONFLICT', [{ path: 'version', code: 'product.version_conflict', message: 'changed' }]),
    ]);
    renderForm(product, `/products/${ID}/edit`);
    await screen.findByDisplayValue('Sample Helmet');
    type('Name', 'Renamed Helmet');
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }));
    expect(
      await screen.findByText('Someone else changed this product. Reload the page to see their change.'),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('Renamed Helmet')).toBeInTheDocument();
  });
});

describe('archiving and restoring', () => {
  it('asks first, naming the product; cancelling sends nothing', async () => {
    const product = new FakeProduct();
    renderForm(product, `/products/${ID}/edit`);
    await screen.findByDisplayValue('Sample Helmet');
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(
      screen.getByText(
        'Archive Sample Helmet? It will no longer be offered for sale. You can restore it later.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(product.edited).toEqual([]);
  });

  it('confirming sends status archived with the version read', async () => {
    const product = new FakeProduct();
    renderForm(product, `/products/${ID}/edit`);
    await screen.findByDisplayValue('Sample Helmet');
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive Sample Helmet' }));
    expect(await screen.findByText('Products page')).toBeInTheDocument();
    expect(product.edited).toEqual([{ id: ID, input: { version: 3, status: 'archived' } }]);
  });

  it('an archived product offers Restore instead, which sends status active', async () => {
    const product = new FakeProduct([], { ...helmet, status: 'archived' });
    renderForm(product, `/products/${ID}/edit`);
    await screen.findByDisplayValue('Sample Helmet');
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(await screen.findByText('Products page')).toBeInTheDocument();
    expect(product.edited).toEqual([{ id: ID, input: { version: 3, status: 'active' } }]);
  });
});
