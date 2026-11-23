import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import type { DemoService } from '../../services';
import { SampleInventoryService } from '../../services/sample/SampleInventoryService';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { InventoryPage } from './InventoryPage';

/** The Inventory list (design/owner-dashboard/Inventory.dc.html) over the sample, pinned to one day. */
function renderPage(locale: 'en' | 'bn' = 'en') {
  const services = fakeServices(new FakeHealthService(new Error('unused')), {
    inventory: new SampleInventoryService(0, '2026-11-12'),
    demo: new Set<DemoService>(['inventory']),
  });
  render(
    <ServicesContext.Provider value={services}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <I18nProvider locale={locale}>
          <InventoryPage />
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
}

const list = () => screen.getByRole('region', { name: 'Stock list' });
const details = () => screen.getByRole('region', { name: 'Item details' });
const rows = () => within(list()).getAllByRole('button', { name: /(PRT|ACC)-/ });

describe('InventoryPage', () => {
  it('summarises stock value, items tracked and how many are low or out', async () => {
    renderPage();
    const summary = await screen.findByRole('region', { name: 'Summary' });
    expect(await within(summary).findByText('৳2,37,450')).toBeInTheDocument();
    expect(summary).toHaveTextContent('9');
    expect(summary).toHaveTextContent('3 low, 1 out of stock');
  });

  it('lists every item with its on-hand count and status in words; filters Low and Out of stock', async () => {
    renderPage();
    await within(await screen.findByRole('region', { name: 'Stock list' })).findByText(
      'Brake pad set, front',
    );
    expect(rows()).toHaveLength(9);
    const pads = rows().find((r) => r.textContent?.includes('Brake pad set')) as HTMLElement;
    expect(pads).toHaveTextContent('30');
    expect(pads).toHaveTextContent('Low');
    fireEvent.click(within(list()).getByRole('button', { name: 'Out of stock' }));
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('Rear tyre 130/70-17')]);
  });

  it('searches the name or SKU; says so when nothing matches', async () => {
    renderPage();
    await within(await screen.findByRole('region', { name: 'Stock list' })).findByText(
      'Brake pad set, front',
    );
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search items or SKUs' }), {
      target: { value: 'acc-hlm' },
    });
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('Full-face helmet')]);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search items or SKUs' }), {
      target: { value: 'nothing like this' },
    });
    expect(within(list()).getByText(/No items match/)).toBeInTheDocument();
  });

  it('opens an item: stock at each branch, totals, cost and its latest movements; adjusting is not available yet', async () => {
    renderPage();
    expect(within(details()).getByText('Pick an item')).toBeInTheDocument();
    fireEvent.click(await within(list()).findByRole('button', { name: /Engine oil 4T/ }));
    expect(await within(details()).findByText('Mirpur-10')).toBeInTheDocument();
    expect(details()).toHaveTextContent('134'); // total on hand
    expect(details()).toHaveTextContent('৳520'); // unit cost
    expect(await within(details()).findByText(/C-000121/)).toBeInTheDocument();
    const adjust = within(details()).getByRole('button', { name: 'Adjust stock' });
    expect(adjust).toBeDisabled();
    expect(adjust).toHaveAttribute('title', 'Not available yet');
  });

  it('the Movements view lists every movement, newest first, with the quantity signed', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Movements' }));
    const table = await screen.findByRole('region', { name: 'Stock movements' });
    const lines = await within(table).findAllByRole('row');
    expect(lines[1]).toHaveTextContent('Full-face helmet');
    expect(lines[1]).toHaveTextContent('−2');
    expect(within(table).getByText('+24')).toBeInTheDocument();
  });

  it('renders in Bangla', async () => {
    renderPage('bn');
    expect(await screen.findByRole('heading', { level: 1, name: 'ইনভেন্টরি' })).toBeInTheDocument();
  });
});
