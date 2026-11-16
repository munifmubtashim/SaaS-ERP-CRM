import { useQuery } from '@tanstack/react-query';
import { useServices } from '../../app/servicesContext';

/** The owner dashboard figures. The component only renders. */
export function useOwnerDashboard() {
  const { report } = useServices();
  return useQuery({ queryKey: ['report', 'owner-dashboard'], queryFn: () => report.ownerDashboard() });
}
