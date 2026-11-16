import { NavLink, Outlet } from 'react-router';
import { useLogout } from '../../features/auth';
import { useI18n } from '../../i18n';
import { useSession } from '../../store/sessionStore';
import { preferencesStore, usePreferences } from '../../store/preferencesStore';
import { LanguageSwitch, segment } from './LanguageSwitch';
import { NAV } from './nav';

/** App shell: collapsible sidebar, header with language and theme. Shared: both developers review. */
export function AppShell() {
  const { t } = useI18n();
  const { theme, sidebarCollapsed } = usePreferences();
  const session = useSession();
  const logout = useLogout();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside
        aria-label="Main"
        className={`border-b border-row-border p-3 md:border-r md:border-b-0 md:transition-[width] ${sidebarCollapsed ? 'md:w-18' : 'md:w-58'}`}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          {!sidebarCollapsed && <span className="num text-lg font-bold">{t('app.name')}</span>}
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-md border border-card-border bg-chip hover:border-accent"
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? t('shell.sidebar.expand') : t('shell.sidebar.collapse')}
            onClick={() => preferencesStore.set({ sidebarCollapsed: !sidebarCollapsed })}
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className="flex min-h-11 items-center rounded-md px-3 whitespace-nowrap text-text2 hover:bg-nav-hover aria-[current=page]:bg-nav-active aria-[current=page]:font-semibold aria-[current=page]:text-text"
            >
              {sidebarCollapsed ? t(item.key).slice(0, 1) : t(item.key)}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-end gap-2 border-b border-row-border px-4 py-3 md:px-6">
          <LanguageSwitch />
          <div
            role="group"
            aria-label="Theme"
            className="inline-flex rounded-full border border-row-border p-0.5"
          >
            {(['light', 'dark'] as const).map((th) => (
              <button
                key={th}
                type="button"
                className={segment}
                aria-pressed={theme === th}
                onClick={() => preferencesStore.set({ theme: th })}
              >
                {t(th === 'light' ? 'shell.theme.light' : 'shell.theme.dark')}
              </button>
            ))}
          </div>
          {session && (
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-muted">
                {t('shell.signedInAs')} <span className="font-semibold text-text">{session.user.name}</span>
              </span>
              <button
                type="button"
                className="min-h-10 rounded-full border border-row-border px-4 text-text2 hover:border-accent"
                onClick={() => logout.mutate()}
              >
                {t('shell.signOut')}
              </button>
            </div>
          )}
        </header>
        <main className="w-full max-w-5xl p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
