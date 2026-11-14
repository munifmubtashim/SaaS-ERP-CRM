import { useQuery } from '@tanstack/react-query';
import { Button, Card, StatusPill } from '../../components/ui';
import { useI18n } from '../../i18n';
import { healthService } from '../../services/healthService';

/** Proves the full path: browser -> Vite proxy -> api -> businessLogic -> dal -> PostgreSQL. */
export function HealthPanel() {
  const { t } = useI18n();
  const health = useQuery({ queryKey: ['health'], queryFn: healthService.get, retry: false });

  if (health.isPending) {
    return (
      <Card aria-busy="true" className="mt-6">
        <p className="text-muted">{t('health.loading')}</p>
      </Card>
    );
  }

  if (health.isError) {
    return (
      <Card role="alert" className="mt-6 space-y-4">
        <p>{t('health.error')}</p>
        <Button onClick={() => void health.refetch()}>{t('health.retry')}</Button>
      </Card>
    );
  }

  const { checks, version, time } = health.data;
  const dbOk = checks.database === 'ok';
  return (
    <Card className="mt-6 space-y-4">
      <dl>
        <div className="flex items-center justify-between border-b border-row-border py-3">
          <dt className="font-medium">{t('health.api')}</dt>
          <dd>
            <StatusPill ok>{t('health.ok')}</StatusPill>
          </dd>
        </div>
        <div className="flex items-center justify-between border-b border-row-border py-3">
          <dt className="font-medium">{t('health.database')}</dt>
          <dd>
            <StatusPill ok={dbOk}>{dbOk ? t('health.ok') : t('health.down')}</StatusPill>
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted">
        {t('health.version')} <span className="num">{version}</span> · {t('health.checkedAt')}{' '}
        <time dateTime={time}>{new Date(time).toLocaleTimeString()}</time>
      </p>
      <Button onClick={() => void health.refetch()}>{t('health.retry')}</Button>
    </Card>
  );
}
