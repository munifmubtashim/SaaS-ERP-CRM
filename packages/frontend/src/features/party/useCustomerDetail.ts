import { useQuery } from '@tanstack/react-query';
import { useServices } from '../../app/servicesContext';
import { useActiveBusinessId } from '../../store/activeBusinessStore';

/** One customer's profile. The active business is in the key, so a switch never shows the old one (ADR 0007). */
export function useCustomerProfile(id: string | undefined) {
  const { party } = useServices();
  const businessId = useActiveBusinessId();
  return useQuery({
    queryKey: ['party', businessId, id],
    queryFn: () => party.get(id ?? ''),
    // No id (the add form): nothing to read, and GET /v1/parties/ would be the list.
    enabled: id !== undefined,
  });
}

/** What the customer owes. The page asks only once the profile has loaded, so an unknown id makes one request. */
export function useCustomerDues(id: string) {
  const { party } = useServices();
  const businessId = useActiveBusinessId();
  return useQuery({
    queryKey: ['partyDues', businessId, id],
    queryFn: () => party.dues(id),
  });
}
