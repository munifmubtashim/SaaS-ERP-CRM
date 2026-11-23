import {
  formatLakhCrore,
  formatShare,
  parseMoney,
  ratioBasisPoints,
  sumMoney,
  type MonthlyResults,
} from '@erp/shared';
import { useState } from 'react';
import { useI18n, type MessageKey } from '../../i18n';
import { chartFrame, margin } from './derive';
import { ReportCard } from './ReportCard';
import { useReport } from './useReport';

// Plot area inside a 640 x 240 view box: x 88..624 (room for crore labels in Bangla), y 16..208.
const X0 = 88;
const X1 = 624;
const Y0 = 16;
const Y1 = 208;

type Month = MonthlyResults['months'][number];
const monthKey = (month: string) => `month.${month.slice(5, 7)}` as MessageKey;

/** A line through points; the last segment dotted when the last month is an estimate (the design's "Nov est."). */
function Line({ points, color, estimate }: { points: [number, number][]; color: string; estimate: boolean }) {
  const solid = estimate ? points.slice(0, -1) : points;
  const tail = estimate && points.length > 1 ? points.slice(-2) : [];
  const d = (pts: [number, number][]) => pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
  return (
    <g fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d(solid)} />
      {tail.length === 2 && <path d={d(tail)} strokeDasharray="4 5" />}
    </g>
  );
}

/** The design's "Revenue and expenses" card, with its "Net profit" view, a hover tooltip and a table view. */
export function MonthlyChart() {
  const { t, locale } = useI18n();
  const loc = locale === 'bn' ? 'bn-BD' : 'en-BD';
  const money = (amount: string) => `৳${formatLakhCrore(amount, loc)}`;
  const results = useReport('monthlyResults');
  const [view, setView] = useState<'revenue' | 'profit'>('revenue');
  const [hover, setHover] = useState<number | null>(null);
  const title = t('dash.chart.title');
  return (
    <ReportCard title={title} calls={['monthlyResults']} queries={[results]}>
      {() => {
        const months: (Month & { profit: string })[] = (results.data?.months ?? []).map((m) => ({
          ...m,
          profit: margin(m).profit,
        }));
        if (months.length === 0) return <p className="text-[13px] text-text2">{t('dash.chart.empty')}</p>;
        const series =
          view === 'revenue'
            ? [
                { key: 'revenue' as const, label: t('dash.chart.revenue'), color: 'var(--c1)' },
                { key: 'expenses' as const, label: t('dash.chart.expenses'), color: 'var(--c2)' },
              ]
            : [{ key: 'profit' as const, label: t('dash.chart.profit'), color: 'var(--c3)' }];
        const frame = chartFrame(months.flatMap((m) => series.map((s) => m[s.key])));
        const step = months.length > 1 ? (X1 - X0) / (months.length - 1) : 0;
        const x = (i: number) => X0 + i * step;
        const y = (amount: string) => Y1 - frame.position(amount) * (Y1 - Y0);
        const last = months.at(-1);
        const hovered = hover === null ? null : months[hover];
        return (
          <div className="flex flex-col gap-3">
            <div role="group" className="flex flex-wrap gap-1">
              {(['revenue', 'profit'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className="min-h-10 rounded-full px-4 text-[13px] text-text2 aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent-text"
                >
                  {t(v === 'revenue' ? 'dash.chart.tabRevenue' : 'dash.chart.profit')}
                </button>
              ))}
            </div>
            <ul aria-label={t('dash.chart.legend')} className="flex flex-wrap gap-4 text-[13px] text-text2">
              {series.map((s) => (
                <li key={s.key} className="flex items-center gap-2">
                  <span
                    className="h-0.5 w-4 rounded-full"
                    style={{ background: s.color }}
                    aria-hidden="true"
                  />
                  {s.label}
                </li>
              ))}
              {last?.estimate && (
                <li className="flex items-center gap-2">
                  <span className="w-4 border-t-2 border-dotted border-muted" aria-hidden="true" />
                  {t('dash.chart.estimate', { month: t(monthKey(last.month)) })}
                </li>
              )}
            </ul>
            <div className="relative overflow-x-auto">
              <svg viewBox="0 0 640 240" className="h-auto w-full min-w-[480px]" aria-hidden={false}>
                {frame.ticks.map((tick) => (
                  <g key={tick}>
                    <line x1={X0} x2={X1} y1={y(tick)} y2={y(tick)} stroke="var(--grid)" strokeWidth="1" />
                    <text x={X0 - 8} y={y(tick) + 4} textAnchor="end" className="fill-muted text-[14px]">
                      {money(tick)}
                    </text>
                  </g>
                ))}
                {months.map((m, i) => (
                  <text key={m.month} x={x(i)} y={232} textAnchor="middle" className="fill-muted text-[14px]">
                    {t(monthKey(m.month))}
                  </text>
                ))}
                {series.map((s) => (
                  <Line
                    key={s.key}
                    color={s.color}
                    estimate={last?.estimate ?? false}
                    points={months.map((m, i) => [x(i), y(m[s.key])])}
                  />
                ))}
                {hovered && hover !== null && (
                  <g>
                    <line x1={x(hover)} x2={x(hover)} y1={Y0} y2={Y1} stroke="var(--muted)" strokeWidth="1" />
                    {series.map((s) => (
                      <circle
                        key={s.key}
                        cx={x(hover)}
                        cy={y(hovered[s.key])}
                        r="5"
                        fill={s.color}
                        stroke="var(--dot-fill)"
                        strokeWidth="2"
                      />
                    ))}
                  </g>
                )}
                {months.map((m, i) => (
                  <rect
                    key={m.month}
                    role="img"
                    aria-label={t('dash.chart.point', {
                      month: t(monthKey(m.month)),
                      revenue: money(m.revenue),
                      expenses: money(m.expenses),
                      profit: money(m.profit),
                    })}
                    x={x(i) - step / 2}
                    y={Y0}
                    width={Math.max(step, 24)}
                    height={Y1 - Y0}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  />
                ))}
              </svg>
              {hovered && hover !== null && (
                <div
                  role="tooltip"
                  className="glass pointer-events-none absolute top-2 rounded-xl px-3 py-2 text-[13px]"
                  style={{ left: `${Math.min(70, (x(hover) / 640) * 100)}%` }}
                >
                  <p className="font-semibold">{t(monthKey(hovered.month))}</p>
                  <p>
                    {t('dash.chart.revenue')}: {money(hovered.revenue)}
                  </p>
                  <p>
                    {t('dash.chart.expenses')}: {money(hovered.expenses)}
                  </p>
                  <p>
                    {t('dash.chart.profit')}: {money(hovered.profit)}
                  </p>
                </div>
              )}
            </div>
            <details className="text-[13px]">
              <summary className="cursor-pointer text-text2">{t('dash.chart.table')}</summary>
              <table aria-label={title} className="mt-2 w-full">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="py-1">{t('dash.chart.month')}</th>
                    <th className="py-1 text-right">{t('dash.chart.revenue')}</th>
                    <th className="py-1 text-right">{t('dash.chart.expenses')}</th>
                    <th className="py-1 text-right">{t('dash.chart.profit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month} className="border-t border-row-border">
                      <td className="py-1">
                        {t(monthKey(m.month))}
                        {m.estimate && ` (${t('dash.chart.estimateShort')})`}
                      </td>
                      <td className="num py-1 text-right">{money(m.revenue)}</td>
                      <td className="num py-1 text-right">{money(m.expenses)}</td>
                      <td className="num py-1 text-right">{money(m.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        );
      }}
    </ReportCard>
  );
}

const RING = 2 * Math.PI * 60;
const BUSINESS_COLORS = ['var(--biz-a)', 'var(--biz-b)'];

/** The design's "Revenue by business" ring: each business's month-to-date revenue and share, labelled. */
export function RevenueByBusiness() {
  const { t, locale } = useI18n();
  const loc = locale === 'bn' ? 'bn-BD' : 'en-BD';
  const sales = useReport('salesToday');
  return (
    <ReportCard title={t('dash.business.title')} calls={['salesToday']} queries={[sales]}>
      {() => {
        const rows = sales.data?.byBusiness ?? [];
        const total = sumMoney(rows.map((r) => parseMoney(r.monthToDate)));
        if (rows.length === 0 || total <= 0n)
          return <p className="text-[13px] text-text2">{t('dash.business.empty')}</p>;
        let offset = 0;
        return (
          <div className="flex flex-col items-center gap-4">
            <svg viewBox="0 0 160 160" className="size-36 -rotate-90" aria-hidden="true">
              {rows.map((r, i) => {
                const fraction = Number(ratioBasisPoints(parseMoney(r.monthToDate), total)) / 10_000;
                const length = Math.max(0, fraction * RING - 2); // a 2px gap between slices
                const slice = (
                  <circle
                    key={r.businessId}
                    cx="80"
                    cy="80"
                    r="60"
                    fill="none"
                    stroke={BUSINESS_COLORS[i % BUSINESS_COLORS.length]}
                    strokeWidth="18"
                    strokeDasharray={`${length} ${RING - length}`}
                    strokeDashoffset={-offset}
                  >
                    <title>{r.name}</title>
                  </circle>
                );
                offset += fraction * RING;
                return slice;
              })}
            </svg>
            <ul className="flex w-full flex-col gap-2 text-[13px]">
              {rows.map((r, i) => (
                <li key={r.businessId} className="flex items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: BUSINESS_COLORS[i % BUSINESS_COLORS.length] }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                  <span className="num text-text2">
                    ৳{formatLakhCrore(r.monthToDate, loc)} ·{' '}
                    {formatShare(parseMoney(r.monthToDate), total, loc)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      }}
    </ReportCard>
  );
}
