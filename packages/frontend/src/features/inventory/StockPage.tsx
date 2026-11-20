import { formatQuantityBD, type StockRow } from '@erp/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button, Card } from '../../components/ui';
import { useI18n } from '../../i18n';
import { ApiRequestError } from '../../services';
import { useStock } from './useStock';

/**
 * Stock on hand (F-01): how many of each product do we have, and where? Next action: find an item.
 * One row per product per branch; the figure is the sum of stock movements (invariant 3), read-only here.
 */
export function StockPage() {
  const { t } = useI18n();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState<string | undefined>();
  const stock = useStock({ search });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim() || undefined);
  };

  return (
    <>
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t('stock.title')}</h1>
        <Link to="/inventory/products" className="text-accent-text hover:underline">
          {t('stock.productsLink')}
        </Link>
      </div>
      <p className="text-muted">{t('stock.subtitle')}</p>

      <form role="search" onSubmit={submit} className="mt-6 flex w-full gap-2 md:max-w-md">
        <input
          type="search"
          aria-label={t('stock.search')}
          placeholder={t('stock.searchPlaceholder')}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="min-h-11 w-full rounded-md border border-card-border bg-chip px-4 text-text placeholder:text-muted"
        />
        <Button type="submit">{t('stock.searchButton')}</Button>
      </form>

      <Card className="mt-4">
        <StockBody stock={stock} search={search} />
      </Card>
    </>
  );
}

function StockBody({ stock, search }: { stock: ReturnType<typeof useStock>; search: string | undefined }) {
  const { t } = useI18n();

  if (stock.isPending) {
    return (
      <p aria-busy="true" className="text-muted">
        {t('stock.loading')}
      </p>
    );
  }

  if (stock.isError && !stock.data) {
    if (stock.error instanceof ApiRequestError && stock.error.status === 403) {
      return <p className="text-muted">{t('stock.forbidden')}</p>;
    }
    return (
      <div role="alert" className="space-y-4">
        <p>{t('stock.error')}</p>
        <Button onClick={() => void stock.refetch()}>{t('stock.retry')}</Button>
      </div>
    );
  }

  const rows = stock.data.pages.flatMap((page) => page.items);
  if (rows.length === 0) {
    if (search) return <p className="text-muted">{t('stock.noMatch').replace('{search}', search)}</p>;
    return (
      <div className="space-y-1">
        <p className="font-medium">{t('stock.empty')}</p>
        <p className="text-muted">{t('stock.emptyHint')}</p>
      </div>
    );
  }

  return (
    <>
      <StockTable rows={rows} />
      {stock.isFetchNextPageError && (
        <p role="alert" className="mt-4 text-muted">
          {t('stock.error')}
        </p>
      )}
      {stock.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button disabled={stock.isFetchingNextPage} onClick={() => void stock.fetchNextPage()}>
            {stock.isFetchingNextPage ? t('stock.loadingMore') : t('stock.loadMore')}
          </Button>
        </div>
      )}
    </>
  );
}

const cell = 'block md:table-cell md:py-3 md:pr-4';

/** A table on desktop; on a phone each row stacks into a small card, product first, quantity last. */
function StockTable({ rows }: { rows: StockRow[] }) {
  const { t, locale } = useI18n();
  const format = locale === 'bn' ? 'bn-BD' : 'en-BD';
  return (
    <table className="w-full text-left">
      <thead className="hidden text-[13px] text-muted md:table-header-group">
        <tr className="border-b border-row-border">
          <th className="py-2 pr-4 font-medium">{t('stock.col.code')}</th>
          <th className="py-2 pr-4 font-medium">{t('stock.col.product')}</th>
          <th className="py-2 pr-4 font-medium">{t('stock.col.branch')}</th>
          <th className="py-2 text-right font-medium">{t('stock.col.onHand')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const out = /^0\.0+$/.test(row.onHand);
          return (
            <tr
              key={`${row.productId}:${row.branchId}`}
              className="flex flex-wrap gap-x-3 border-b border-row-border py-3 md:table-row md:py-0"
            >
              <td className={`${cell} num order-2 text-muted`}>{row.productCode}</td>
              <td className={`${cell} order-1 w-full max-w-md truncate font-medium md:w-auto`}>
                {row.productName}
              </td>
              <td className={`${cell} order-3 text-text2`}>{row.branchName}</td>
              <td className={`${cell} num order-4 ml-auto md:text-right`}>
                {out ? (
                  <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[13px] font-semibold text-warn-text">
                    {t('stock.outOfStock')}
                  </span>
                ) : (
                  formatQuantityBD(row.onHand, format)
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
