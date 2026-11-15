import { useI18n } from '../i18n';

/** Placeholder for modules whose feature folder is still a stub. Replaced module by module. */
export function NotBuiltPage() {
  const { t } = useI18n();
  return <p className="text-muted">{t('page.notBuilt')}</p>;
}
