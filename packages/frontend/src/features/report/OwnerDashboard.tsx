import { formatDateTimeBD, formatMoneyBDT } from '@erp/shared';
import { Button, Card } from '../../components/ui';
import { useI18n } from '../../i18n';
import { ApiRequestError } from '../../services';
import { byDuesWithShare } from './duesShares';
import { useOwnerDashboard } from './useOwnerDashboard';

/**
 * Answers "how much are customers owing me, and what came in today?" across my businesses (M6).
 * One hero number (total dues), one supporting figure, then one row per business.
 */
export function OwnerDashboard() {
  const { t, locale } = useI18n();
  const dashboard = useOwnerDashboard();
  const format = locale === 'bn' ? 'bn-BD' : 'en-BD';
  const taka = (amount: string) => `৳ ${formatMoneyBDT(amount, format)}`;

  if (dashboard.isPending) {
    return (
      <Card aria-busy="true">
        <p className="text-muted">{t('dashboard.loading')}</p>
      </Card>
    );
  }

  if (dashboard.isError && !dashboard.data) {
    if (dashboard.error instanceof ApiRequestError && dashboard.error.status === 403) {
      return (
        <Card>
          <p className="text-muted">{t('dashboard.forbidden')}</p>
        </Card>
      );
    }
    return (
      <Card role="alert" className="space-y-4">
        <p>{t('dashboard.error')}</p>
        <Button onClick={() => void dashboard.refetch()}>{t('dashboard.retry')}</Button>
      </Card>
    );
  }

  const { totals, businesses, asOf } = dashboard.data;
  if (businesses.length === 0) {
    return (
      <Card>
        <p className="text-muted">{t('dashboard.empty')}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-[13px] text-muted">{t('dashboard.totalDues')}</p>
          <p className="num text-[32px] leading-tight font-semibold">{taka(totals.dues)}</p>
        </div>
        <div>
          <p className="text-[13px] text-muted">{t('dashboard.collectionsToday')}</p>
          <p className="num text-[22px] font-semibold">{taka(totals.collectionsToday)}</p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-muted">
            {t('dashboard.asOf')} <time dateTime={asOf}>{formatDateTimeBD(asOf, format)}</time>
          </p>
          <Button disabled={dashboard.isFetching} onClick={() => void dashboard.refetch()}>
            {dashboard.isFetching ? t('dashboard.refreshing') : t('dashboard.refresh')}
          </Button>
        </div>
        {dashboard.isRefetchError && (
          <p role="status" className="w-full text-[13px] text-warn-text">
            {t('dashboard.refreshFailed')}
          </p>
        )}
      </Card>
      <Card className="p-0">
        <table className="w-full text-left">
          <caption className="px-6 pt-5 pb-2 text-left font-semibold">{t('dashboard.byBusiness')}</caption>
          <thead className="hidden text-[13px] text-muted md:table-header-group">
            <tr className="border-b border-row-border">
              <th scope="col" className="px-6 py-2 font-medium">
                {t('dashboard.business')}
              </th>
              <th scope="col" className="px-6 py-2 text-right font-medium">
                {t('dashboard.dues')}
              </th>
              <th scope="col" className="px-6 py-2 text-right font-medium">
                {t('dashboard.collectedToday')}
              </th>
            </tr>
          </thead>
          <tbody>
            {byDuesWithShare(businesses).map((b) => (
              <tr
                key={b.businessId}
                className="grid grid-cols-2 gap-x-4 border-b border-row-border px-6 py-3 last:border-b-0 md:table-row md:p-0"
              >
                <th scope="row" className="col-span-2 truncate font-medium md:max-w-56 md:px-6 md:py-3">
                  {b.name}
                </th>
                <td className="num md:px-6 md:py-3 md:text-right">
                  <span className="block text-[12px] text-muted md:hidden">{t('dashboard.dues')}</span>
                  {taka(b.dues)}
                  {b.share !== null && (
                    <>
                      <span className="block text-[12px] text-muted">
                        {t('dashboard.shareOfDues').replace('{share}', formatMoneyBDT(b.share, format))}
                      </span>
                      <span aria-hidden="true" className="mt-1 block h-1 rounded-full bg-chip">
                        <span className="block h-1 rounded-full bg-accent" style={{ width: `${b.share}%` }} />
                      </span>
                    </>
                  )}
                </td>
                <td className="num text-right md:px-6 md:py-3">
                  <span className="block text-[12px] text-muted md:hidden">
                    {t('dashboard.collectedToday')}
                  </span>
                  {taka(b.collectionsToday)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
