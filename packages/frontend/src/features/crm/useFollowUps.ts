import type { PromiseStatus } from '@erp/shared';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useServices } from '../../app/servicesContext';

/**
 * The follow-ups list, one cursor page at a time ("Load more"), filtered by promise status (undefined = all).
 * TODO(Farhan): put the active business in the query key once the switcher's store is on main (#12), as #33 does.
 */
export function useFollowUps(promiseStatus: PromiseStatus | undefined) {
  const { crm } = useServices();
  return useInfiniteQuery({
    queryKey: ['follow-ups', { promiseStatus }],
    queryFn: ({ pageParam }) => crm.listFollowUps({ promiseStatus, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // While another filter loads, keep the old rows on screen instead of flashing the loading state.
    placeholderData: keepPreviousData,
  });
}
