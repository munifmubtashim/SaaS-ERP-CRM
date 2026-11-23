import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import { SampleReportService } from '../../services/sample/SampleReportService';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { BranchCards, CustomerCard, DayCloseCard, NeedsActionCard, UnitStockCard } from './MoreCards';

/** The rest of the design's dashboard cards, on the sample's November figures. */
function renderCards(locale: 'en' | 'bn' = 'en') {
  const services = fakeServices(new FakeHealthService(new Error('unused')), {
    report: new SampleReportService(0),
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

describe('branch cards', () => {
  it('revenue by branch, each labelled with its business and amount', async () => {
    renderCards();
    const revenue = await card('Revenue by branch');
    expect(await within(revenue).findByText('Mirpur-10, Sample Motors')).toBeInTheDocument();
    expect(revenue).toHaveTextContent('৳52.4 lakh');
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
