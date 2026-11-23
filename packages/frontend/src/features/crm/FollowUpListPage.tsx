import {
  formatDateBD,
  formatDateTimeBD,
  formatMoneyBDT,
  type FollowUpListItem,
  type PromiseStatus,
} from '@erp/shared';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button, Card } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { ApiRequestError } from '../../services';
import { useFollowUps } from './useFollowUps';

const STATUSES: readonly PromiseStatus[] = ['open', 'kept', 'broken'];

/** The navigation state the follow-up form leaves after a save; anything else is ignored. */
function readArrival(state: unknown): { saved: boolean; promiseStatus?: PromiseStatus } {
  if (typeof state !== 'object' || state === null) return { saved: false };
  const { saved, promiseStatus } = state as { saved?: unknown; promiseStatus?: unknown };
  const status = STATUSES.find((s) => s === promiseStatus);
  return status ? { saved: saved === true, promiseStatus: status } : { saved: saved === true };
}

/** Broken first: the screen is exception-first (erp-ui-design), so it opens on what needs action. */
const FILTERS: { value: PromiseStatus | undefined; key: MessageKey; empty: MessageKey }[] = [
  { value: 'broken', key: 'followUps.status.broken', empty: 'followUps.empty.broken' },
  { value: 'open', key: 'followUps.status.open', empty: 'followUps.empty.open' },
  { value: 'kept', key: 'followUps.status.kept', empty: 'followUps.empty.kept' },
  { value: undefined, key: 'followUps.filter.all', empty: 'followUps.empty.all' },
];

const segment =
  'min-h-11 rounded-full px-4 text-text2 aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent-text';

/**
 * Follow-ups (CR-05): which promises to pay are broken or still open, and who is following up? Next action:
 * open the customer to follow up. Recording a follow-up comes in its own PR.
 */
export function FollowUpListPage() {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  // After a save, the form passes { saved, promiseStatus } so the list can say so and open where the row is.
  const [arrival] = useState(() => readArrival(location.state));
  const [status, setStatus] = useState<PromiseStatus | undefined>(arrival.promiseStatus ?? 'broken');
  // Clear that state, so a reload or Back doesn't say "saved" again.
  useEffect(() => {
    if (location.state) void navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);
  const followUps = useFollowUps(status);
  const empty = FILTERS.find((f) => f.value === status)?.empty ?? 'followUps.empty.all';

  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">{t('followUps.title')}</h1>
      <p className="text-muted">{t('followUps.subtitle')}</p>
      {arrival.saved && (
        <p role="status" className="mt-4 rounded-md bg-pos-bg px-4 py-2 text-pos-text">
          {t('followUps.saved')}
        </p>
      )}

      <div
        role="group"
        aria-label={t('followUps.filter.label')}
        className="mt-6 inline-flex flex-wrap rounded-full border border-row-border p-0.5"
      >
        {FILTERS.map((f) => (
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

      <Card className="mt-4">
        <FollowUpListBody followUps={followUps} empty={empty} />
      </Card>
    </>
  );
}

function FollowUpListBody({
  followUps,
  empty,
}: {
  followUps: ReturnType<typeof useFollowUps>;
  empty: MessageKey;
}) {
  const { t } = useI18n();

  if (followUps.isPending) {
    return (
      <p aria-busy="true" className="text-muted">
        {t('followUps.loading')}
      </p>
    );
  }

  if (followUps.isError && !followUps.data) {
    if (followUps.error instanceof ApiRequestError && followUps.error.status === 403) {
      return <p className="text-muted">{t('followUps.forbidden')}</p>;
    }
    return (
      <div role="alert" className="space-y-4">
        <p>{t('followUps.error')}</p>
        <Button onClick={() => void followUps.refetch()}>{t('followUps.retry')}</Button>
      </div>
    );
  }

  const rows = followUps.data.pages.flatMap((page) => page.items);
  if (rows.length === 0) {
    return (
      <div className="space-y-1">
        <p className="font-medium">{t(empty)}</p>
        <p className="text-muted">{t('followUps.emptyHint')}</p>
      </div>
    );
  }

  return (
    <>
      <FollowUpTable rows={rows} stale={followUps.isPlaceholderData} />
      {followUps.isFetchNextPageError && (
        <p role="alert" className="mt-4 text-muted">
          {t('followUps.error')}
        </p>
      )}
      {followUps.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button disabled={followUps.isFetchingNextPage} onClick={() => void followUps.fetchNextPage()}>
            {followUps.isFetchingNextPage ? t('followUps.loadingMore') : t('followUps.loadMore')}
          </Button>
        </div>
      )}
    </>
  );
}

const cell = 'block md:table-cell md:py-3 md:pr-4';

/**
 * A table on desktop; on a phone each row stacks into a small card, customer and amount first. As on the
 * customer list (#33), the header is only visually hidden on a phone and the roles are explicit.
 */
function FollowUpTable({ rows, stale }: { rows: FollowUpListItem[]; stale: boolean }) {
  const { t } = useI18n();
  const headers: MessageKey[] = [
    'followUps.col.customer',
    'followUps.col.promise',
    'followUps.col.status',
    'followUps.col.collector',
    'followUps.col.contacted',
    'followUps.col.action',
  ];
  return (
    <table
      aria-busy={stale || undefined}
      className={`w-full text-left transition-opacity ${stale ? 'opacity-60' : ''}`}
    >
      <thead className="sr-only text-[13px] text-muted md:not-sr-only md:table-header-group">
        <tr role="row" className="border-b border-row-border">
          {headers.map((key) => (
            <th
              key={key}
              role="columnheader"
              className={`py-2 pr-4 font-medium ${key === 'followUps.col.promise' ? 'md:text-right' : ''}`}
            >
              {t(key)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            role="row"
            className="flex flex-wrap gap-x-3 border-b border-row-border py-3 md:table-row md:py-0"
          >
            <td role="cell" className={`${cell} order-1 w-full md:w-auto`}>
              <Link to={`/customers/${row.partyId}`} className="font-medium hover:text-accent-text">
                {row.partyName}
              </Link>
              {row.note && <span className="block text-[13px] text-muted">{row.note}</span>}
            </td>
            <td role="cell" className={`${cell} num order-2 md:text-right`}>
              {row.promise ? (
                <>
                  <span className="font-semibold">৳{formatMoneyBDT(row.promise.amount)}</span>
                  <span className="block text-[13px] text-muted">{formatDateBD(row.promise.promisedOn)}</span>
                </>
              ) : (
                <span className="text-muted">—</span>
              )}
            </td>
            <td role="cell" className={`${cell} order-3`}>
              <PromiseText row={row} />
            </td>
            <td role="cell" className={`${cell} order-4 text-text2`}>
              {row.collectorName}
            </td>
            <td role="cell" className={`${cell} num order-5 text-[13px] text-muted`}>
              {formatDateTimeBD(row.contactedAt)}
            </td>
            <td role="cell" className={`${cell} order-6 w-full md:w-auto`}>
              {/* The form takes the customer from here: it has no customer search yet (#33). */}
              <Link
                to={`/follow-ups/new?partyId=${row.partyId}`}
                state={{ partyName: row.partyName }}
                className="inline-flex min-h-11 items-center font-medium text-accent-text"
              >
                {t('followUps.record')}
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const STATUS_LOOK: Record<PromiseStatus, string> = {
  broken: 'bg-neg-bg text-neg-text font-semibold',
  open: 'bg-chip text-text2',
  kept: 'bg-pos-bg text-pos-text',
};

/** The promise's status by text in a chip, never colour alone; without a promise, the outcome as plain text. */
function PromiseText({ row }: { row: FollowUpListItem }) {
  const { t } = useI18n();
  if (!row.promise) return <span className="text-text2">{t(`followUps.outcome.${row.outcome}`)}</span>;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[13px] ${STATUS_LOOK[row.promise.status]}`}>
      {t(`followUps.status.${row.promise.status}`)}
    </span>
  );
}
