import { formatTaka } from '@erp/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useServices } from '../../app/servicesContext';
import { DemoBadge } from '../../components/ui';
import { useI18n } from '../../i18n';

export const pill =
  'min-h-10 rounded-full px-4 text-[13px] text-text2 aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent-text';

/** A view a pack adds to the Products screen (the Vehicle pack adds Units); the core knows nothing else of it. */
export interface ProductsView {
  key: string;
  label: string;
  element: ReactNode;
}

/**
 * Products (design/owner-dashboard/Bikes.dc.html): the core shows Models; a pack may add views before it, which then
 * open first. Generic core words only (spec O-11): chassis, engine and BRTA live in features/vehicle. Owner: Munif.
 */
export function ProductsPage({ packViews = [] }: { packViews?: ProductsView[] }) {
  const { t } = useI18n();
  const views: ProductsView[] = [
    ...packViews,
    { key: 'models', label: t('prod.view.models'), element: <ModelsView /> },
  ];
  const [view, setView] = useState(views[0]?.key ?? 'models');
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="num text-[28px] font-bold">{t('shell.nav.products')}</h1>
        <p className="text-[13px] text-text2">{t('prod.subtitle')}</p>
      </div>
      {views.length > 1 && (
        <div
          role="group"
          aria-label={t('prod.view.aria')}
          className="flex w-fit gap-1 rounded-full bg-track p-1"
        >
          {views.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-pressed={view === v.key}
              className={pill}
              onClick={() => setView(v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
      {views.find((v) => v.key === view)?.element}
    </div>
  );
}

const SPLIT = [
  { key: 'inStock', tone: 'bg-c1' },
  { key: 'reserved', tone: 'bg-warn' },
  { key: 'soldThisMonth', tone: 'bg-pos' },
] as const;

function ModelsView() {
  const { t, locale } = useI18n();
  const loc = locale === 'bn' ? 'bn-BD' : 'en-BD';
  const { product } = useServices();
  const models = useQuery({ queryKey: ['product', 'models'], queryFn: () => product.models() });
  const list = models.data ?? [];
  return (
    <section aria-label={t('prod.models')} className="glass flex min-w-0 flex-col gap-3 rounded-3xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{t('prod.models')}</h2>
          <p className="text-[13px] text-text2">{t('prod.modelsCaption')}</p>
        </div>
        <DemoBadge service="product" />
      </div>
      {models.isPending ? (
        <p role="status" className="text-[13px] text-text2">
          {t('prod.loading')}
        </p>
      ) : models.isError ? (
        <p role="alert" className="text-[13px] text-neg-text">
          {t('prod.loadError')}
        </p>
      ) : list.length === 0 ? (
        <p className="text-[13px] text-text2">{t('prod.none')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-semibold">{t('prod.col.model')}</th>
                <th className="py-1 text-right font-semibold">{t('prod.col.price')}</th>
                <th className="py-1 text-right font-semibold">{t('prod.col.available')}</th>
                <th className="py-1 text-right font-semibold">{t('prod.col.reserved')}</th>
                <th className="py-1 text-right font-semibold">{t('prod.col.sold')}</th>
                <th className="w-40 py-1 pl-4 font-semibold">{t('prod.col.split')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const total = Math.max(1, m.inStock + m.reserved + m.soldThisMonth);
                return (
                  <tr key={m.id} className="border-t border-row-border">
                    <td className="py-2">
                      <b className="block">{m.name}</b>
                      <span className="text-xs text-muted">{m.businessName}</span>
                    </td>
                    <td className="num py-2 text-right">৳{formatTaka(m.price, loc)}</td>
                    <td className="num py-2 text-right">{t('prod.count', { count: m.inStock })}</td>
                    <td className="num py-2 text-right text-text2">
                      {t('prod.count', { count: m.reserved })}
                    </td>
                    <td className="num py-2 text-right text-text2">
                      {t('prod.count', { count: m.soldThisMonth })}
                    </td>
                    <td className="py-2 pl-4">
                      <div
                        role="img"
                        aria-label={t('prod.split', {
                          model: m.name,
                          available: m.inStock,
                          reserved: m.reserved,
                          sold: m.soldThisMonth,
                        })}
                        className="flex h-2.5 gap-0.5"
                      >
                        {SPLIT.map(({ key, tone }) =>
                          m[key] > 0 ? (
                            <span
                              key={key}
                              className={`gloss rounded-full ${tone}`}
                              style={{ flex: m[key] / total }}
                            />
                          ) : null,
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
