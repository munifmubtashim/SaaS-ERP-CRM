import { formatLakhCrore, formatShare, formatTaka, type KpiTrends } from '@erp/shared';
import { useId } from 'react';
import { useServices } from '../../app/servicesContext';
import { useI18n } from '../../i18n';
import type { ReportCall } from '../../services';
import { agingBuckets, margin } from './derive';
import { ReportCard } from './ReportCard';
import { sparkline } from './sparkline';
import { useReport } from './useReport';

const value = 'num kpi-value font-semibold leading-[1.1]';
const note = 'text-[13px] text-text2';

/** The design's small trend line under a key figure: a 2px line in the card's tone over a fading fill. */
function Trend({ amounts }: { amounts: readonly string[] }) {
  const id = useId();
  const { line, fill } = sparkline(amounts, 160, 40);
  if (!line) return null;
  return (
    <svg
      data-trend
      viewBox="0 0 160 40"
      preserveAspectRatio="none"
      className="mt-0.5 block h-10 w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--kpi-line)" stopOpacity="0.32" />
          <stop offset="1" stopColor="var(--kpi-line)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke="var(--kpi-line)"
        strokeWidth="2"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * A key figure's trend, or nothing. A sample trend is drawn only on a card whose own figure is sample (and so already
 * marked Demo data), so a real figure never carries an invented line.
 */
function useTrend(figure: ReportCall, series: keyof KpiTrends) {
  const { demo } = useServices();
  const trends = useReport('kpiTrends');
  const allowed = !demo.has('report.kpiTrends') || demo.has(`report.${figure}`);
  const amounts = allowed ? trends.data?.[series] : undefined;
  return amounts ? <Trend amounts={amounts} /> : null;
}

/** The design's five key figures: revenue, net profit, cash and bank, customer dues, supplier payable. */
export function KpiRow() {
  const { t, locale } = useI18n();
  const loc = locale === 'bn' ? 'bn-BD' : 'en-BD';
  const taka = (amount: string) => `৳${formatTaka(amount, loc)}`;
  const sales = useReport('salesToday');
  const months = useReport('monthlyResults');
  const cash = useReport('cashPosition');
  const owner = useReport('ownerDashboard');
  const suppliers = useReport('supplierDues');
  const trend = {
    revenue: useTrend('salesToday', 'revenue'),
    profit: useTrend('monthlyResults', 'profit'),
    cash: useTrend('cashPosition', 'cash'),
    dues: useTrend('ownerDashboard', 'customerDues'),
    payable: useTrend('supplierDues', 'supplierPayable'),
  };
  return (
    <section aria-label={t('dash.kpi.aria')} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <ReportCard
        title={t('dash.kpi.revenue')}
        calls={['ownerDashboard', 'salesToday']}
        queries={[owner, sales]}
        kpi={{ tone: 'accent', icon: 'trend' }}
      >
        {() => (
          <>
            {/* From the ledger (M6, ADR 0023 amended 24 Nov); today's figure and count are still salesToday's. */}
            <span className={value}>{taka(owner.data?.totals.revenueMonth ?? '0.00')}</span>
            <span className={note}>
              {t('dash.kpi.revenueNote', {
                today: formatLakhCrore(sales.data?.today ?? '0.00', loc),
                count: sales.data?.invoicesToday ?? 0,
              })}
            </span>
            {trend.revenue}
          </>
        )}
      </ReportCard>
      <ReportCard
        title={t('dash.kpi.profit')}
        calls={['monthlyResults']}
        queries={[months]}
        kpi={{ tone: 'pos', icon: 'dollar' }}
      >
        {() => {
          const month = months.data?.months.at(-1);
          const result = month ? margin(month) : null;
          return (
            <>
              <span className={value}>৳{formatLakhCrore(result?.profit ?? '0.00', loc)}</span>
              {result?.share && (
                <span className={note}>
                  {t('dash.kpi.profitNote', {
                    margin: formatShare(result.share.part, result.share.whole, loc),
                  })}
                </span>
              )}
              {trend.profit}
            </>
          );
        }}
      </ReportCard>
      <ReportCard
        title={t('dash.kpi.cash')}
        calls={['cashPosition']}
        queries={[cash]}
        kpi={{ tone: 'accent', icon: 'wallet' }}
      >
        {() => {
          return (
            <>
              <span className={value}>{taka(cash.data?.cashNow ?? '0.00')}</span>
              {trend.cash}
            </>
          );
        }}
      </ReportCard>
      <ReportCard
        title={t('dash.kpi.dues')}
        calls={['ownerDashboard']}
        queries={[owner]}
        kpi={{ tone: 'neg', icon: 'users' }}
      >
        {() => (
          <>
            <span className={value}>{taka(owner.data?.totals.dues ?? '0.00')}</span>
            <span className={note}>
              {t('dash.kpi.duesNote', {
                amount: formatLakhCrore(owner.data?.totals.collectionsToday ?? '0.00', loc),
              })}
            </span>
            {trend.dues}
          </>
        )}
      </ReportCard>
      <ReportCard
        title={t('dash.kpi.payable')}
        calls={['supplierDues']}
        queries={[suppliers]}
        kpi={{ tone: 'warn', icon: 'truck' }}
      >
        {() => {
          const aged = agingBuckets(suppliers.data?.entries ?? []);
          const late = aged.buckets.find((b) => b.key === '61+')?.amount ?? '0.00';
          return (
            <>
              <span className={value}>{taka(aged.total)}</span>
              <span className={note}>{t('dash.kpi.payableNote', { amount: formatTaka(late, loc) })}</span>
              {trend.payable}
            </>
          );
        }}
      </ReportCard>
    </section>
  );
}
