import { useServices } from '../../app/servicesContext';

/**
 * Whether the Vehicle pack is on. Munif's choice for the demo: on while the vehicle sample is on. TODO(Munif): read
 * the business's pack setting once it exists; until then a production build hides units.
 */
export function useVehiclePack(): boolean {
  return useServices().demo.has('vehicle');
}
