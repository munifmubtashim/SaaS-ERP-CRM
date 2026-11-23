import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { DemoBadge } from '../../components/ui';
import { useServices } from '../../app/servicesContext';
import { useI18n } from '../../i18n';
import type { ReportCall } from '../../services';

/**
 * A dashboard card: its title, the Demo data badge when any of its figures is sample, and the design's loading and
 * error states. `children` renders only once every query it needs has answered.
 */
export function ReportCard({
  title,
  calls,
  queries,
  children,
}: {
  title: string;
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
    <article className="glass flex min-w-0 flex-col gap-2 rounded-3xl p-4" aria-busy={loading}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-muted">{title}</span>
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
        <div
          className="h-8 w-32 animate-pulse rounded-lg bg-track"
          aria-label={t('dash.card.loading', { title })}
        />
      ) : (
        children()
      )}
    </article>
  );
}
