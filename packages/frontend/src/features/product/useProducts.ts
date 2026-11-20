import type { ProductStatus } from '@erp/shared';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useServices } from '../../app/servicesContext';

export interface ProductFilters {
  search?: string;
  status?: ProductStatus;
}

/**
 * The product list, one cursor page at a time ("Load more").
 * TODO(Munif): add the active business to the query key once the scope store (#12) is on main (ADR 0007).
 */
export function useProducts({ search, status }: ProductFilters) {
  const { product } = useServices();
  return useInfiniteQuery({
    queryKey: ['products', { search, status }],
    queryFn: ({ pageParam }) => product.list({ search, status, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // While a new search loads, keep the old rows on screen instead of flashing the loading state.
    placeholderData: keepPreviousData,
  });
}
