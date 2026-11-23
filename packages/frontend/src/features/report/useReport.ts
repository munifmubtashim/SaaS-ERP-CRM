import { useQuery } from '@tanstack/react-query';
import { useServices } from '../../app/servicesContext';
import type { IReportService, ReportCall } from '../../services';

/** One report call as a query, keyed by the call, so each card loads, fails and retries on its own. */
export function useReport<K extends ReportCall>(call: K) {
  const { report } = useServices();
  return useQuery({
    queryKey: ['report', call],
    queryFn: () => (report[call] as () => Promise<Awaited<ReturnType<IReportService[K]>>>)(),
  });
}
