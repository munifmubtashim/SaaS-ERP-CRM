import { createBrowserRouter } from 'react-router';
import { HealthPanel } from '../features/health';
import { useI18n } from '../i18n';
import { AppShell, NAV } from './AppShell';
import { RouteError } from './RouteError';

function HomePage() {
  const { t } = useI18n();
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">{t('home.title')}</h1>
      <p className="text-muted">{t('home.subtitle')}</p>
      <HealthPanel />
    </>
  );
}

/** Placeholder for modules whose feature folder is still a stub. Replaced module by module. */
function NotBuiltPage() {
  const { t } = useI18n();
  return <p className="text-muted">{t('page.notBuilt')}</p>;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      // TODO(owner of each module): replace with the module's routes from features/<module>/.
      ...NAV.filter((n) => n.to !== '/').map((n) => ({ path: n.to.slice(1), element: <NotBuiltPage /> })),
    ],
  },
]);
