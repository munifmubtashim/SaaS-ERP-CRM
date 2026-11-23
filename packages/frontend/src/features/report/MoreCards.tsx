import { formatLakhCrore, formatLongDateBD, formatShare, formatTaka } from '@erp/shared';
import type { NeedsAction } from '@erp/shared';
import { useI18n, type MessageKey } from '../../i18n';
import { branchResults, chartFrame, customerShares } from './derive';
import { ReportCard } from './ReportCard';
import { useReport } from './useReport';

/** "৳52.4 lakh", and a loss as "-৳71,000" (the sign before the taka sign). */
function useMoney() {
  const { locale } = useI18n();
  const loc: 'bn-BD' | 'en-BD' = locale === 'bn' ? 'bn-BD' : 'en-BD';
  const signed = (text: string) => (text.startsWith('-') ? `-৳${text.slice(1)}` : `৳${text}`);
  return {
    loc,
    lakh: (a: string) => signed(formatLakhCrore(a, loc)),
    taka: (a: string) => signed(formatTaka(a, loc)),
  };
}

const BUSINESS_TONES = ['bg-biz-a', 'bg-biz-b'];

/** The design's "Revenue by branch" bars and "Profit by branch" card (business totals, then every branch). */
export function BranchCards() {
  const { t } = useI18n();
  const { loc, lakh } = useMoney();
  const results = useReport('branchResults');
  return (
    <>
      <ReportCard title={t('dash.branch.revenueTitle')} calls={['branchResults']} queries={[results]}>
        {() => {
          const branches = results.data?.branches ?? [];
          const frame = chartFrame(branches.map((b) => b.revenue));
          const businesses = [...new Set(branches.map((b) => b.businessName))];
          return (
            <ul className="flex flex-col gap-2 text-[13px]">
              {branches.map((b) => (
                <li key={b.branchId} className="flex flex-col gap-1">
                  <div className="flex justify-between gap-2">
                    <span className="truncate">
                      {t('dash.branch.label', { branch: b.branchName, business: b.businessName })}
                    </span>
                    <span className="num font-semibold">{lakh(b.revenue)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-track" aria-hidden="true">
                    <div
                      className={`h-full rounded-full ${BUSINESS_TONES[businesses.indexOf(b.businessName) % 2]}`}
                      style={{ width: `${frame.position(b.revenue) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          );
        }}
      </ReportCard>
      <ReportCard title={t('dash.branch.profitTitle')} calls={['branchResults']} queries={[results]}>
        {() => {
          const derived = branchResults(results.data?.branches ?? []);
          const marginText = (m: { part: bigint; whole: bigint } | null) =>
            m ? formatShare(m.part, m.whole, loc) : '—';
          return (
            <div className="flex flex-col gap-3 text-[13px]">
              <ul className="flex flex-wrap gap-4">
                {derived.businesses.map((b) => (
                  <li key={b.businessName} className="flex flex-col">
                    <span className="text-muted">{b.businessName}</span>
                    <span className="num font-semibold">
                      {t('dash.branch.profitLine', { profit: lakh(b.profit), margin: marginText(b.margin) })}
                    </span>
                  </li>
                ))}
              </ul>
              <table className="w-full">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="py-1">{t('dash.branch.branch')}</th>
                    <th className="py-1 text-right">{t('dash.chart.revenue')}</th>
                    <th className="py-1 text-right">{t('dash.chart.profit')}</th>
                    <th className="py-1 text-right">{t('dash.branch.margin')}</th>
                  </tr>
                </thead>
                <tbody>
                  {derived.branches.map((b) => (
                    <tr key={b.branchId} className="border-t border-row-border">
                      <td className="py-1">
                        <span className="block">{b.branchName}</span>
                        <span className="text-xs text-muted">{b.businessName}</span>
                      </td>
                      <td className="num py-1 text-right">{lakh(b.revenue)}</td>
                      <td
                        className={`num py-1 text-right ${b.profit.startsWith('-') ? 'text-neg-text' : ''}`}
                      >
                        {lakh(b.profit)}
                      </td>
                      <td className="num py-1 text-right">{marginText(b.margin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </ReportCard>
    </>
  );
}

/** The design's "Customer insights": buyers, repeat rate, the top five's share, and the top customers. */
export function CustomerCard() {
  const { t } = useI18n();
  const { loc, taka } = useMoney();
  const insights = useReport('customerInsights');
  return (
    <ReportCard title={t('dash.customers.title')} calls={['customerInsights']} queries={[insights]}>
      {() => {
        const data = insights.data;
        if (!data) return null;
        const shares = customerShares(data);
        return (
          <div className="flex flex-col gap-3 text-[13px]">
            <p className="text-text2">{t('dash.customers.bought', { count: data.customersBought })}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col">
                <span className="text-muted">{t('dash.customers.repeatRate')}</span>
                <span className="num text-xl font-bold">
                  {shares.repeat ? formatShare(shares.repeat.part, shares.repeat.whole, loc, 0) : '—'}
                </span>
                <span className="text-xs text-text2">
                  {t('dash.customers.split', { repeat: data.repeatCustomers, new: shares.newBuyers })}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted">{t('dash.customers.top5')}</span>
                <span className="num text-xl font-bold">
                  {shares.top ? formatShare(shares.top.part, shares.top.whole, loc, 0) : '—'}
                </span>
                <span className="text-xs text-text2">{t('dash.customers.ofRevenue')}</span>
              </div>
            </div>
            <ul className="flex flex-col gap-1">
              {data.topCustomers.map((c) => (
                <li key={c.name} className="flex justify-between gap-2 border-t border-row-border py-1">
                  <span className="truncate">{c.name}</span>
                  <span className="num font-semibold">{taka(c.revenue)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      }}
    </ReportCard>
  );
}

type Item = NeedsAction['items'][number];
const ACTION_TITLE: Record<Item['kind'], MessageKey> = {
  unit_sold_not_delivered: 'dash.action.unitSold',
  bank_receipt_unmatched: 'dash.action.bankReceipt',
  parts_below_reorder: 'dash.action.belowReorder',
  supplier_duplicates: 'dash.action.supplierDuplicates',
};
const ACTION_CTA: Record<Item['kind'], MessageKey> = {
  unit_sold_not_delivered: 'dash.action.review',
  bank_receipt_unmatched: 'dash.action.match',
  parts_below_reorder: 'dash.action.reorder',
  supplier_duplicates: 'dash.action.merge',
};

/** The design's "Needs action": severity in words and colour, what and where, and an action not available yet. */
export function NeedsActionCard() {
  const { t } = useI18n();
  const { taka } = useMoney();
  const actions = useReport('needsAction');
  return (
    <ReportCard title={t('dash.action.title')} calls={['needsAction']} queries={[actions]}>
      {() => {
        const items = actions.data?.items ?? [];
        if (items.length === 0) return <p className="text-[13px] text-text2">{t('dash.action.none')}</p>;
        return (
          <ul className="flex flex-col gap-2 text-[13px]">
            {items.map((item) => {
              const where = [item.businessName, item.branchName].filter(Boolean).join(', ');
              const meta = [
                item.kind === 'unit_sold_not_delivered' && item.amount
                  ? t('dash.action.unpaid', { amount: taka(item.amount) })
                  : null,
                item.kind === 'bank_receipt_unmatched' && item.amount ? taka(item.amount) : null,
                where || null,
                t('dash.action.age', { days: item.ageDays }),
              ].filter(Boolean);
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-2 border-t border-row-border py-2"
                >
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.severity === 'critical' ? 'bg-neg-bg text-neg-text' : 'bg-warn-bg text-warn-text'}`}
                  >
                    {t(item.severity === 'critical' ? 'dash.action.critical' : 'dash.action.warning')}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold">
                      {t(ACTION_TITLE[item.kind], { count: item.count ?? 0 })}
                    </span>
                    <span className="text-xs text-text2">{meta.join(' · ')}</span>
                  </span>
                  <button
                    type="button"
                    disabled
                    title={t('shell.notAvailable')}
                    className="min-h-10 rounded-full border border-row-border px-3 text-text2 disabled:opacity-60"
                  >
                    {t(ACTION_CTA[item.kind])}
                  </button>
                </li>
              );
            })}
          </ul>
        );
      }}
    </ReportCard>
  );
}

/** The design's "Day close", as status only: closing a period is not offered anywhere until day close (A17). */
export function DayCloseCard() {
  const { t } = useI18n();
  const { loc } = useMoney();
  const close = useReport('dayCloseStatus');
  return (
    <ReportCard title={t('dash.close.title')} calls={['dayCloseStatus']} queries={[close]}>
      {() => {
        const data = close.data;
        if (!data) return null;
        const statusKey: MessageKey =
          data.status === 'balanced'
            ? 'dash.close.balanced'
            : data.status === 'not_balanced'
              ? 'dash.close.notBalanced'
              : 'dash.close.notStarted';
        return (
          <div className="flex flex-col gap-1 text-[13px]">
            <span className={`text-xl font-bold ${data.status === 'not_balanced' ? 'text-warn-text' : ''}`}>
              {t(statusKey)}
            </span>
            <span className="text-text2">
              {t('dash.close.detail', { count: data.unmatchedBankItems })}
              {data.lastClosedOn &&
                ` ${t('dash.close.last', { date: formatLongDateBD(`${data.lastClosedOn}T06:00:00.000Z`, loc) })}`}
            </span>
          </div>
        );
      }}
    </ReportCard>
  );
}

/** The design's bike stock card, in generic core words ("units"): serial-tracked units by status. */
export function UnitStockCard() {
  const { t } = useI18n();
  const units = useReport('unitStock');
  return (
    <ReportCard title={t('dash.units.title')} calls={['unitStock']} queries={[units]}>
      {() => {
        const data = units.data;
        if (!data) return null;
        const rows: [MessageKey, number][] = [
          ['dash.units.available', data.available],
          ['dash.units.reserved', data.reserved],
          ['dash.units.soldNotDelivered', data.soldNotDelivered],
        ];
        return (
          <div className="flex flex-col gap-2 text-[13px]">
            <span className="num text-xl font-bold">
              {t('dash.units.total', { count: data.available + data.reserved + data.soldNotDelivered })}
            </span>
            <dl className="flex flex-col gap-1">
              {rows.map(([key, count]) => (
                <div key={key} className="flex justify-between border-t border-row-border py-1">
                  <dt className="text-text2">{t(key)}</dt>
                  <dd className="num font-semibold">{t('dash.units.count', { count })}</dd>
                </div>
              ))}
            </dl>
            {data.over90Days > 0 && (
              <p className="text-warn-text">{t('dash.units.old', { count: data.over90Days })}</p>
            )}
          </div>
        );
      }}
    </ReportCard>
  );
}
