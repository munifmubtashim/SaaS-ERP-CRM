import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import { SampleReportService } from '../../services/sample/SampleReportService';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { MonthlyChart, RevenueByBusiness } from './Charts';
import { activeScopeStore } from '../../store/activeScopeStore';

/** The sample's own day (12 November 2026), so these tests never move with the calendar. */
const STORY_DAY = '2026-11-12';

/** The design's revenue and expenses chart and the revenue-by-business ring, on the sample's figures. */
function renderCharts(locale: 'en' | 'bn' = 'en') {
  const services = fakeServices(new FakeHealthService(new Error('unused')), {
    report: new SampleReportService(0, STORY_DAY),
    demo: new Set(),
  });
  return render(
    <ServicesContext.Provider value={services}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <I18nProvider locale={locale}>
          <MonthlyChart />
          <RevenueByBusiness />
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
}

// The report cards load only once a business is chosen (useReport); obviously fake ids.
beforeEach(() =>
  activeScopeStore.set({
    businessId: '0196f000-0000-7000-8000-0000000000a1',
    branchId: '0196f000-0000-7000-8000-0000000000b1',
  }),
);
afterEach(() => activeScopeStore.clear());

describe('MonthlyChart', () => {
  it('shows revenue and expenses with a legend, the estimate marked, and switches to net profit', async () => {
    renderCharts();
    const card = (await screen.findByText('Revenue and expenses, by month')).closest(
      'article',
    ) as HTMLElement;
    const legend = await within(card).findByRole('list', { name: 'Legend' });
    expect(legend).toHaveTextContent('Revenue');
    expect(legend).toHaveTextContent('Expenses');
    expect(legend).toHaveTextContent('Nov estimate');
    fireEvent.click(within(card).getByRole('button', { name: 'Net profit' }));
    expect(within(card).getByRole('button', { name: 'Net profit' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(card).getByRole('list', { name: 'Legend' })).toHaveTextContent('Net profit');
  });

  it('has a table view with every month, so no figure is colour-only', async () => {
    renderCharts();
    const table = await screen.findByRole('table', { name: 'Revenue and expenses, by month' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(7); // header + 6 months
    expect(rows[6]).toHaveTextContent('Nov');
    expect(rows[6]).toHaveTextContent('৳3.83 Cr');
    expect(rows[6]).toHaveTextContent('৳3.20 Cr');
    expect(rows[6]).toHaveTextContent('৳63.0 lakh');
  });

  it('hovering a month shows its figures', async () => {
    renderCharts();
    const hit = await screen.findByRole('img', { name: /Jun: revenue ৳3\.12 Cr/ });
    fireEvent.mouseEnter(hit);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Jun');
    expect(screen.getByRole('tooltip')).toHaveTextContent('৳2.61 Cr');
  });
});

describe('RevenueByBusiness', () => {
  it('each business with its revenue and share, labelled, not colour-only', async () => {
    renderCharts();
    const card = (await screen.findByText('Revenue by business')).closest('article') as HTMLElement;
    // In the legend, and as the name of its ring slice.
    expect(await within(card).findByText('Sample Motors')).toBeInTheDocument();
    expect(within(card).getByRole('img', { name: 'Sample Motors' })).toBeInTheDocument();
    expect(card).toHaveTextContent('৳1.02 Cr · 72.9%');
    expect(card).toHaveTextContent('৳38.1 lakh · 27.1%');
  });

  it('shows the total in the middle, and a hovered slice its own business', async () => {
    renderCharts();
    const card = (await screen.findByText('Revenue by business')).closest('article') as HTMLElement;
    const middle = await within(card).findByTestId('ring-middle');
    expect(middle).toHaveTextContent('৳1.41 Cr'); // ৳1,40,59,500, as the design shows
    expect(middle).toHaveTextContent('Total');
    fireEvent.mouseEnter(within(card).getByRole('img', { name: 'Sample Spare Parts' }));
    expect(middle).toHaveTextContent('৳38.1 lakh');
    expect(middle).toHaveTextContent('Sample Spare Parts');
  });

  it('renders in Bangla', async () => {
    renderCharts('bn');
    expect(await screen.findByText('মাসভিত্তিক আয় ও খরচ')).toBeInTheDocument();
  });
});
