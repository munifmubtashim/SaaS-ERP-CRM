import { formatLakhCrore, formatShare, formatTaka } from '@erp/shared';
import { useI18n } from '../../i18n';
import { agingBuckets, cashForecast, margin } from './derive';
import { ReportCard } from './ReportCard';
import { useReport } from './useReport';

const value = 'num text-2xl font-bold';
const note = 'text-[13px] text-text2';

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
  return (
    <section aria-label={t('dash.kpi.aria')} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <ReportCard title={t('dash.kpi.revenue')} calls={['salesToday']} queries={[sales]}>
        {() => (
          <>
            <span className={value}>{taka(sales.data?.monthToDate ?? '0.00')}</span>
            <span className={note}>
              {t('dash.kpi.revenueNote', {
                today: formatLakhCrore(sales.data?.today ?? '0.00', loc),
                count: sales.data?.invoicesToday ?? 0,
              })}
            </span>
          </>
        )}
      </ReportCard>
      <ReportCard title={t('dash.kpi.profit')} calls={['monthlyResults']} queries={[months]}>
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
            </>
          );
        }}
      </ReportCard>
      <ReportCard title={t('dash.kpi.cash')} calls={['cashPosition']} queries={[cash]}>
        {() => {
          const cover = cash.data ? cashForecast(cash.data, [], []).coverDays : null;
          return (
            <>
              <span className={value}>{taka(cash.data?.cashNow ?? '0.00')}</span>
              {cover !== null && <span className={note}>{t('dash.kpi.cashNote', { days: cover })}</span>}
            </>
          );
        }}
      </ReportCard>
      <ReportCard title={t('dash.kpi.dues')} calls={['ownerDashboard']} queries={[owner]}>
        {() => (
          <>
            <span className={value}>{taka(owner.data?.totals.dues ?? '0.00')}</span>
            <span className={note}>
              {t('dash.kpi.duesNote', {
                amount: formatLakhCrore(owner.data?.totals.collectionsToday ?? '0.00', loc),
              })}
            </span>
          </>
        )}
      </ReportCard>
      <ReportCard title={t('dash.kpi.payable')} calls={['supplierDues']} queries={[suppliers]}>
        {() => {
          const aged = agingBuckets(suppliers.data?.entries ?? []);
          const late = aged.buckets.find((b) => b.key === '61+')?.amount ?? '0.00';
          return (
            <>
              <span className={value}>{taka(aged.total)}</span>
              <span className={note}>{t('dash.kpi.payableNote', { amount: formatTaka(late, loc) })}</span>
            </>
          );
        }}
      </ReportCard>
    </section>
  );
}
