import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { DemoBadge, Icon, type IconName } from '../../components/ui';
import { useServices } from '../../app/servicesContext';
import { useI18n } from '../../i18n';
import type { ReportCall } from '../../services';

/**
 * A dashboard card: its title, the Demo data badge when any of its figures is sample, and the design's loading and
 * error states. `children` renders only once every query it needs has answered. A key figure card (`kpi`) is tinted
 * in its tone with a glowing icon square, as the design's key figures are.
 */
export function ReportCard({
  title,
  calls,
  queries,
  children,
  kpi,
}: {
  title: string;
  kpi?: { tone: 'accent' | 'pos' | 'neg' | 'warn'; icon: IconName };
  calls: readonly ReportCall[];
  queries: readonly UseQueryResult[];
  children: () => ReactNode;
}) {
  const { t } = useI18n();
  const { demo } = useServices();
  const sample = calls.find((call) => demo.has(`report.${call}`));
  const failed = queries.filter((q) => q.isError);
  const loading = queries.some((q) => q.isPending);
  return (
    <article
      className={`glass flex min-w-0 flex-col gap-2 ${kpi ? 'kpi rounded-3xl p-4' : 'rounded-[28px] p-5'}`}
      data-tone={kpi?.tone}
      aria-busy={loading}
    >
      <div className={`flex items-center justify-between gap-2 ${kpi ? 'flex-wrap' : ''}`}>
        {kpi ? (
          <span className="flex items-center gap-2.5">
            <span className="kpi-icon">
              <Icon name={kpi.icon} size={18} stroke={1.9} />
            </span>
            <span className="text-[13px] leading-tight text-text2">{title}</span>
          </span>
        ) : (
          <span className="text-[13px] font-semibold text-muted">{title}</span>
        )}
        {sample && <DemoBadge service={`report.${sample}`} />}
      </div>
      {failed.length > 0 ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-[13px] text-neg-text">
          {t('dash.card.error', { title })}
          <button
            type="button"
            className="min-h-10 rounded-full border border-row-border px-4 font-semibold text-text hover:border-accent"
            onClick={() => failed.forEach((q) => void q.refetch())}
          >
            {t('dash.card.retry')}
          </button>
        </div>
      ) : loading ? (
        <div role="status" aria-label={t('dash.card.loading', { title })} className="flex flex-col gap-2.5">
          <span className="sk h-4.5 w-[46%]" />
          <span className="sk h-3 w-[72%]" />
          <span className="sk min-h-11 rounded-[14px]" />
          <span className="sk h-3 w-[58%]" />
        </div>
      ) : (
        children()
      )}
    </article>
  );
}
