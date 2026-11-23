import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
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
  it('cash now, coming in, going out and cash in 30 days, then dues by age for customers and suppliers', async () => {
    renderCards();
    const card = (await screen.findByText('Cash forecast and dues')).closest('article') as HTMLElement;
    expect(await within(card).findByText('৳65,80,095')).toBeInTheDocument();
    expect(card).toHaveTextContent('+৳41,90,106');
    expect(card).toHaveTextContent('−৳33,98,449');
    expect(card).toHaveTextContent('৳73,71,752');
    const customers = within(card).getByRole('group', { name: 'Customers owe you' });
    expect(customers).toHaveTextContent('৳63,48,645');
    expect(customers).toHaveTextContent('৳24,12,485 · 38%');
    expect(customers).toHaveTextContent('৳21,58,539 · 34%, overdue');
    const suppliers = within(card).getByRole('group', { name: 'You owe suppliers' });
    expect(suppliers).toHaveTextContent('৳5,99,726 · 15%, late to pay');
  });

  it('renders in Bangla', async () => {
    renderCards(undefined, 'bn');
    expect(await screen.findByText('৳৬৫,৮০,০৯৫')).toBeInTheDocument();
  });
});
