import { daysUntilBD, formatLongDateBD, formatTaka } from '@erp/shared';
import { DemoBadge } from '../../components/ui';
import { useServices } from '../../app/servicesContext';
import { useI18n } from '../../i18n';
import { useReport } from './useReport';

/** The design's VAT alert: shown while the last return is still a draft; quiet while loading or when filed. */
export function VatAlert({ now }: { now: string }) {
  const { t, locale } = useI18n();
  const loc = locale === 'bn' ? 'bn-BD' : 'en-BD';
  const { demo } = useServices();
  const vat = useReport('vatReturn');
  if (!vat.data || vat.data.status !== 'draft') return null;
  const days = daysUntilBD(vat.data.dueOn, now);
  const date = formatLongDateBD(`${vat.data.dueOn}T06:00:00.000Z`, loc);
  const when =
    days > 0
      ? t('dash.vat.dueIn', { date, days })
      : days === 0
        ? t('dash.vat.dueToday', { date })
        : t('dash.vat.overdue', { date, days: -days });
  return (
    <section
      aria-label={t('dash.vat.aria')}
      className="glass flex flex-col items-start gap-3 rounded-3xl border-l-4 border-l-warn p-4 sm:flex-row sm:items-center"
    >
      <div className="flex w-full min-w-0 flex-1 flex-col gap-1">
        <span className="font-semibold">{when}</span>
        <span className="text-[13px] text-text2">
          {t('dash.vat.detail', { amount: formatTaka(vat.data.estimatedPayable, loc) })}
        </span>
      </div>
      {demo.has('report.vatReturn') && <DemoBadge service="report.vatReturn" />}
      <button
        type="button"
        disabled
        title={t('shell.notAvailable')}
        className="min-h-11 rounded-full bg-accent px-4 font-semibold text-on-accent disabled:opacity-60"
      >
        {t('dash.vat.prepare')}
      </button>
    </section>
  );
}
