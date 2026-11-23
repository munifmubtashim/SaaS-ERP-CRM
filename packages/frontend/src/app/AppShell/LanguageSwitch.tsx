import { LOCALES, useI18n } from '../../i18n';
import { preferencesStore } from '../../store/preferencesStore';

export const segment =
  'min-h-10 rounded-full px-4 text-text2 aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent-text';

/** English / Bangla toggle, used in the shell header and on the login screen. */
export function LanguageSwitch() {
  const { t, locale } = useI18n();
  return (
    <div
      role="group"
      aria-label={t('shell.language')}
      className="inline-flex rounded-full border border-row-border p-0.5"
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          className={segment}
          aria-pressed={locale === l}
          onClick={() => preferencesStore.set({ locale: l })}
        >
          {l === 'en' ? 'English' : 'বাংলা'}
        </button>
      ))}
    </div>
  );
}
