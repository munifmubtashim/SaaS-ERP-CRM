import { formatDateTimeBD, formatTaka, type StockItem, type StockMovement } from '@erp/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useServices } from '../../app/servicesContext';
import { DemoBadge } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { filterStock, stockSummary, type StockFilter } from './stock';

const FILTERS: StockFilter[] = ['all', 'low', 'out'];
const STATUS_TONE = {
  in_stock: 'bg-pos-bg text-pos-text',
  low: 'bg-warn-bg text-warn-text',
  out: 'bg-neg-bg text-neg-text',
};
const pill =
  'min-h-10 rounded-full px-4 text-[13px] text-text2 aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent-text';
const card = 'glass flex min-w-0 flex-col gap-3 rounded-3xl p-4';
const kv = 'flex justify-between gap-3 text-[13px]';

/**
 * Inventory, the list half (design/owner-dashboard/Inventory.dc.html): a summary, the stock list with search and a
 * status filter, the picked item's stock at each branch and latest movements, and every movement. Adjusting stock
 * is shown but not available yet (PR 4b); transfers are not in the demo (ADR 0054). Owner: Munif.
 */
export function InventoryPage() {
  const { t } = useI18n();
  const { inventory } = useServices();
  const [view, setView] = useState<'stock' | 'moves'>('stock');
  const [search, setSearch] = useState('');
  const items = useQuery({ queryKey: ['inventory', 'items'], queryFn: () => inventory.stockItems() });
  const summary = items.data ? stockSummary(items.data) : null;
  const { locale } = useI18n();
  const loc = locale === 'bn' ? 'bn-BD' : 'en-BD';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="num text-[28px] font-bold">{t('shell.nav.inventory')}</h1>
          <p className="text-[13px] text-text2">{t('invt.subtitle')}</p>
        </div>
        <input
          type="search"
          aria-label={t('invt.search')}
          placeholder={t('invt.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="glass min-h-11 w-full rounded-full px-4 text-text placeholder:text-muted sm:w-72"
        />
      </div>
      {summary && (
        <section
          aria-label={t('invt.summary')}
          className="glass grid gap-4 rounded-[28px] p-5 sm:grid-cols-3"
        >
          <Stat
            label={t('invt.stat.value')}
            value={summary.valueAtCost ? `৳${formatTaka(summary.valueAtCost, loc)}` : t('invt.hidden')}
            note={t('invt.stat.valueNote')}
          />
          <Stat
            label={t('invt.stat.items')}
            value={t('invt.count', { count: summary.items })}
            note={t('invt.stat.itemsNote')}
          />
          <Stat
            label={t('invt.stat.low')}
            value={t('invt.count', { count: summary.low + summary.out })}
            note={t('invt.stat.lowNote', { low: summary.low, out: summary.out })}
          />
        </section>
      )}
      <div
        role="group"
        aria-label={t('invt.view.aria')}
        className="flex w-fit gap-1 rounded-full bg-track p-1"
      >
        {(['stock', 'moves'] as const).map((v) => (
          <button key={v} type="button" aria-pressed={view === v} className={pill} onClick={() => setView(v)}>
            {t(v === 'stock' ? 'invt.view.stock' : 'invt.view.moves')}
          </button>
        ))}
      </div>
      {view === 'stock' ? <StockView items={items} search={search} /> : <MovementsView search={search} />}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[13px] text-text2">{label}</span>
      <span className="num text-2xl font-semibold">{value}</span>
      <span className="text-xs text-muted">{note}</span>
    </div>
  );
}

function StatusChip({ status }: { status: StockItem['status'] }) {
  const { t } = useI18n();
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS_TONE[status]}`}
    >
      {t(`invt.status.${status}` as MessageKey)}
    </span>
  );
}

function StockView({
  items,
  search,
}: {
  items: { data?: StockItem[]; isPending: boolean; isError: boolean };
  search: string;
}) {
  const { t, locale } = useI18n();
  const loc = locale === 'bn' ? 'bn-BD' : 'en-BD';
  const [filter, setFilter] = useState<StockFilter>('all');
  const [picked, setPicked] = useState<string | null>(null);
  const all = items.data ?? [];
  const shown = filterStock(all, search, filter);
  return (
    <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
      <section aria-label={t('invt.list')} className={card}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">{t('invt.view.stock')}</h2>
            {items.data && (
              <p className="text-[13px] text-text2">
                {t('invt.caption', { shown: shown.length, total: all.length })}
              </p>
            )}
          </div>
          <DemoBadge service="inventory" />
        </div>
        <div role="group" aria-label={t('invt.filter.aria')} className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              className={pill}
              onClick={() => setFilter(f)}
            >
              {t(f === 'all' ? 'invt.filter.all' : (`invt.status.${f}` as MessageKey))}
            </button>
          ))}
        </div>
        {items.isPending ? (
          <p role="status" className="text-[13px] text-text2">
            {t('invt.loading')}
          </p>
        ) : items.isError ? (
          <p role="alert" className="text-[13px] text-neg-text">
            {t('invt.loadError')}
          </p>
        ) : shown.length === 0 ? (
          <p className="text-[13px] text-text2">{t('invt.noMatch')}</p>
        ) : (
          <ul className="flex flex-col">
            <li
              aria-hidden="true"
              className="hidden grid-cols-[2fr_1fr_0.7fr_1fr_auto] gap-x-3 px-2 pb-1 text-xs font-semibold text-muted sm:grid"
            >
              <span>{t('invt.col.item')}</span>
              <span>{t('invt.col.category')}</span>
              <span className="text-right">{t('invt.col.onHand')}</span>
              <span className="text-right">{t('invt.col.value')}</span>
              <span className="w-24">{t('invt.col.status')}</span>
            </li>
            {shown.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={picked === item.id}
                  onClick={() => setPicked(item.id)}
                  className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-t border-row-border px-2 py-3 text-left text-[13px] hover:bg-nav-hover aria-[current=true]:bg-nav-active sm:grid-cols-[2fr_1fr_0.7fr_1fr_auto]"
                >
                  <span className="flex min-w-0 flex-col">
                    <b className="truncate">{item.name}</b>
                    <span className="text-xs text-muted">{item.sku}</span>
                  </span>
                  <span className="hidden text-text2 sm:block">{item.category}</span>
                  <span className="num text-right">{t('invt.count', { count: Number(item.onHand) })}</span>
                  <span className="num hidden text-right text-text2 sm:block">
                    {item.valueAtCost ? `৳${formatTaka(item.valueAtCost, loc)}` : '—'}
                  </span>
                  <span className="col-span-2 sm:col-span-1 sm:w-24">
                    <StatusChip status={item.status} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label={t('invt.details')} className={card}>
        {picked === null ? (
          <div className="flex flex-col gap-1 text-[13px]">
            <b>{t('invt.pick')}</b>
            <span className="text-text2">{t('invt.pickHint')}</span>
          </div>
        ) : (
          <ItemDetails id={picked} />
        )}
      </section>
    </div>
  );
}

function ItemDetails({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const loc = locale === 'bn' ? 'bn-BD' : 'en-BD';
  const taka = (amount: string) => `৳${formatTaka(amount, loc)}`;
  const { inventory } = useServices();
  const detail = useQuery({ queryKey: ['inventory', 'item', id], queryFn: () => inventory.stockItem(id) });
  const moves = useQuery({ queryKey: ['inventory', 'moves', id], queryFn: () => inventory.movements(id) });
  if (detail.isError)
    return (
      <p role="alert" className="text-[13px] text-neg-text">
        {t('invt.loadError')}
      </p>
    );
  if (!detail.data)
    return (
      <p role="status" className="text-[13px] text-text2">
        {t('invt.loading')}
      </p>
    );
  const item = detail.data;
  const most = Math.max(1, ...item.byBranch.map((b) => Number(b.onHand)));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="num text-lg font-semibold">{item.name}</h2>
          <p className="text-[13px] text-text2">{item.sku}</p>
        </div>
        <StatusChip status={item.status} />
      </div>
      <h3 className="text-xs font-semibold text-muted">{t('invt.byBranch')}</h3>
      {item.byBranch.map((b) => (
        <div key={b.branchId} className="flex flex-col gap-1">
          <div className={kv}>
            <span>{b.branchName}</span>
            <span className="num">{t('invt.count', { count: Number(b.onHand) })}</span>
          </div>
          <div
            role="img"
            aria-label={t('invt.branchAria', { branch: b.branchName, count: Number(b.onHand) })}
            className="h-2 rounded-full bg-track"
          >
            <div
              className={`gloss h-full rounded-full ${Number(b.onHand) <= 0 ? 'bg-neg' : 'bg-c1'}`}
              style={{ width: `${(Number(b.onHand) / most) * 100}%` }}
            />
          </div>
        </div>
      ))}
      <div className="flex flex-col gap-2 border-t border-row-border pt-3">
        {(
          [
            ['invt.total', t('invt.count', { count: Number(item.onHand) })],
            ['invt.reserved', t('invt.count', { count: Number(item.reserved) })],
            ['invt.reorder', t('invt.count', { count: Number(item.reorderLevel) })],
            ['invt.unitCost', item.unitCost ? taka(item.unitCost) : t('invt.hidden')],
            ['invt.value', item.valueAtCost ? taka(item.valueAtCost) : t('invt.hidden')],
          ] as [MessageKey, string][]
        ).map(([key, value]) => (
          <div key={key} className={kv}>
            <span>{t(key)}</span>
            <span className="num">{value}</span>
          </div>
        ))}
      </div>
      <h3 className="border-t border-row-border pt-3 text-xs font-semibold text-muted">{t('invt.latest')}</h3>
      {(moves.data ?? []).length === 0 ? (
        <p className="text-[13px] text-text2">{t('invt.noMoves')}</p>
      ) : (
        (moves.data ?? []).slice(0, 4).map((m) => (
          <div key={m.id} className={kv}>
            <span className="flex flex-col">
              <span>
                {t(`invt.type.${m.type}` as MessageKey)}, {m.branchName}
              </span>
              <span className="text-xs text-muted">
                {formatDateTimeBD(m.at, loc)}, {m.reference}
              </span>
            </span>
            <Delta value={m.quantityDelta} />
          </div>
        ))
      )}
      <div className="border-t border-row-border pt-3">
        <button
          type="button"
          disabled
          title={t('shell.notAvailable')}
          className="min-h-11 rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-60"
        >
          {t('invt.adjust')}
        </button>
      </div>
    </div>
  );
}

/** A signed quantity: a true minus sign and red for stock out, a plus and green for stock in. */
function Delta({ value }: { value: StockMovement['quantityDelta'] }) {
  const { t } = useI18n();
  const out = value.startsWith('-');
  return (
    <span className={`num font-semibold ${out ? 'text-neg-text' : 'text-pos-text'}`}>
      {t('invt.delta', { sign: out ? '−' : '+', count: Number(value.replace('-', '')) })}
    </span>
  );
}

function MovementsView({ search }: { search: string }) {
  const { t, locale } = useI18n();
  const loc = locale === 'bn' ? 'bn-BD' : 'en-BD';
  const { inventory } = useServices();
  const moves = useQuery({ queryKey: ['inventory', 'moves', 'all'], queryFn: () => inventory.movements() });
  const term = search.trim().toLowerCase();
  const shown = (moves.data ?? []).filter(
    (m) => !term || m.itemName.toLowerCase().includes(term) || m.reference.toLowerCase().includes(term),
  );
  return (
    <section aria-label={t('invt.moves')} className={card}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{t('invt.view.moves')}</h2>
          <p className="text-[13px] text-text2">{t('invt.movesCaption')}</p>
        </div>
        <DemoBadge service="inventory" />
      </div>
      {moves.isPending ? (
        <p role="status" className="text-[13px] text-text2">
          {t('invt.loading')}
        </p>
      ) : moves.isError ? (
        <p role="alert" className="text-[13px] text-neg-text">
          {t('invt.loadError')}
        </p>
      ) : shown.length === 0 ? (
        <p className="text-[13px] text-text2">{t('invt.noMovesMatch')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-semibold">{t('invt.col.when')}</th>
                <th className="py-1 font-semibold">{t('invt.col.item')}</th>
                <th className="py-1 font-semibold">{t('invt.col.branch')}</th>
                <th className="py-1 font-semibold">{t('invt.col.type')}</th>
                <th className="py-1 text-right font-semibold">{t('invt.col.qty')}</th>
                <th className="py-1 font-semibold">{t('invt.col.ref')}</th>
                <th className="py-1 font-semibold">{t('invt.col.by')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} className="border-t border-row-border">
                  <td className="py-2 text-text2">{formatDateTimeBD(m.at, loc)}</td>
                  <td className="py-2">{m.itemName}</td>
                  <td className="py-2 text-text2">{m.branchName}</td>
                  <td className="py-2">{t(`invt.type.${m.type}` as MessageKey)}</td>
                  <td className="py-2 text-right">
                    <Delta value={m.quantityDelta} />
                  </td>
                  <td className="num py-2 text-text2">{m.reference}</td>
                  <td className="py-2 text-text2">{m.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
