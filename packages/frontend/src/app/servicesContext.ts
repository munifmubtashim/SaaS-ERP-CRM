import { createContext, useContext } from 'react';
import type { Services } from '../services';

/** Services reach components through context, so tests can inject fakes (dependency inversion). */
export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used inside <Providers>');
  return services;
}
