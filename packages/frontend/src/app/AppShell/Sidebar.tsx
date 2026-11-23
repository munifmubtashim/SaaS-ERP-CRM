import type { ReactNode } from 'react';
import { DemoBadge } from '../../components/ui';
import { useMyBusinesses } from '../../features/organization';
import { useI18n } from '../../i18n';
import { useSession } from '../../store/sessionStore';
import { preferencesStore, usePreferences } from '../../store/preferencesStore';
import { Icon } from './icons';
import { NavEntry } from './NavEntry';
import { SIDEBAR } from './nav';

/** The design's desktop sidebar: groups, the user's businesses (Demo data when sample), who is signed in. */
export function Sidebar({ footer }: { footer?: ReactNode }) {
  const { t } = useI18n();
  const { sidebarCollapsed: compact } = usePreferences();
  const session = useSession();
  const businesses = useMyBusinesses().query.data?.items ?? [];
  return (
    <aside
      aria-label="Main"
      className={`glass sticky top-3 m-3 hidden h-[calc(100vh-1.5rem)] flex-col gap-3 overflow-y-auto rounded-3xl p-3 md:flex ${compact ? 'w-18' : 'w-58'}`}
    >
      <div className="flex items-center justify-between gap-2">
        {!compact && <span className="num text-lg font-bold">{t('app.name')}</span>}
        <button
          type="button"
          className="inline-flex size-11 items-center justify-center rounded-xl border border-card-border bg-chip hover:border-accent"
          aria-expanded={!compact}
          aria-label={compact ? t('shell.sidebar.expand') : t('shell.sidebar.collapse')}
          onClick={() => preferencesStore.set({ sidebarCollapsed: !compact })}
        >
          <Icon name="menu" />
        </button>
      </div>
      <nav aria-label={t('shell.group.overview')} className="flex flex-col gap-0.5">
        {SIDEBAR.map((group) => (
          <div key={group.key} className="flex flex-col gap-0.5">
            {!compact && <p className="mt-2 px-3 text-xs font-semibold text-muted">{t(group.key)}</p>}
            {group.items.map((item) => (
              <NavEntry key={item.key} item={item} compact={compact} />
            ))}
          </div>
        ))}
      </nav>
      {!compact && businesses.length > 0 && (
        <div className="mt-auto rounded-2xl border border-row-border p-3 text-[13px]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-semibold text-muted">{t('shell.businesses')}</span>
            <DemoBadge service="organization" />
          </div>
          {businesses.map((business) => (
            <p key={business.id} className="truncate py-0.5 text-text2">
              {business.name}
            </p>
          ))}
        </div>
      )}
      {session && !compact && <p className="truncate px-1 text-[13px] font-semibold">{session.user.name}</p>}
      {!compact && footer && <div className="flex flex-wrap items-center gap-2">{footer}</div>}
    </aside>
  );
}
