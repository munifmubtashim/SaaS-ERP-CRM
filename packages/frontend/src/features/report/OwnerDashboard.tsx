import { formatDateTimeBD, formatMoneyBDT } from '@erp/shared';
import { Button, Card } from '../../components/ui';
import { useI18n } from '../../i18n';
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

  if (dashboard.isError) {
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
        <p className="w-full text-[12px] text-muted">
          {t('dashboard.asOf')} <time dateTime={asOf}>{formatDateTimeBD(asOf, format)}</time>
        </p>
      </Card>
      <Card className="p-0">
        <table className="w-full text-left">
          <caption className="px-6 pt-5 pb-2 text-left font-semibold">{t('dashboard.byBusiness')}</caption>
          <thead className="text-[13px] text-muted">
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
            {businesses.map((b) => (
              <tr key={b.businessId} className="border-b border-row-border last:border-b-0">
                <th scope="row" className="max-w-56 truncate px-6 py-3 font-medium">
                  {b.name}
                </th>
                <td className="num px-6 py-3 text-right">{taka(b.dues)}</td>
                <td className="num px-6 py-3 text-right">{taka(b.collectionsToday)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
