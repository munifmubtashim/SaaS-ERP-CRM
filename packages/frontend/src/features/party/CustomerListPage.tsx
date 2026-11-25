import type { PartyListItem, PartyStatus } from '@erp/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Card, DemoBadge } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { ApiRequestError } from '../../services';
import { useActiveBusinessId } from '../../store/activeBusinessStore';
import { useCustomers } from './useCustomers';
import { useDebouncedValue } from './useDebouncedValue';

const STATUS_FILTERS: { value: PartyStatus | undefined; key: MessageKey }[] = [
  { value: undefined, key: 'customers.filter.all' },
  { value: 'active', key: 'customers.status.active' },
  { value: 'inactive', key: 'customers.status.inactive' },
];

const segment =
  'min-h-11 rounded-full px-4 text-text2 aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent-text';

/**
 * Customers (F1b): who are my customers, and how do I find one fast? Next action: open a customer.
 * Keyed by the active business, so a switch starts a fresh list: the search, filter and loaded pages reset
 * (ADR 0007).
 */
export function CustomerListPage() {
  const businessId = useActiveBusinessId();
  return <CustomerList key={businessId} />;
}

function CustomerList() {
  const { t } = useI18n();
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState<PartyStatus | undefined>();
  const search = useDebouncedValue(searchInput.trim()) || undefined;
  const customers = useCustomers({ search, status });

  return (
    <>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{t('customers.title')}</h1>
          <DemoBadge service="party" />
        </div>
        <Link
          to="/customers/new"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 font-semibold text-on-accent hover:brightness-110"
        >
          {t('customers.add')}
        </Link>
      </div>
      <p className="text-muted">{t('customers.subtitle')}</p>

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <input
          type="search"
          aria-label={t('customers.search')}
          placeholder={t('customers.searchPlaceholder')}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="min-h-11 w-full rounded-md border border-card-border bg-chip px-4 text-text placeholder:text-muted md:max-w-sm"
        />
        <div
          role="group"
          aria-label={t('customers.filter.status')}
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
        <CustomerListBody customers={customers} search={search} status={status} />
      </Card>
    </>
  );
}

function CustomerListBody({
  customers,
  search,
  status,
}: {
  customers: ReturnType<typeof useCustomers>;
  search: string | undefined;
  status: PartyStatus | undefined;
}) {
  const { t } = useI18n();

  if (customers.isPending) {
    return (
      <p aria-busy="true" className="text-muted">
        {t('customers.loading')}
      </p>
    );
  }

  if (customers.isError && !customers.data) {
    if (customers.error instanceof ApiRequestError && customers.error.status === 403) {
      return <p className="text-muted">{t('customers.forbidden')}</p>;
    }
    return (
      <div role="alert" className="space-y-4">
        <p>{t('customers.error')}</p>
        <Button onClick={() => void customers.refetch()}>{t('customers.retry')}</Button>
      </div>
    );
  }

  const rows = customers.data.pages.flatMap((page) => page.items);
  if (rows.length === 0) {
    if (search) return <p className="text-muted">{t('customers.noMatch', { search })}</p>;
    if (status) return <p className="text-muted">{t('customers.noMatchStatus')}</p>;
    return (
      <div className="space-y-1">
        <p className="font-medium">{t('customers.empty')}</p>
        <p className="text-muted">{t('customers.emptyHint')}</p>
      </div>
    );
  }

  return (
    <>
      {/* Old rows stay on screen while a new search loads (keepPreviousData), dimmed and marked busy. */}
      <CustomerTable rows={rows} stale={customers.isPlaceholderData} />
      {customers.isFetchNextPageError && (
        <p role="alert" className="mt-4 text-muted">
          {t('customers.error')}
        </p>
      )}
      {customers.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button disabled={customers.isFetchingNextPage} onClick={() => void customers.fetchNextPage()}>
            {customers.isFetchingNextPage ? t('customers.loadingMore') : t('customers.loadMore')}
          </Button>
        </div>
      )}
    </>
  );
}

const cell = 'block md:table-cell md:py-3 md:pr-4';

/**
 * A table on desktop; on a phone each row stacks into a small card, name first. On a phone the header is only
 * visually hidden, so a screen reader still names each cell's column; the explicit roles keep the table
 * semantics that `display: block` removes in some browsers.
 */
function CustomerTable({ rows, stale }: { rows: PartyListItem[]; stale: boolean }) {
  const { t } = useI18n();
  return (
    <table
      aria-busy={stale || undefined}
      className={`w-full text-left transition-opacity ${stale ? 'opacity-60' : ''}`}
    >
      <thead className="sr-only text-[13px] text-muted md:not-sr-only md:table-header-group">
        <tr role="row" className="border-b border-row-border">
          <th role="columnheader" className="py-2 pr-4 font-medium">
            {t('customers.col.code')}
          </th>
          <th role="columnheader" className="py-2 pr-4 font-medium">
            {t('customers.col.name')}
          </th>
          <th role="columnheader" className="py-2 pr-4 font-medium">
            {t('customers.col.phone')}
          </th>
          <th role="columnheader" className="py-2 pr-4 font-medium">
            {t('customers.col.area')}
          </th>
          <th role="columnheader" className="py-2 font-medium">
            {t('customers.col.status')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            role="row"
            className="flex flex-wrap gap-x-3 border-b border-row-border py-3 md:table-row md:py-0"
          >
            <td role="cell" className={`${cell} num order-2 text-muted`}>
              {row.code}
            </td>
            <td role="cell" className={`${cell} order-1 w-full md:w-auto`}>
              <Link to={`/customers/${row.id}`} className="font-medium hover:text-accent-text">
                {row.name}
              </Link>
              {/* Outside the link, so the link is still named by the name alone. lang picks the Bangla font. */}
              {row.nameBn && (
                <span lang="bn" className="block text-[13px] text-muted">
                  {row.nameBn}
                </span>
              )}
            </td>
            <td role="cell" className={`${cell} num order-3`}>
              {row.phone}
            </td>
            <td role="cell" className={`${cell} order-4 text-text2`}>
              {row.area ?? '—'}
            </td>
            <td role="cell" className={`${cell} order-5`}>
              <StatusText status={row.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Inactive is shown by text in a muted chip, not by colour alone; active is the normal case and stays plain. */
function StatusText({ status }: { status: PartyStatus }) {
  const { t } = useI18n();
  if (status === 'active') return <span className="text-text2">{t('customers.status.active')}</span>;
  return (
    <span className="rounded-full bg-chip px-2 py-0.5 text-[13px] text-muted">
      {t('customers.status.inactive')}
    </span>
  );
}
