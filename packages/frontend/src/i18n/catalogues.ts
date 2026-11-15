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
