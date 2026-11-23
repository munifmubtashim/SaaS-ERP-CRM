import { bn } from './bn';
import { en, type MessageKey } from './en';

export type { MessageKey };
export const LOCALES = ['en', 'bn'] as const;
export type Locale = (typeof LOCALES)[number];
/** A message by key; `{name}` placeholders are filled from `params` (values are inserted as given). */
export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/** Every UI string comes from these catalogues (spec C-08). bn must have the same keys as en. */
export const catalogues: Record<Locale, Record<MessageKey, string>> = { en, bn };

export function createTranslator(locale: Locale): Translate {
  const catalogue = catalogues[locale];
  // A number param is a count (days, invoices): Bangla digits in Bangla. Money and dates come formatted already.
  const show = (value: string | number) =>
    typeof value === 'number' && locale === 'bn'
      ? new Intl.NumberFormat('bn-BD').format(value)
      : String(value);
  return (key, params) =>
    params
      ? catalogue[key].replace(/\{(\w+)\}/g, (match, name: string) => {
          const value = params[name];
          return value === undefined ? match : show(value);
        })
      : catalogue[key];
}
