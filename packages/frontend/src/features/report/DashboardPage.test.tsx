import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServicesContext } from '../../app/servicesContext';
import { I18nProvider } from '../../i18n';
import type { DemoService, IReportService } from '../../services';
import { SampleReportService } from '../../services/sample/SampleReportService';
import { preferencesStore } from '../../store/preferencesStore';
import { FakeHealthService, fakeServices } from '../../test/fakeServices';
import { DashboardPage } from './DashboardPage';

/** The sample's own day (12 November 2026), so these tests never move with the calendar. */
const STORY_DAY = '2026-11-12';

/** The dashboard summary (design/owner-dashboard/Main.dc.html): greeting, VAT alert and the five key figures. */
const NOW = new Date('2026-11-12T03:00:00.000Z'); // 9:00 AM in Dhaka

function renderPage({
  report = new SampleReportService(0, STORY_DAY),
  demo = new Set<DemoService>([
    'report.vatReturn',
    'report.cashPosition',
    'report.supplierDues',
    'report.monthlyResults',
    'report.bankFeed',
  ]),
  locale = 'en' as 'en' | 'bn',
}: { report?: IReportService; demo?: ReadonlySet<DemoService>; locale?: 'en' | 'bn' } = {}) {
  vi.setSystemTime(NOW);
  const services = fakeServices(new FakeHealthService(new Error('unused')), { report, demo });
  return render(
    <ServicesContext.Provider value={services}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <I18nProvider locale={locale}>
          <DashboardPage now={NOW.toISOString()} name="Sample Owner" />
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>,
  );
}

describe('DashboardPage summary', () => {
  afterEach(() => preferencesStore.set({ density: 'compact' }));

  it('greets by the time of day in Dhaka and shows the long date', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good morning, Sample Owner');
    expect(screen.getByText(/Thursday 12 November 2026/)).toBeInTheDocument();
  });

  it('the VAT alert says when the draft return is due, in days, and the estimate', async () => {
    renderPage();
    const alert = await screen.findByRole('region', { name: 'VAT alert' });
    expect(alert).toHaveTextContent('Sunday 15 November 2026, in 3 days');
    expect(alert).toHaveTextContent('৳4,86,200');
  });

  it('the five key figures, as the design shows them', async () => {
    renderPage();
    const figures = await screen.findByRole('region', { name: 'Key figures' });
    expect(await within(figures).findByText('৳1,40,59,500')).toBeInTheDocument(); // revenue, month to date
    expect(within(figures).getByText('৳63.0 lakh')).toBeInTheDocument(); // net profit, November estimate
    expect(within(figures).getByText('৳65,80,095')).toBeInTheDocument(); // cash and bank
    expect(within(figures).getByText('৳63,48,645')).toBeInTheDocument(); // customer dues
    expect(within(figures).getByText('৳39,98,175')).toBeInTheDocument(); // supplier payable
    expect(within(figures).getByText(/Margin 16\.4%/)).toBeInTheDocument();
    expect(figures).not.toHaveTextContent('Covers about'); // dropped: no plan defines it (Munif, 24 Nov)
  });

  it('revenue month to date comes from the owner dashboard (M6, ADR 0023 amended 24 Nov), marked only if that is sample', async () => {
    class RealDashboard extends SampleReportService {
      override ownerDashboard = async () => {
        const sample = await new SampleReportService(0, STORY_DAY).ownerDashboard();
        return { ...sample, totals: { ...sample.totals, revenueMonth: '3600.00' } };
      };
    }
    renderPage({ report: new RealDashboard(0, STORY_DAY) });
    const figures = await screen.findByRole('region', { name: 'Key figures' });
    const revenue = (await within(figures).findByText('৳3,600')).closest('article') as HTMLElement;
    expect(within(revenue).getByText('Revenue')).toBeInTheDocument();
    expect(within(revenue).queryByText('Demo data')).toBeNull();
  });

  it('the revenue card is marked Demo data when the owner dashboard is sample', async () => {
    renderPage({ demo: new Set<DemoService>(['report.ownerDashboard']) });
    const figures = await screen.findByRole('region', { name: 'Key figures' });
    await within(figures).findByText('৳1,40,59,500');
    const card = within(figures).getByText('Revenue').closest('article') as HTMLElement;
    expect(within(card).getByText('Demo data')).toBeInTheDocument();
  });

  it('marks Demo data only on cards whose figures are sample', async () => {
    renderPage();
    const figures = await screen.findByRole('region', { name: 'Key figures' });
    await within(figures).findByText('৳1,40,59,500');
    const card = (label: string) => within(figures).getByText(label).closest('article') as HTMLElement;
    expect(within(card('Revenue')).queryByText('Demo data')).toBeNull();
    expect(within(card('Customer dues')).queryByText('Demo data')).toBeNull();
    expect(within(card('Net profit')).getByText('Demo data')).toBeInTheDocument();
    expect(within(card('Supplier payable')).getByText('Demo data')).toBeInTheDocument();
  });

  it('tints each key figure in its tone, as the design does', async () => {
    renderPage();
    const figures = await screen.findByRole('region', { name: 'Key figures' });
    await within(figures).findByText('৳1,40,59,500');
    const tones = within(figures)
      .getAllByRole('article')
      .map((card) => card.dataset.tone);
    expect(tones).toEqual(['accent', 'pos', 'accent', 'neg', 'warn']);
  });

  it('never puts a sample trend line on a real figure', async () => {
    renderPage({
      demo: new Set<DemoService>(['report.monthlyResults', 'report.supplierDues', 'report.kpiTrends']),
    });
    const figures = await screen.findByRole('region', { name: 'Key figures' });
    await within(figures).findByText('৳1,40,59,500');
    const trend = (label: string) =>
      within(figures).getByText(label).closest('article')?.querySelector('[data-trend]') ?? null;
    expect(trend('Revenue')).toBeNull(); // real figure, sample trend: no line
    expect(trend('Net profit')).not.toBeNull(); // sample figure, already marked Demo data
    expect(trend('Supplier payable')).not.toBeNull();
  });

  it('draws every trend line once the trends are real', async () => {
    renderPage({ demo: new Set<DemoService>() });
    const figures = await screen.findByRole('region', { name: 'Key figures' });
    await within(figures).findByText('৳1,40,59,500');
    await within(figures).findByText('৳39,98,175');
    expect(figures.querySelectorAll('[data-trend]')).toHaveLength(5);
  });

  it('compact density (the default): sample cards carry a small marker named Demo data on the title line', async () => {
    renderPage();
    const figures = await screen.findByRole('region', { name: 'Key figures' });
    await within(figures).findByText('৳1,40,59,500');
    const card = (label: string) => within(figures).getByText(label).closest('article') as HTMLElement;
    expect(within(card('Net profit')).getByRole('button', { name: 'Demo data' })).toBeInTheDocument();
    expect(within(card('Revenue')).queryByRole('button', { name: 'Demo data' })).toBeNull(); // real figure
  });

  it('roomy density keeps the design’s full Demo data badge', async () => {
    preferencesStore.set({ density: 'roomy' });
    renderPage();
    const figures = await screen.findByRole('region', { name: 'Key figures' });
    await within(figures).findByText('৳1,40,59,500');
    const card = within(figures).getByText('Net profit').closest('article') as HTMLElement;
    expect(within(card).getByText('Demo data')).toBeVisible();
    expect(within(card).queryByRole('button', { name: 'Demo data' })).toBeNull();
  });

  it('a card whose figures fail shows its own error with a retry; the others still show', async () => {
    const report = new SampleReportService(0, STORY_DAY);
    let fail = true;
    const real = report.cashPosition;
    report.cashPosition = () => (fail ? Promise.reject(new Error('timeout')) : real());
    renderPage({ report });
    const figures = await screen.findByRole('region', { name: 'Key figures' });
    expect(await within(figures).findByText('Cash and bank did not load.')).toBeInTheDocument();
    expect(within(figures).getByText('৳1,40,59,500')).toBeInTheDocument();
    fail = false;
    fireEvent.click(within(figures).getByRole('button', { name: 'Try again' }));
    expect(await within(figures).findByText('৳65,80,095')).toBeInTheDocument();
  });

  it('renders in Bangla', async () => {
    renderPage({ locale: 'bn' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('শুভ সকাল, Sample Owner');
    expect(await screen.findByText('৳১,৪০,৫৯,৫০০')).toBeInTheDocument();
  });
});
