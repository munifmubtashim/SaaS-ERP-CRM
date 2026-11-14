import { HealthPanel } from '../features/health';
import { useI18n } from '../i18n';

export function HomePage() {
  const { t } = useI18n();
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">{t('home.title')}</h1>
      <p className="text-muted">{t('home.subtitle')}</p>
      <HealthPanel />
    </>
  );
}
