import {
  formatDayMonthBD,
  formatLakhCrore,
  formatShare,
  formatTaka,
  ratioBasisPoints,
  type ForecastWeeks,
  type Paisa,
} from '@erp/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useServices } from '../../app/servicesContext';
import { useI18n } from '../../i18n';
import { agingBuckets, targetProgress, type AgedEntry, type Share } from './derive';
import { forecastWeeks } from './forecast';
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
      <div className={`gloss h-full rounded-full ${tone}`} style={{ width: `${width(share)}%` }} />
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
          <div className="flex flex-col gap-[var(--card-gap)]">
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
    <div role="group" aria-label={label} className="flex flex-col gap-[var(--row-gap)]">
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

const HORIZONS: ForecastWeeks[] = [4, 8, 13];
const LINES = [
  { key: 'expectedCollections', label: 'dash.fc.collections', sign: '+' },
  { key: 'supplierBills', label: 'dash.fc.bills', sign: '−' },
  { key: 'recurringExpenses', label: 'dash.fc.recurring', sign: '−' },
  { key: 'salaries', label: 'dash.fc.salaries', sign: '−' },
] as const;

/**
 * "Cash forecast and dues": the forecast exactly as ADR 0047 section 1 lists it (the plan wins over the design):
 * opening, plus expected collections, less supplier bills, recurring expenses and salaries, closing per week, for 4,
 * 8 or 13 weeks; dues already overdue on their own Uncertain line, not added. Then dues by age on both sides.
 */
export function CashCard() {
  const { t, locale } = useI18n();
  const loc = locale === 'bn' ? 'bn-BD' : 'en-BD';
  const taka = (amount: string) => `৳${formatTaka(amount.replace('-', ''), loc)}`;
  const signed = (amount: string) => (amount.startsWith('-') ? `−${taka(amount)}` : taka(amount));
  const { report } = useServices();
  const [weeks, setWeeks] = useState<ForecastWeeks>(4);
  const forecast = useQuery({
    queryKey: ['report', 'cashForecast', weeks],
    queryFn: () => report.cashForecast(weeks),
    placeholderData: (previous) => previous,
  });
  const customers = useReport('customerDues');
  const suppliers = useReport('supplierDues');
  return (
    <ReportCard
      title={t('dash.cash.title')}
      calls={['cashForecast', 'customerDues', 'supplierDues']}
      queries={[forecast, customers, suppliers]}
    >
      {() => {
        if (!forecast.data || !customers.data || !suppliers.data) return null;
        const f = forecastWeeks(forecast.data);
        return (
          <div className="flex flex-col gap-[var(--card-gap-lg)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-text2">{t('dash.fc.subtitle')}</p>
              <div
                role="group"
                aria-label={t('dash.fc.weeksAria')}
                className="flex gap-1 rounded-full bg-track p-1"
              >
                {HORIZONS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    aria-pressed={weeks === w}
                    onClick={() => setWeeks(w)}
                    className="min-h-9 rounded-full px-3 text-xs text-text2 aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent-text"
                  >
                    {t('dash.fc.weeks', { count: w })}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table aria-label={t('dash.fc.table')} className="w-full min-w-[480px] text-[13px]">
                <thead>
                  <tr className="text-xs text-muted">
                    <th scope="col" className="py-1 text-left font-semibold">
                      {t('dash.fc.line')}
                    </th>
                    {f.weeks.map((w) => (
                      <th
                        key={w.weekStart}
                        scope="col"
                        className="num py-1 text-right font-semibold whitespace-nowrap"
                      >
                        {formatDayMonthBD(w.weekStart, loc)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-row-border">
                    <th scope="row" className="py-1.5 text-left font-normal text-text2">
                      {t('dash.fc.opening')}
                    </th>
                    {f.weeks.map((w) => (
                      <td key={w.weekStart} className="num py-1.5 text-right whitespace-nowrap">
                        {signed(w.opening)}
                      </td>
                    ))}
                  </tr>
                  {LINES.map((line) => (
                    <tr key={line.key} className="border-t border-row-border">
                      <th scope="row" className="py-1.5 text-left font-normal text-text2">
                        {t(line.label)}
                      </th>
                      {f.weeks.map((w) => (
                        <td key={w.weekStart} className="num py-1.5 text-right whitespace-nowrap text-text2">
                          {w[line.key] === '0.00' ? '—' : `${line.sign}${taka(w[line.key])}`}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t border-row-border">
                    <th scope="row" className="py-1.5 text-left font-semibold">
                      {t('dash.fc.closing')}
                    </th>
                    {f.weeks.map((w) => (
                      <td
                        key={w.weekStart}
                        className={`num py-1.5 text-right font-semibold whitespace-nowrap ${w.closing.startsWith('-') ? 'text-neg-text' : ''}`}
                      >
                        {signed(w.closing)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="rounded-xl bg-warn-bg px-3 py-2 text-[13px] text-warn-text">
              {t('dash.fc.uncertain', { amount: taka(f.uncertain) })}
            </p>
            <div className="grid gap-[var(--card-gap-lg)] md:grid-cols-2">
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
