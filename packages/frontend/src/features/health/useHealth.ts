import { useQuery } from '@tanstack/react-query';
import { useServices } from '../../app/servicesContext';

/** Reference hook: data logic lives in a custom hook; the component only renders. */
export function useHealth() {
  const { health } = useServices();
  return useQuery({ queryKey: ['health'], queryFn: () => health.get(), retry: false });
}
