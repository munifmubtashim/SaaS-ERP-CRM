import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import { SampleReportService } from '../../services/sample/SampleReportService';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { BranchCards, CustomerCard, DayCloseCard, NeedsActionCard, UnitStockCard } from './MoreCards';
import { activeScopeStore } from '../../store/activeScopeStore';

/** The sample's own day (12 November 2026), so these tests never move with the calendar. */
const STORY_DAY = '2026-11-12';

/** The rest of the design's dashboard cards, on the sample's November figures. */
function renderCards(locale: 'en' | 'bn' = 'en') {
  const services = fakeServices(new FakeHealthService(new Error('unused')), {
    report: new SampleReportService(0, STORY_DAY),
    demo: new Set(),
  });
  return render(
    <ServicesContext.Provider value={services}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <I18nProvider locale={locale}>
          <BranchCards />
          <CustomerCard />
          <NeedsActionCard />
          <DayCloseCard />
          <UnitStockCard />
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
}

const card = async (title: string) => (await screen.findByText(title)).closest('article') as HTMLElement;

// The report cards load only once a business is chosen (useReport); obviously fake ids.
beforeEach(() =>
  activeScopeStore.set({
    businessId: '0196f000-0000-7000-8000-0000000000a1',
    branchId: '0196f000-0000-7000-8000-0000000000b1',
  }),
);
afterEach(() => activeScopeStore.clear());

describe('branch cards', () => {
  it('revenue by branch: one bar per branch, each named with its business and amount, not colour-only', async () => {
    renderCards();
    const revenue = await card('Revenue by branch');
    const bars = await within(revenue).findAllByRole('img', { name: /, Sample (Motors|Spare Parts): / });
    expect(bars).toHaveLength(5);
    expect(bars[0]).toHaveAccessibleName('Mirpur-10, Sample Motors: ৳52.4 lakh');
    expect(within(revenue).getByText('Sample Motors')).toBeInTheDocument(); // the legend
  });

  it('hovering a branch bar shows its figures and dims the others', async () => {
    renderCards();
    const revenue = await card('Revenue by branch');
    const bars = await within(revenue).findAllByRole('img', { name: /, Sample (Motors|Spare Parts): / });
    fireEvent.mouseEnter(bars[1] as Element);
    const tip = within(revenue).getByRole('tooltip');
    expect(tip).toHaveTextContent('Uttara');
    expect(tip).toHaveTextContent('৳31,25,000');
    expect(tip).toHaveTextContent('22.2% of revenue');
    expect(bars[0]).toHaveStyle({ opacity: '0.3' });
    expect(bars[1]).toHaveStyle({ opacity: '1' });
  });

  it('profit by branch: business totals with margins, and a table where a loss shows a negative margin', async () => {
    renderCards();
    const profit = await card('Profit by branch');
    expect(await within(profit).findByText('৳18.5 lakh · 18.1% margin')).toBeInTheDocument();
    expect(profit).toHaveTextContent('৳4.6 lakh · 12.0% margin');
    const agrabad = within(within(profit).getByRole('table'))
      .getByText('Agrabad')
      .closest('tr') as HTMLElement;
    expect(agrabad).toHaveTextContent('-৳71,000');
    expect(agrabad).toHaveTextContent('-4.4%');
  });
});

describe('CustomerCard', () => {
  it('buyers, the repeat rate, new buyers, the top five share and the top customers', async () => {
    renderCards();
    const customers = await card('Customer insights');
    expect(await within(customers).findByText('214 customers bought')).toBeInTheDocument();
    expect(customers).toHaveTextContent('Repeat rate58%');
    expect(customers).toHaveTextContent('Repeat 124 · New 90');
    expect(customers).toHaveTextContent('Top 5 customers27%');
    expect(customers).toHaveTextContent('of revenue');
    expect(customers).toHaveTextContent('Sample Traders৳12,40,000');
  });
});

describe('NeedsActionCard', () => {
  it('each item says its severity in words, what it is and where, and its action is not available yet', async () => {
    renderCards();
    const actions = await card('Needs action');
    const items = await within(actions).findAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Critical');
    expect(items[0]).toHaveTextContent('A unit is sold but not delivered');
    expect(items[0]).toHaveTextContent('৳1,34,000 unpaid · Sample Motors, Mirpur-10 · 6 days');
    expect(items[2]).toHaveTextContent('4 parts are below their reorder level');
    for (const button of within(actions).getAllByRole('button')) expect(button).toBeDisabled();
  });
});

describe('DayCloseCard and UnitStockCard', () => {
  it('day close shows its status only: no action to close a period', async () => {
    renderCards();
    const close = await card('Day close');
    expect(await within(close).findByText('Not balanced')).toBeInTheDocument();
    expect(close).toHaveTextContent('2 bank items are unmatched. Last closed on Tuesday 10 November 2026.');
    expect(within(close).queryByRole('button')).toBeNull();
  });

  it('unit stock by status, with the units 90 days or older', async () => {
    renderCards();
    const units = await card('Unit stock');
    expect(await within(units).findByText('79 units')).toBeInTheDocument();
    expect(units).toHaveTextContent('Available58');
    expect(units).toHaveTextContent('Reserved14');
    expect(units).toHaveTextContent('Sold, not delivered7');
    expect(units).toHaveTextContent('15 units have been in stock for 90 days or more.');
  });

  it('renders in Bangla', async () => {
    renderCards('bn');
    expect(await screen.findByText('মুলতুবি কাজ')).toBeInTheDocument();
  });
});
