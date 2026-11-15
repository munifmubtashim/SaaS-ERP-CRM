import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Card } from '../components/ui';
import { useI18n } from '../i18n';

/** Shown when a route throws or does not exist. Never shows a stack trace to users. */
export function RouteError() {
  const error = useRouteError();
  const { t } = useI18n();
  const detail = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : null;
  return (
    <Card role="alert" className="m-6 space-y-3">
      <h1 className="text-2xl font-semibold">{t('error.title')}</h1>
      {detail && <p className="text-muted">{detail}</p>}
      <Link to="/" className="font-semibold text-accent-text underline">
        {t('error.home')}
      </Link>
    </Card>
  );
}
