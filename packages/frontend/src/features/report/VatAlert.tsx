import { daysUntilBD, formatLongDateBD, formatTaka } from '@erp/shared';
import { DemoBadge, Icon } from '../../components/ui';
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
      className="glass vat-alert flex flex-wrap items-center gap-3.5 rounded-3xl p-4"
    >
      <span className="vat-icon">
        <Icon name="alert" size={20} stroke={2} />
      </span>
      <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5 leading-snug">
        <span className="text-[15px] font-semibold text-warn-text">{when}</span>
        <span className="text-[13px] text-text2">
          {t('dash.vat.detail', { amount: formatTaka(vat.data.estimatedPayable, loc) })}
        </span>
      </div>
      {demo.has('report.vatReturn') && <DemoBadge service="report.vatReturn" />}
      <button
        type="button"
        disabled
        title={t('shell.notAvailable')}
        className="min-h-11 rounded-lg bg-accent px-4.5 text-[13px] font-semibold text-on-accent disabled:opacity-60"
      >
        {t('dash.vat.prepare')}
      </button>
    </section>
  );
}
