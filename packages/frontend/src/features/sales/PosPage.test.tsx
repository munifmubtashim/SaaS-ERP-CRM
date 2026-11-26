import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import type { DemoService, ISalesService } from '../../services';
import { SampleSalesService } from '../../services/sample/SampleSalesService';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { PosPage } from './PosPage';

/** The POS screen (design/owner-dashboard/Sales.dc.html, selling half) over the sample sales service. */
function renderPos({
  sales = new SampleSalesService(0),
  demo = new Set<DemoService>(['sales']),
  locale = 'en' as 'en' | 'bn',
}: { sales?: ISalesService; demo?: ReadonlySet<DemoService>; locale?: 'en' | 'bn' } = {}) {
  const services = fakeServices(new FakeHealthService(new Error('unused')), { sales, demo });
  render(
    <ServicesContext.Provider value={services}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <I18nProvider locale={locale}>
          <PosPage />
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
}

const products = () => screen.getByRole('region', { name: 'Products' });
const sale = () => screen.getByRole('region', { name: 'Current sale' });
const row = (name: string) => within(products()).getByText(name).closest('tr') as HTMLElement;
const add = (name: string) => fireEvent.click(within(row(name)).getByRole('button', { name: `Add ${name}` }));

describe('PosPage', () => {
  it('lists the items with their stock; an item with none left can not be added; filters by category and search', async () => {
    renderPos();
    await within(await screen.findByRole('region', { name: 'Products' })).findByText('Brake pad set, front');
    expect(row('Brake pad set, front')).toHaveTextContent('18 in stock');
    expect(
      within(row('Rear tyre 130/70-17')).getByRole('button', { name: 'Add Rear tyre 130/70-17' }),
    ).toBeDisabled();
    expect(row('Rear tyre 130/70-17')).toHaveTextContent('None left');
    fireEvent.click(within(products()).getByRole('button', { name: 'Oil' }));
    expect(within(products()).queryByText('Brake pad set, front')).toBeNull();
    fireEvent.click(within(products()).getByRole('button', { name: 'All' }));
    fireEvent.change(within(products()).getByRole('searchbox', { name: 'Search items' }), {
      target: { value: 'helmet' },
    });
    expect(within(products()).getAllByRole('row')).toHaveLength(2); // header + helmet
  });

  it('adds items, changes quantities, and keeps the totals', async () => {
    renderPos();
    await within(await screen.findByRole('region', { name: 'Products' })).findByText('Brake pad set, front');
    add('Brake pad set, front');
    add('Brake pad set, front');
    fireEvent.click(within(sale()).getByRole('button', { name: 'One more Brake pad set, front' }));
    expect(sale()).toHaveTextContent('3 × ৳1,000');
    expect(within(sale()).getByTestId('subtotal')).toHaveTextContent('৳3,000');
    fireEvent.change(within(sale()).getByLabelText('Discount in taka'), { target: { value: '500' } });
    expect(within(sale()).getByTestId('total')).toHaveTextContent('৳2,500');
  });

  it('a bike without its chassis number can not complete; picked and sold with nothing received, the toast says what is still due', async () => {
    renderPos();
    await within(await screen.findByRole('region', { name: 'Products' })).findByText('Velo 150 V3');
    add('Velo 150 V3');
    fireEvent.click(within(sale()).getByRole('button', { name: /Complete sale/ }));
    expect(within(sale()).getByRole('alert')).toHaveTextContent('Pick a chassis number for this bike.');
    fireEvent.change(within(sale()).getByLabelText('Chassis number'), { target: { value: 'VL3-000101' } });
    fireEvent.change(within(sale()).getByLabelText('Amount received in taka'), { target: { value: '0' } });
    fireEvent.click(within(sale()).getByRole('button', { name: /Complete sale/ }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Invoice C-000124 saved. ৳0 received, ৳2,45,000 still due.',
    );
    expect(within(sale()).getByText('No items yet')).toBeInTheDocument();
  });

  it('offers cash and bKash only; a bKash payment needs its transaction id, which the sale keeps', async () => {
    const sample = new SampleSalesService(0);
    renderPos({ sales: sample });
    await within(await screen.findByRole('region', { name: 'Products' })).findByText('Full-face helmet');
    const methods = within(sale()).getByRole('group', { name: 'Payment method' });
    expect(
      within(methods)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Cash', 'bKash']);
    add('Full-face helmet');
    fireEvent.click(within(methods).getByRole('button', { name: 'bKash' }));
    fireEvent.click(within(sale()).getByRole('button', { name: /Complete sale/ }));
    expect(within(sale()).getByRole('alert')).toHaveTextContent('Enter the bKash transaction ID.');
    fireEvent.change(within(sale()).getByLabelText('bKash transaction ID'), { target: { value: 'BK7X2Q9' } });
    fireEvent.click(within(sale()).getByRole('button', { name: /Complete sale/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('Invoice C-000124 saved.');
    const sold = (await sample.invoices()).find((i) => i.number === 'C-000124');
    const detail = await sample.invoice(sold?.id ?? '');
    expect(detail.payments).toEqual([expect.objectContaining({ method: 'bkash', externalRef: 'BK7X2Q9' })]);
  });

  it('a retry after a failed Complete sale uses the same Idempotency-Key, so it can never sell twice', async () => {
    const sample = new SampleSalesService(0);
    const keys: string[] = [];
    let fail = true;
    const sales: ISalesService = {
      ...sample,
      posItems: () => sample.posItems(),
      completeSale: (draft, key) => {
        keys.push(key);
        if (fail) return Promise.reject(new Error('timeout'));
        return sample.completeSale(draft, key);
      },
    };
    renderPos({ sales });
    await within(await screen.findByRole('region', { name: 'Products' })).findByText('Full-face helmet');
    add('Full-face helmet');
    fireEvent.click(within(sale()).getByRole('button', { name: /Complete sale/ }));
    expect(await within(sale()).findByRole('alert')).toHaveTextContent('The sale was not saved. Try again.');
    fail = false;
    fireEvent.click(within(sale()).getByRole('button', { name: /Complete sale/ }));
    await screen.findByRole('status');
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it('marks the items as Demo data when sample, and renders in Bangla', async () => {
    renderPos({ locale: 'bn' });
    const list = await screen.findByRole('region', { name: 'পণ্য' });
    expect(await within(list).findByText('নমুনা তথ্য')).toBeInTheDocument();
  });
});
