import { useQuery } from '@tanstack/react-query';
import { useServices } from '../../app/servicesContext';
import type { IReportService, ReportCall } from '../../services';
import { useActiveScope } from '../../store/activeScopeStore';

/**
 * The query key of one report call for the chosen business: switching business loads its own figures, and
 * `['report']` still matches them all for the refresh button.
 */
export function reportKey(businessId: string | undefined, ...parts: readonly unknown[]) {
  return ['report', businessId ?? null, ...parts] as const;
}

/**
 * One report call as a query, keyed by the business and the call, so each card loads, fails and retries on its own.
 * Nothing is sent until a business is chosen: every report reads one business (ADR 0007).
 */
export function useReport<K extends ReportCall>(call: K) {
  const { report } = useServices();
  const scope = useActiveScope();
  return useQuery({
    queryKey: reportKey(scope?.businessId, call),
    queryFn: () => (report[call] as () => Promise<Awaited<ReturnType<IReportService[K]>>>)(),
    enabled: scope !== null,
  });
}
