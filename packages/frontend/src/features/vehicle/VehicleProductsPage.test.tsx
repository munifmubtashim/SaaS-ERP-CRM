import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import type { DemoService } from '../../services';
import { SampleProductService } from '../../services/sample/SampleProductService';
import { SampleVehicleService } from '../../services/sample/SampleVehicleService';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { VehicleProductsPage } from './VehicleProductsPage';

/** The Products screen (design/owner-dashboard/Bikes.dc.html): models in the core, units with the Vehicle pack. */
function renderPage({ pack = true, locale = 'en' as 'en' | 'bn' } = {}) {
  const services = fakeServices(new FakeHealthService(new Error('unused')), {
    product: new SampleProductService(0),
    vehicle: new SampleVehicleService(0, '2026-11-12'),
    demo: new Set<DemoService>(pack ? ['product', 'vehicle'] : ['product']),
  });
  render(
    <ServicesContext.Provider value={services}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <I18nProvider locale={locale}>
          <VehicleProductsPage />
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
}

const units = () => screen.getByRole('region', { name: 'Units' });
const details = () => screen.getByRole('region', { name: 'Unit details' });
const rows = () => within(units()).getAllByRole('button', { name: /^[A-Z]{2}\d-\d{6}/ });

describe('Products with the Vehicle pack on', () => {
  it('opens on Units with the summary: available, reserved, sold but not delivered', async () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Units' })).toHaveAttribute('aria-pressed', 'true');
    const summary = await screen.findByRole('region', { name: 'Summary' });
    expect(await within(summary).findByText('2 have been in stock 90 days or more')).toBeInTheDocument();
    expect(summary).toHaveTextContent('Available to sell8');
    expect(summary).toHaveTextContent('Reserved2');
    expect(summary).toHaveTextContent('Sold, not delivered2');
  });

  it('lists every unit; filters by status and 90+ days; searches chassis, engine or model', async () => {
    renderPage();
    await within(await screen.findByRole('region', { name: 'Units' })).findByText('VL3-000101');
    expect(rows()).toHaveLength(14);
    fireEvent.click(within(units()).getByRole('button', { name: '90+ days' }));
    expect(rows().map((r) => r.textContent?.slice(0, 10))).toEqual([
      'VL3-000102',
      'RG1-000202',
      'RG1-000198',
    ]);
    fireEvent.click(within(units()).getByRole('button', { name: 'All' }));
    fireEvent.change(within(units()).getByRole('searchbox', { name: 'Search chassis, engine or model' }), {
      target: { value: 'breeze' },
    });
    expect(rows()).toHaveLength(2);
  });

  it('opens a unit: numbers, branch, days in stock, customer, advance and registration steps', async () => {
    renderPage();
    expect(within(details()).getByText('Pick a unit')).toBeInTheDocument();
    fireEvent.click(await within(units()).findByRole('button', { name: /^RG1-000198/ }));
    expect(await within(details()).findByText('RGE-000198')).toBeInTheDocument();
    expect(details()).toHaveTextContent('Uttara');
    expect(details()).toHaveTextContent('Sample Riders Club');
    expect(details()).toHaveTextContent('৳15,000');
    fireEvent.click(within(units()).getByRole('button', { name: /^CR6-000299/ }));
    const steps = await within(details()).findByRole('list', { name: 'Registration' });
    expect(within(steps).getByText('Fee paid')).toHaveAttribute('data-done', 'true');
    expect(within(steps).getByText('Plate fitted')).toHaveAttribute('data-done', 'false');
  });

  it('the Models view shows each model with its price and units by state', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Models' }));
    const models = await screen.findByRole('region', { name: 'Models' });
    const velo = (await within(models).findByText('Velo 150 V3')).closest('tr') as HTMLElement;
    expect(velo).toHaveTextContent('৳2,45,000');
    expect(velo).toHaveTextContent('3'); // available
  });
});

describe('Products with the Vehicle pack off', () => {
  it('shows only Models: no Units view and no chassis numbers anywhere (spec O-11)', async () => {
    renderPage({ pack: false });
    expect(await screen.findByRole('region', { name: 'Models' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Units' })).toBeNull();
    expect(screen.queryByText(/VL3-0001/)).toBeNull();
  });

  it('renders in Bangla', async () => {
    renderPage({ pack: false, locale: 'bn' });
    expect(await screen.findByRole('heading', { level: 1, name: 'পণ্য' })).toBeInTheDocument();
  });
});
