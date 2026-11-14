import { useMemo, type ReactNode } from 'react';
import { usePreferences } from '../store/preferencesStore';
import { createTranslator, type Locale } from './catalogues';
import { I18nContext } from './context';

/** Provides t() for the current language (held in the preferences store, or forced for tests). */
export function I18nProvider({ children, locale: forced }: { children: ReactNode; locale?: Locale }) {
  const { locale: preferred } = usePreferences();
  const locale = forced ?? preferred;
  const value = useMemo(() => ({ locale, t: createTranslator(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
