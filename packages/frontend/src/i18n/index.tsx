import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { usePreferences } from '../store/preferencesStore';
import { bn } from './bn';
import { en, type MessageKey } from './en';

export type { MessageKey };
export const LOCALES = ['en', 'bn'] as const;
export type Locale = (typeof LOCALES)[number];
export type Translate = (key: MessageKey) => string;

/** Every UI string comes from these catalogues (spec C-08). bn must have the same keys as en. */
export const catalogues: Record<Locale, Record<MessageKey, string>> = { en, bn };

export function createTranslator(locale: Locale): Translate {
  const catalogue = catalogues[locale];
  return (key) => catalogue[key];
}

const I18nContext = createContext<{ locale: Locale; t: Translate } | null>(null);

/** Provides t() for the current language (held in the preferences store). */
export function I18nProvider({ children, locale: forced }: { children: ReactNode; locale?: Locale }) {
  const { locale: preferred } = usePreferences();
  const locale = forced ?? preferred;
  const value = useMemo(() => ({ locale, t: createTranslator(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}
