import type { BusinessSummary } from '@erp/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useServices } from '../../app/servicesContext';
import { activeScopeStore, useActiveScope } from '../../store/activeScopeStore';

/**
 * The user's businesses, and the active business and branch kept valid against them: a remembered choice the
 * user may no longer use falls back to the first business and its first branch.
 */
export function useMyBusinesses() {
  const { organization } = useServices();
  const query = useQuery({ queryKey: ['me', 'businesses'], queryFn: () => organization.myBusinesses() });
  const scope = useActiveScope();
  const items = query.data?.items;

  const business = items?.find((b) => b.id === scope?.businessId);
  const branch = business?.branches.find((br) => br.id === scope?.branchId);

  useEffect(() => {
    if (!items) return;
    const first = items[0];
    if (!first) activeScopeStore.clear();
    else if (!business || !branch) selectBusiness(first);
  }, [items, business, branch]);

  return { query, business, branch };
}

export function selectBusiness(business: BusinessSummary): void {
  const firstBranch = business.branches[0];
  if (firstBranch) activeScopeStore.set({ businessId: business.id, branchId: firstBranch.id });
}

export function selectBranch(businessId: string, branchId: string): void {
  activeScopeStore.set({ businessId, branchId });
}
