import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import type { IReportService } from '../../services';
import { SampleReportService } from '../../services/sample/SampleReportService';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { CashCard, TargetCard } from './TargetAndCash';

/** The sample's own day (12 November 2026), so these tests never move with the calendar. */
const STORY_DAY = '2026-11-12';

/** The design's "Sales target" and "Cash forecast and dues" cards, on the sample's November figures. */
function renderCards(
  report: IReportService = new SampleReportService(0, STORY_DAY),
  locale: 'en' | 'bn' = 'en',
) {
  const services = fakeServices(new FakeHealthService(new Error('unused')), { report, demo: new Set() });
  return render(
    <ServicesContext.Provider value={services}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <I18nProvider locale={locale}>
          <TargetCard />
          <CashCard />
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
}

describe('TargetCard', () => {
  it('percent reached, the pace, the gap to pace and the month-end projection', async () => {
    renderCards();
    const card = (await screen.findByText('Sales target')).closest('article') as HTMLElement;
    expect(await within(card).findByText('35.1%')).toBeInTheDocument();
    expect(card).toHaveTextContent('reached, ৳1,40,59,500 of ৳4,00,00,000');
    expect(card).toHaveTextContent('Pace 36.7% (11 of 30 days)');
    expect(card).toHaveTextContent('Behind pace by ৳6,07,167');
    expect(card).toHaveTextContent('At this pace the month ends near ৳3.83 Cr, about 96% of the target.');
    expect(card).toHaveTextContent('Sample Motors36.6% of ৳2,80,00,000');
    expect(card).toHaveTextContent('Sample Spare Parts31.8% of ৳1,20,00,000');
  });

  it('a month without a target says so', async () => {
    const report = new SampleReportService(0, STORY_DAY);
    const real = report.salesTarget;
    report.salesTarget = async () => ({ ...(await real()), target: '0.00', byBusiness: [] });
    renderCards(report);
    expect(await screen.findByText('No sales target is set for this month.')).toBeInTheDocument();
  });
});

describe('CashCard', () => {
  const card = async () =>
    (await screen.findByText('Cash forecast and dues')).closest('article') as HTMLElement;

  it('the forecast as ADR 0047 lists it: opening, Expected collections, bills, recurring, salaries, closing, by week', async () => {
    renderCards();
    const table = await within(await card()).findByRole('table', { name: 'Cash forecast by week' });
    const rows = within(table).getAllByRole('row');
    expect(rows.map((r) => within(r).queryByRole('rowheader')?.textContent ?? 'head')).toEqual([
      'head',
      'Opening',
      'Expected collections',
      'Supplier bills due',
      'Recurring expenses (rent and others)',
      'Salaries',
      'Closing',
    ]);
    expect(within(rows[0] as HTMLElement).getAllByRole('columnheader')).toHaveLength(5); // the label column + 4 weeks
    expect(rows[0]).toHaveTextContent('7 Nov');
    expect(rows[1]).toHaveTextContent('৳65,80,095');
    expect(rows[2]).toHaveTextContent('+৳24,50,000');
    expect(rows[4]).toHaveTextContent('−৳45,000'); // utilities on the 10th, in the week of 7 November
    expect(rows[5]).toHaveTextContent('−৳9,80,000'); // salaries on 1 December, in the week of 28 November
    expect(rows[6]).toHaveTextContent('৳71,65,095');
    expect(rows[6]).toHaveTextContent('৳62,55,095');
  });

  it('8 and 13 weeks are a tap away', async () => {
    renderCards();
    const article = await card();
    await within(article).findByRole('table', { name: 'Cash forecast by week' });
    fireEvent.click(within(article).getByRole('button', { name: '8 weeks' }));
    const table = await within(article).findByRole('table', { name: 'Cash forecast by week' });
    await within(table).findByText('26 Dec');
    expect(
      within(within(table).getAllByRole('row')[0] as HTMLElement).getAllByRole('columnheader'),
    ).toHaveLength(9);
  });

  it('dues already overdue stay on their own Uncertain line, not added; the old "not included" line is gone', async () => {
    renderCards();
    const article = await card();
    expect(await within(article).findByText(/Uncertain/)).toHaveTextContent(
      'Uncertain: ৳21,58,539 of customer dues are already overdue and are not counted above.',
    );
    expect(article).not.toHaveTextContent('not included');
    expect(article).not.toHaveTextContent('Cash in 30 days');
  });

  it('keeps the dues by age for customers and suppliers', async () => {
    renderCards();
    const article = await card();
    const customers = await within(article).findByRole('group', { name: 'Customers owe you' });
    expect(customers).toHaveTextContent('৳63,48,645');
    expect(customers).toHaveTextContent('৳21,58,539 · 34%, overdue');
    const suppliers = within(article).getByRole('group', { name: 'You owe suppliers' });
    expect(suppliers).toHaveTextContent('৳5,99,726 · 15%, late to pay');
    expect(article).toHaveTextContent(
      'Dues by age are sample figures; how they are aged is still to be defined (ADR 0023).',
    );
  });

  it('renders in Bangla', async () => {
    renderCards(undefined, 'bn');
    expect(await screen.findByRole('table', { name: 'সাপ্তাহিক নগদ পূর্বাভাস' })).toHaveTextContent(
      '৳৬৫,৮০,০৯৫',
    );
  });
});
