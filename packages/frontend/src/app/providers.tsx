import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { I18nProvider } from '../i18n';
import { createServices, type Services } from '../services';
import { usePreferences } from '../store/preferencesStore';
import { ServicesContext } from './servicesContext';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});
const defaultServices = createServices();

/** Applies the chosen theme, density and language to <html> on every page, the login screen included. */
function PreferenceEffects() {
  const { theme, locale, density } = usePreferences();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.density = density;
    document.documentElement.lang = locale;
  }, [theme, locale, density]);
  return null;
}

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
        <I18nProvider>
          <PreferenceEffects />
          {children}
        </I18nProvider>
      </QueryClientProvider>
    </ServicesContext.Provider>
  );
}
