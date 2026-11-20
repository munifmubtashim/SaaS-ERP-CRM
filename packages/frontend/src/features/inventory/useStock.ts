import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useServices } from '../../app/servicesContext';

export interface StockFilters {
  branchId?: string;
  search?: string;
}

/**
 * Stock on hand, one cursor page at a time ("Load more").
 * TODO(Munif): add the active business to the query key once the scope store (#12) is on main (ADR 0007).
 */
export function useStock({ branchId, search }: StockFilters) {
  const { inventory } = useServices();
  return useInfiniteQuery({
    queryKey: ['stock', { branchId, search }],
    queryFn: ({ pageParam }) => inventory.stock({ branchId, search, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}
