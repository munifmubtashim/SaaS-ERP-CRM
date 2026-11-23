import { useQueryClient } from '@tanstack/react-query';
import { formatLongDateBD, formatTimeBD, hourInDhaka } from '@erp/shared';
import { useI18n } from '../../i18n';
import { useSession } from '../../store/sessionStore';
import { KpiRow } from './KpiRow';
import { useReport } from './useReport';
import { VatAlert } from './VatAlert';

const pill = 'glass inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[13px] text-text2';

/**
 * The owner dashboard (design/owner-dashboard/Main.dc.html), summary half: greeting, VAT alert and the key figures.
 * Each figure group loads, fails and is marked Demo data on its own (IReportService, VITE_DEMO_DATA).
 */
export function DashboardPage({ now = new Date().toISOString(), name }: { now?: string; name?: string }) {
  const { t, locale } = useI18n();
  const loc = locale === 'bn' ? 'bn-BD' : 'en-BD';
  const session = useSession();
  const queryClient = useQueryClient();
  const bankFeed = useReport('bankFeed');
  const hour = hourInDhaka(now);
  const greeting =
    hour < 12 ? 'dash.greeting.morning' : hour < 17 ? 'dash.greeting.afternoon' : 'dash.greeting.evening';
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="num text-[28px] font-bold">
            {t(greeting, { name: name ?? session?.user.name ?? '' })}
          </h1>
          <p className="text-[13px] text-text2">{t('dash.dateLine', { date: formatLongDateBD(now, loc) })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={pill}
            aria-label={t('dash.refresh')}
            onClick={() => void queryClient.invalidateQueries({ queryKey: ['report'] })}
          >
            {t('dash.updated', { time: formatTimeBD(now, loc) })}
            {bankFeed.data && (
              <span>· {t('dash.bankFeed', { time: formatTimeBD(bankFeed.data.lastSyncAt, loc) })}</span>
            )}
          </button>
          <button
            type="button"
            disabled
            title={t('shell.notAvailable')}
            className={`${pill} disabled:opacity-60`}
          >
            {t('dash.export')}
          </button>
        </div>
      </header>
      <VatAlert now={now} />
      <KpiRow />
    </div>
  );
}
