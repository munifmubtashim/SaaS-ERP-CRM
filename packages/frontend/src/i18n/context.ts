import { createContext, useContext } from 'react';
import type { Locale, Translate } from './catalogues';

export const I18nContext = createContext<{ locale: Locale; t: Translate } | null>(null);

/** Current language and its translate function. Use inside <I18nProvider>. */
export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}
