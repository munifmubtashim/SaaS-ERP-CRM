import type { PartyStatus } from '@erp/shared';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useServices } from '../../app/servicesContext';
import { useActiveBusinessId } from '../../store/activeBusinessStore';

export interface CustomerFilters {
  search?: string;
  status?: PartyStatus;
}

/**
 * The customer list, one cursor page at a time ("Load more"). The active business is in the query key, so a
 * tab never shows another business's customers after a switch (ADR 0007).
 */
export function useCustomers({ search, status }: CustomerFilters) {
  const { party } = useServices();
  const businessId = useActiveBusinessId();
  return useInfiniteQuery({
    queryKey: ['parties', businessId, { role: 'customer', search, status }],
    queryFn: ({ pageParam }) => party.list({ role: 'customer', search, status, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // While a new search loads, keep the old rows on screen instead of flashing the loading state.
    placeholderData: keepPreviousData,
  });
}
