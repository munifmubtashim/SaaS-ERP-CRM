import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { I18nProvider } from '../i18n';
import { createServices, type Services } from '../services';
import { ServicesContext } from './servicesContext';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});
const defaultServices = createServices();

/** App-wide providers: API services, server state (TanStack Query) and language. */
export function Providers({
  children,
  services = defaultServices,
}: {
  children: ReactNode;
  services?: Services;
}) {
  return (
    <ServicesContext.Provider value={services}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>{children}</I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>
  );
}
