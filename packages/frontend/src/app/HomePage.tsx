import { Link } from 'react-router';
import { OwnerDashboard } from '../features/report';
import { useI18n } from '../i18n';

/** Home: the owner dashboard first; the technical status check is one link away. */
export function HomePage() {
  const { t } = useI18n();
  return (
    <>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t('dashboard.title')}</h1>
        <Link to="/status" className="text-[13px] font-semibold text-accent-text underline">
          {t('home.title')}
        </Link>
      </div>
      <OwnerDashboard />
    </>
  );
}
