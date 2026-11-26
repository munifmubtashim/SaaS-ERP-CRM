import type { ProductStatus } from '@erp/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { useServices } from '../../app/servicesContext';
import { DemoBadge } from '../../components/ui';
import { useI18n } from '../../i18n';
import { useActiveBusinessId } from '../../store/activeBusinessStore';
import { pill } from './pill';

/**
 * Every product of the active business (GET /v1/products, #131): what do we sell? Next action: open one to edit or
 * archive it. Active products by default; archived ones on request. One page of up to 100 (the API's most): the
 * catalogue of release 1 is small; search and paging come when it is not.
 */
export function ProductCatalogue() {
  const { t } = useI18n();
  const { product } = useServices();
  const businessId = useActiveBusinessId();
  const [status, setStatus] = useState<ProductStatus>('active');
  const products = useQuery({
    queryKey: ['products', businessId, status],
    queryFn: () => product.list({ status, limit: 100 }),
  });
  const items = products.data?.items ?? [];

  return (
    <section
      aria-label={t('prod.view.catalogue')}
      className="glass flex min-w-0 flex-col gap-3 rounded-3xl p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{t('prod.view.catalogue')}</h2>
          <p className="text-[13px] text-text2">{t('prod.catalogueCaption')}</p>
        </div>
        <DemoBadge service="product.catalogue" />
      </div>
      <div
        role="group"
        aria-label={t('prod.filter.aria')}
        className="flex w-fit gap-1 rounded-full bg-track p-1"
      >
        {(['active', 'archived'] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            className={pill}
            onClick={() => setStatus(s)}
          >
            {t(`prod.filter.${s}`)}
          </button>
        ))}
      </div>
      {products.isPending ? (
        <p role="status" className="text-[13px] text-text2">
          {t('prod.catalogue.loading')}
        </p>
      ) : products.isError ? (
        <p role="alert" className="text-[13px] text-neg-text">
          {t('prod.catalogue.error')}
        </p>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-text2">
          {t(status === 'active' ? 'prod.catalogue.none' : 'prod.catalogue.noneArchived')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-semibold">{t('prod.col.product')}</th>
                <th className="hidden py-1 font-semibold md:table-cell">{t('prod.col.code')}</th>
                <th className="hidden py-1 font-semibold md:table-cell">{t('prod.col.brand')}</th>
                <th className="hidden py-1 font-semibold md:table-cell">{t('prod.col.unit')}</th>
                <th className="py-1 font-semibold">{t('prod.col.tracking')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t border-row-border">
                  <td className="py-2">
                    <Link to={`/products/${p.id}/edit`} className="font-semibold hover:text-accent-text">
                      {p.name}
                    </Link>
                    {/* A phone hides the code, brand and unit columns; code and unit stay under the name. */}
                    <span className="num block text-xs text-muted md:hidden">
                      {p.code} · {p.unit}
                    </span>
                  </td>
                  <td className="num hidden py-2 text-text2 md:table-cell">{p.code}</td>
                  <td className="hidden py-2 text-text2 md:table-cell">{p.brand ?? '—'}</td>
                  <td className="hidden py-2 text-text2 md:table-cell">{p.unit}</td>
                  <td className="py-2 text-text2">{t(`prod.tracking.${p.tracking}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
