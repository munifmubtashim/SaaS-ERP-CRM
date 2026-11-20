import type { ProductListItem, ProductStatus } from '@erp/shared';
import { useState, type FormEvent } from 'react';
import { Button, Card } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { ApiRequestError } from '../../services';
import { useProducts } from './useProducts';

const STATUS_FILTERS: { value: ProductStatus | undefined; key: MessageKey }[] = [
  { value: undefined, key: 'products.filter.all' },
  { value: 'active', key: 'products.status.active' },
  { value: 'archived', key: 'products.status.archived' },
];

const segment =
  'min-h-10 rounded-full px-4 text-text2 aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent-text';

/** Products: what do we sell, and how do I find one fast? Next action: search or filter the list. */
export function ProductListPage() {
  const { t } = useI18n();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState<string | undefined>();
  const [status, setStatus] = useState<ProductStatus | undefined>();
  const products = useProducts({ search, status });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim() || undefined);
  };

  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">{t('products.title')}</h1>
      <p className="text-muted">{t('products.subtitle')}</p>

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <form role="search" onSubmit={submit} className="flex w-full gap-2 md:max-w-md">
          <input
            type="search"
            aria-label={t('products.search')}
            placeholder={t('products.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="min-h-11 w-full rounded-md border border-card-border bg-chip px-4 text-text placeholder:text-muted"
          />
          <Button type="submit">{t('products.searchButton')}</Button>
        </form>
        <div
          role="group"
          aria-label={t('products.filter.status')}
          className="inline-flex self-start rounded-full border border-row-border p-0.5"
        >
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={segment}
              aria-pressed={status === f.value}
              onClick={() => setStatus(f.value)}
            >
              {t(f.key)}
            </button>
          ))}
        </div>
      </div>

      <Card className="mt-4">
        <ProductListBody products={products} search={search} status={status} />
      </Card>
    </>
  );
}

function ProductListBody({
  products,
  search,
  status,
}: {
  products: ReturnType<typeof useProducts>;
  search: string | undefined;
  status: ProductStatus | undefined;
}) {
  const { t } = useI18n();

  if (products.isPending) {
    return (
      <p aria-busy="true" className="text-muted">
        {t('products.loading')}
      </p>
    );
  }

  if (products.isError && !products.data) {
    if (products.error instanceof ApiRequestError && products.error.status === 403) {
      return <p className="text-muted">{t('products.forbidden')}</p>;
    }
    return (
      <div role="alert" className="space-y-4">
        <p>{t('products.error')}</p>
        <Button onClick={() => void products.refetch()}>{t('products.retry')}</Button>
      </div>
    );
  }

  const rows = products.data.pages.flatMap((page) => page.items);
  if (rows.length === 0) {
    if (search) return <p className="text-muted">{t('products.noMatch').replace('{search}', search)}</p>;
    if (status) return <p className="text-muted">{t('products.noMatchStatus')}</p>;
    return (
      <div className="space-y-1">
        <p className="font-medium">{t('products.empty')}</p>
        <p className="text-muted">{t('products.emptyHint')}</p>
      </div>
    );
  }

  return (
    <>
      <ProductTable rows={rows} />
      {products.isFetchNextPageError && (
        <p role="alert" className="mt-4 text-muted">
          {t('products.error')}
        </p>
      )}
      {products.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button disabled={products.isFetchingNextPage} onClick={() => void products.fetchNextPage()}>
            {products.isFetchingNextPage ? t('products.loadingMore') : t('products.loadMore')}
          </Button>
        </div>
      )}
    </>
  );
}

const cell = 'block md:table-cell md:py-3 md:pr-4';

/** A table on desktop; on a phone each row stacks into a small card, name first. */
function ProductTable({ rows }: { rows: ProductListItem[] }) {
  const { t } = useI18n();
  return (
    <table className="w-full text-left">
      <thead className="hidden text-[13px] text-muted md:table-header-group">
        <tr className="border-b border-row-border">
          <th className="py-2 pr-4 font-medium">{t('products.col.code')}</th>
          <th className="py-2 pr-4 font-medium">{t('products.col.name')}</th>
          <th className="py-2 pr-4 font-medium">{t('products.col.brand')}</th>
          <th className="py-2 pr-4 font-medium">{t('products.col.unit')}</th>
          <th className="py-2 pr-4 font-medium">{t('products.col.tracking')}</th>
          <th className="py-2 font-medium">{t('products.col.status')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            className="flex flex-wrap gap-x-3 border-b border-row-border py-3 md:table-row md:py-0"
          >
            <td className={`${cell} num order-2 text-muted`}>{row.code}</td>
            <td className={`${cell} order-1 w-full max-w-md truncate font-medium md:w-auto`}>{row.name}</td>
            <td className={`${cell} order-3 text-text2`}>{row.brand ?? '—'}</td>
            <td className={`${cell} order-4 text-text2`}>{row.unit}</td>
            <td className={`${cell} order-5 text-text2`}>
              {t(row.tracking === 'serial' ? 'products.tracking.serial' : 'products.tracking.quantity')}
            </td>
            <td className={`${cell} order-6`}>
              <StatusText status={row.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Archived is shown by text in a muted chip, not by colour alone; active is the normal case and stays plain. */
function StatusText({ status }: { status: ProductStatus }) {
  const { t } = useI18n();
  if (status === 'active') return <span className="text-text2">{t('products.status.active')}</span>;
  return (
    <span className="rounded-full bg-chip px-2 py-0.5 text-[13px] text-muted">
      {t('products.status.archived')}
    </span>
  );
}
