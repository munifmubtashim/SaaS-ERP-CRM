import { formatLongDateBD, formatTaka, type VehicleUnit } from '@erp/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useServices } from '../../app/servicesContext';
import { DemoBadge } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { pill, ProductsPage } from '../product';
import { filterUnits, unitSummary, type UnitFilter } from './units';
import { useVehiclePack } from './useVehiclePack';

const FILTERS: UnitFilter[] = ['all', 'in_stock', 'reserved', 'sold', 'old'];
const STATUS_TONE = {
  in_stock: 'bg-pos-bg text-pos-text',
  reserved: 'bg-accent-soft text-accent-text',
  sold: 'bg-warn-bg text-warn-text',
  delivered: 'bg-track text-text2',
};
const STEPS = ['papers_sent', 'fee_paid', 'registered', 'plate_fitted'] as const;
const card = 'glass flex min-w-0 flex-col gap-3 rounded-3xl p-4';
const kv = 'flex justify-between gap-3 text-[13px]';

/** Products with the Vehicle pack's Units view added when the pack is on (spec O-11: units are pack only). */
export function VehicleProductsPage() {
  const { t } = useI18n();
  const pack = useVehiclePack();
  return (
    <ProductsPage
      packViews={pack ? [{ key: 'units', label: t('veh.view.units'), element: <UnitsView /> }] : []}
    />
  );
}

function StatusChip({ status }: { status: VehicleUnit['status'] }) {
  const { t } = useI18n();
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS_TONE[status]}`}
    >
      {t(`veh.status.${status}` as MessageKey)}
    </span>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[13px] text-text2">{label}</span>
      <span className="num text-2xl font-semibold">{t('prod.count', { count: value })}</span>
      <span className="text-xs text-muted">{note}</span>
    </div>
  );
}

function UnitsView() {
  const { t } = useI18n();
  const { vehicle } = useServices();
  const units = useQuery({ queryKey: ['vehicle', 'units'], queryFn: () => vehicle.units() });
  const [filter, setFilter] = useState<UnitFilter>('all');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const all = units.data ?? [];
  const shown = filterUnits(all, search, filter);
  const summary = units.data ? unitSummary(units.data) : null;
  return (
    <div className="flex flex-col gap-4">
      {summary && (
        <section aria-label={t('veh.summary')} className="glass grid gap-4 rounded-[28px] p-5 sm:grid-cols-3">
          <Stat
            label={t('veh.stat.available')}
            value={summary.available}
            note={t('veh.stat.availableNote', { count: summary.availableOld })}
          />
          <Stat label={t('veh.stat.reserved')} value={summary.reserved} note={t('veh.stat.reservedNote')} />
          <Stat
            label={t('veh.stat.notDelivered')}
            value={summary.notDelivered}
            note={t('veh.stat.notDeliveredNote')}
          />
        </section>
      )}
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <section aria-label={t('veh.units')} className={card}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold">{t('veh.units')}</h2>
              {units.data && (
                <p className="text-[13px] text-text2">
                  {t('veh.caption', { shown: shown.length, total: all.length })}
                </p>
              )}
            </div>
            <DemoBadge service="vehicle" />
          </div>
          <input
            type="search"
            aria-label={t('veh.search')}
            placeholder={t('veh.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-row-border bg-chip px-3 text-text placeholder:text-muted"
          />
          <div role="group" aria-label={t('veh.filter.aria')} className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                className={pill}
                onClick={() => setFilter(f)}
              >
                {t(`veh.filter.${f}` as MessageKey)}
              </button>
            ))}
          </div>
          {units.isPending ? (
            <p role="status" className="text-[13px] text-text2">
              {t('veh.loading')}
            </p>
          ) : units.isError ? (
            <p role="alert" className="text-[13px] text-neg-text">
              {t('veh.loadError')}
            </p>
          ) : shown.length === 0 ? (
            <p className="text-[13px] text-text2">{t('veh.noMatch')}</p>
          ) : (
            <ul className="flex flex-col">
              <li
                aria-hidden="true"
                className="hidden grid-cols-[1.1fr_1.5fr_1.3fr_auto_0.6fr] gap-x-3 px-2 pb-1 text-xs font-semibold text-muted sm:grid"
              >
                <span>{t('veh.col.chassis')}</span>
                <span>{t('veh.col.model')}</span>
                <span>{t('veh.col.customer')}</span>
                <span className="w-32">{t('veh.col.status')}</span>
                <span className="text-right">{t('veh.col.days')}</span>
              </li>
              {shown.map((u) => (
                <li key={u.chassisNo}>
                  <button
                    type="button"
                    aria-current={picked === u.chassisNo}
                    onClick={() => setPicked(u.chassisNo)}
                    className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-t border-row-border px-2 py-3 text-left text-[13px] hover:bg-nav-hover aria-[current=true]:bg-nav-active sm:grid-cols-[1.1fr_1.5fr_1.3fr_auto_0.6fr]"
                  >
                    <span className="flex flex-col">
                      <b className="num">{u.chassisNo}</b>
                      <span className="num text-xs text-muted">{u.engineNo}</span>
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <b className="truncate">{u.model}</b>
                      <span className="text-xs text-muted">
                        {t('veh.where', { colour: u.colour, branch: u.branchName })}
                      </span>
                    </span>
                    <span className="hidden truncate text-text2 sm:block">{u.customerName ?? '—'}</span>
                    <span className="sm:w-32">
                      <StatusChip status={u.status} />
                    </span>
                    <span
                      className={`num text-right ${u.daysInStock >= 90 && u.status !== 'sold' ? 'font-semibold text-warn-text' : 'text-text2'}`}
                    >
                      {u.status === 'in_stock' || u.status === 'reserved'
                        ? t('veh.days', { count: u.daysInStock })
                        : '—'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label={t('veh.details')} className={card}>
          {picked === null ? (
            <div className="flex flex-col gap-1 text-[13px]">
              <b>{t('veh.pick')}</b>
              <span className="text-text2">{t('veh.pickHint')}</span>
            </div>
          ) : (
            <UnitDetails chassisNo={picked} />
          )}
        </section>
      </div>
    </div>
  );
}

function UnitDetails({ chassisNo }: { chassisNo: string }) {
  const { t, locale } = useI18n();
  const loc = locale === 'bn' ? 'bn-BD' : 'en-BD';
  const { vehicle } = useServices();
  const detail = useQuery({
    queryKey: ['vehicle', 'unit', chassisNo],
    queryFn: () => vehicle.unit(chassisNo),
  });
  if (detail.isError)
    return (
      <p role="alert" className="text-[13px] text-neg-text">
        {t('veh.loadError')}
      </p>
    );
  if (!detail.data)
    return (
      <p role="status" className="text-[13px] text-text2">
        {t('veh.loading')}
      </p>
    );
  const u = detail.data;
  const waiting = u.status === 'in_stock' || u.status === 'reserved';
  const facts: [MessageKey, string][] = [
    ['veh.chassisNo', u.chassisNo],
    ['veh.engineNo', u.engineNo],
    ['veh.branch', u.branchName],
    ['veh.received', formatLongDateBD(`${u.receivedOn}T06:00:00.000Z`, loc)],
    ['veh.daysInStock', waiting ? t('prod.count', { count: u.daysInStock }) : '—'],
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="num text-lg font-semibold">{u.chassisNo}</h2>
          <p className="text-[13px] text-text2">{u.model}</p>
        </div>
        <StatusChip status={u.status} />
      </div>
      {facts.map(([key, value]) => (
        <div key={key} className={kv}>
          <span className="text-text2">{t(key)}</span>
          <span className="num">{value}</span>
        </div>
      ))}
      {u.customerName && (
        <div className="flex flex-col gap-2 border-t border-row-border pt-3">
          <div className={kv}>
            <span className="text-text2">{t('veh.customer')}</span>
            <span>{u.customerName}</span>
          </div>
          {u.invoiceNumber && (
            <div className={kv}>
              <span className="text-text2">{t('veh.invoice')}</span>
              <span className="num">{u.invoiceNumber}</span>
            </div>
          )}
          {u.advance && (
            <div className={kv}>
              <span className="text-text2">{t('veh.advance')}</span>
              <span className="num">৳{formatTaka(u.advance, loc)}</span>
            </div>
          )}
        </div>
      )}
      {(u.status === 'sold' || u.status === 'delivered') && (
        <div className="flex flex-col gap-2 border-t border-row-border pt-3">
          <h3 id={`reg-${u.chassisNo}`} className="text-xs font-semibold text-muted">
            {t('veh.registration')}
          </h3>
          <ul aria-labelledby={`reg-${u.chassisNo}`} className="flex flex-wrap gap-1.5">
            {STEPS.map((step) => {
              const done = u.registrationDone.includes(step);
              return (
                <li
                  key={step}
                  data-done={done}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${done ? 'bg-pos-bg text-pos-text' : 'bg-track text-text2'}`}
                >
                  {t(`veh.reg.${step}` as MessageKey)}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
