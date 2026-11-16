import type { OwnerDashboard as Dashboard } from '@erp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import type { IReportService } from '../../services';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { OwnerDashboard } from './OwnerDashboard';

const dashboard: Dashboard = {
  asOf: '2026-11-16T04:30:00.000Z',
  totals: { dues: '1621817.50', collectionsToday: '57500.00' },
  businesses: [
    {
      businessId: '0196f000-0000-7000-8000-0000000000a1',
      name: 'Demo Motors',
      dues: '1234567.50',
      collectionsToday: '45000.00',
    },
    {
      businessId: '0196f000-0000-7000-8000-0000000000b1',
      name: 'Sample Traders',
      dues: '387250.00',
      collectionsToday: '12500.00',
    },
  ],
};

class FakeReportService implements IReportService {
  calls = 0;
  constructor(private readonly answer: Dashboard | Error | 'pending') {}
  ownerDashboard(): Promise<Dashboard> {
    this.calls += 1;
    if (this.answer === 'pending') return new Promise(() => {});
    return this.answer instanceof Error ? Promise.reject(this.answer) : Promise.resolve(this.answer);
  }
}

function renderDashboard(report: IReportService, locale: 'en' | 'bn' = 'en') {
  const services = fakeServices(new FakeHealthService(new Error('unused')), { report });
  render(
    <ServicesContext.Provider value={services}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <I18nProvider locale={locale}>
          <OwnerDashboard />
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
}

describe('OwnerDashboard', () => {
  it('leads with total dues in taka with lakh grouping, then collections today and the time', async () => {
    renderDashboard(new FakeReportService(dashboard));
    expect(await screen.findByText('৳ 16,21,817.50')).toBeInTheDocument();
    expect(screen.getByText('৳ 57,500.00')).toBeInTheDocument();
    // 04:30 UTC is 10:30 in Dhaka.
    expect(screen.getByText(/16\/11\/2026.*10:30/)).toBeInTheDocument();
  });

  it('lists each business with its dues and collections today', async () => {
    renderDashboard(new FakeReportService(dashboard));
    const row = (await screen.findByText('Demo Motors')).closest('tr') as HTMLElement;
    expect(within(row).getByText('৳ 12,34,567.50')).toBeInTheDocument();
    expect(within(row).getByText('৳ 45,000.00')).toBeInTheDocument();
    expect(screen.getByText('Sample Traders')).toBeInTheDocument();
  });

  it('shows a loading state', () => {
    renderDashboard(new FakeReportService('pending'));
    expect(screen.getByText('Loading figures…')).toBeInTheDocument();
  });

  it('shows an error with a retry that asks again', async () => {
    const report = new FakeReportService(new TypeError('Failed to fetch'));
    renderDashboard(report);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the figures.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('alert');
    expect(report.calls).toBe(2);
  });

  it('says so when there are no businesses yet', async () => {
    renderDashboard(
      new FakeReportService({
        ...dashboard,
        totals: { dues: '0.00', collectionsToday: '0.00' },
        businesses: [],
      }),
    );
    expect(await screen.findByText('No business figures yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders in Bangla with Bangla digits', async () => {
    renderDashboard(new FakeReportService(dashboard), 'bn');
    expect(await screen.findByText('৳ ১৬,২১,৮১৭.৫০')).toBeInTheDocument();
    expect(screen.getByText('মোট বকেয়া')).toBeInTheDocument();
  });
});
