import { formatLakhCrore, formatShare, formatTaka, ratioBasisPoints, type Paisa } from '@erp/shared';
import { useI18n } from '../../i18n';
import { agingBuckets, cashForecast, targetProgress, type AgedEntry, type Share } from './derive';
import { ReportCard } from './ReportCard';
import { useReport } from './useReport';

/** A bar's width (0 to 100) for a share: display only, through the shared ratio helper. */
const width = (share: Share | null) =>
  share && share.whole > 0n
    ? Math.max(0, Math.min(100, Number(ratioBasisPoints(share.part as Paisa, share.whole as Paisa)) / 100))
    : 0;

function Bar({ share, tone = 'bg-accent', marker }: { share: Share | null; tone?: string; marker?: Share }) {
  return (
    <div className="relative h-2.5 w-full rounded-full bg-track" aria-hidden="true">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${width(share)}%` }} />
      {marker && (
        <div className="absolute -top-1 h-4.5 w-0.5 bg-text" style={{ left: `${width(marker)}%` }} />
      )}
    </div>
  );
}

/** The design's "Sales target" card: percent reached, pace, the gap, the projection, and each business. */
export function TargetCard() {
  const { t, locale } = useI18n();
  const loc = locale === 'bn' ? 'bn-BD' : 'en-BD';
  const taka = (amount: string) => `৳${formatTaka(amount, loc)}`;
  const target = useReport('salesTarget');
  const sales = useReport('salesToday');
  return (
    <ReportCard
      title={t('dash.target.title')}
      calls={['salesTarget', 'salesToday']}
      queries={[target, sales]}
    >
      {() => {
        const goal = target.data;
        const sold = sales.data;
        if (!goal || !sold || goal.target === '0.00') {
          return <p className="text-[13px] text-text2">{t('dash.target.none')}</p>;
        }
        const p = targetProgress({ ...goal, achieved: sold.monthToDate });
        return (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="num text-[28px] font-bold">
                {formatShare(p.reached.part, p.reached.whole, loc)}
              </span>
              <span className="text-[13px] text-text2">
                {t('dash.target.reached', { amount: taka(sold.monthToDate), target: taka(goal.target) })}
              </span>
            </div>
            <Bar share={p.reached} marker={p.pace} />
            <span className="text-[13px] text-text2">
              {t('dash.target.pace', {
                pace: formatShare(p.pace.part, p.pace.whole, loc),
                elapsed: goal.daysElapsed,
                days: goal.daysInMonth,
              })}
            </span>
            <span className={`font-semibold ${p.behindBy ? 'text-warn-text' : 'text-pos-text'}`}>
              {p.behindBy
                ? t('dash.target.behind', { amount: taka(p.behindBy) })
                : t('dash.target.ahead', { amount: taka(p.aheadBy ?? '0.00') })}
            </span>
            {p.projection && p.projectionShare && (
              <p className="text-[13px] text-text2">
                {t('dash.target.projection', {
                  amount: `৳${formatLakhCrore(p.projection, loc)}`,
                  share: formatShare(p.projectionShare.part, p.projectionShare.whole, loc, 0),
                })}
              </p>
            )}
            <ul className="flex flex-col gap-2">
              {goal.byBusiness.map((business) => {
                const businessSold =
                  sold.byBusiness.find((b) => b.businessId === business.businessId)?.monthToDate ?? '0.00';
                const share = targetProgress({
                  ...goal,
                  target: business.target,
                  achieved: businessSold,
                }).reached;
                return (
                  <li key={business.businessId} className="flex flex-col gap-1">
                    <div className="flex justify-between gap-2 text-[13px]">
                      <span className="truncate font-semibold">{business.name}</span>
                      <span className="num">
                        {t('dash.target.ofTarget', {
                          share: formatShare(share.part, share.whole, loc),
                          target: taka(business.target),
                        })}
                      </span>
                    </div>
                    <Bar share={share} tone="bg-biz-a" />
                  </li>
                );
              })}
            </ul>
          </div>
        );
      }}
    </ReportCard>
  );
}

function AgedDuesGroup({
  label,
  entries,
  lateKey,
}: {
  label: string;
  entries: readonly AgedEntry[];
  lateKey: 'dash.cash.overdue' | 'dash.cash.lateToPay';
}) {
  const { t, locale } = useI18n();
  const loc = locale === 'bn' ? 'bn-BD' : 'en-BD';
  const aged = agingBuckets(entries);
  const tones = ['bg-pos', 'bg-warn', 'bg-neg'];
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <div className="flex justify-between gap-2 text-[13px]">
        <span className="font-semibold">{label}</span>
        <span className="num font-semibold">৳{formatTaka(aged.total, loc)}</span>
      </div>
      {aged.buckets.map((bucket, i) => (
        <div key={bucket.key} className="flex flex-col gap-0.5 text-[13px] text-text2">
          <span>
            {t(`dash.cash.bucket.${bucket.key}` as 'dash.cash.bucket.0-30')}: ৳
            {formatTaka(bucket.amount, loc)}
            {bucket.share && ` · ${formatShare(bucket.share.part, bucket.share.whole, loc, 0)}`}
            {bucket.key === '61+' && bucket.share && `, ${t(lateKey)}`}
          </span>
          <Bar share={bucket.share} tone={tones[i]} />
        </div>
      ))}
    </div>
  );
}

/** The design's "Cash forecast and dues" card: the next 30 days, and dues by age on both sides. */
export function CashCard() {
  const { t, locale } = useI18n();
  const loc = locale === 'bn' ? 'bn-BD' : 'en-BD';
  const taka = (amount: string) => `৳${formatTaka(amount, loc)}`;
  const cash = useReport('cashPosition');
  const customers = useReport('customerDues');
  const suppliers = useReport('supplierDues');
  return (
    <ReportCard
      title={t('dash.cash.title')}
      calls={['cashPosition', 'customerDues', 'supplierDues']}
      queries={[cash, customers, suppliers]}
    >
      {() => {
        if (!cash.data || !customers.data || !suppliers.data) return null;
        const position = cash.data;
        const c = cashForecast(position, customers.data.entries, suppliers.data.entries);
        const figure = (label: string, amount: string, help: string) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] text-muted">{label}</span>
            <span className="num text-xl font-bold">{amount}</span>
            <span className="text-xs text-text2">{help}</span>
          </div>
        );
        return (
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-text2">{t('dash.cash.subtitle')}</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {figure(
                t('dash.cash.now'),
                taka(position.cashNow),
                t('dash.cash.nowHelp', { sales: `৳${formatLakhCrore(position.averageDailySales, loc)}` }),
              )}
              {figure(t('dash.cash.in'), `+${taka(c.comingIn)}`, t('dash.cash.inHelp'))}
              {figure(t('dash.cash.out'), `−${taka(c.goingOut)}`, t('dash.cash.outHelp'))}
              {figure(t('dash.cash.in30'), taka(c.cashIn30Days), t('dash.cash.in30Help'))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <AgedDuesGroup
                label={t('dash.cash.customers')}
                entries={customers.data.entries}
                lateKey="dash.cash.overdue"
              />
              <AgedDuesGroup
                label={t('dash.cash.suppliers')}
                entries={suppliers.data.entries}
                lateKey="dash.cash.lateToPay"
              />
            </div>
          </div>
        );
      }}
    </ReportCard>
  );
}
