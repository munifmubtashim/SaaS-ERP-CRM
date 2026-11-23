import { useServices } from '../../app/servicesContext';
import type { DemoService } from '../../services';

/** True when `service` answers with sample data (VITE_DEMO_DATA), so its figures must be marked. */
export function useDemoData(service: DemoService): boolean {
  return useServices().demo.has(service);
}
