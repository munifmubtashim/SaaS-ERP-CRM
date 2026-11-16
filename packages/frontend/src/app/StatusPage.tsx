import { HealthPanel } from '../features/health';
import { useI18n } from '../i18n';

/** System status: the API and database check that used to be the home page. */
export function StatusPage() {
  const { t } = useI18n();
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">{t('home.title')}</h1>
      <p className="text-muted">{t('home.subtitle')}</p>
      <HealthPanel />
    </>
  );
}
