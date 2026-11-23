import { useRef, useState } from 'react';
import { Outlet } from 'react-router';
import { useLogout } from '../../features/auth';
import { ScopeSwitcher } from '../../features/organization';
import { useI18n } from '../../i18n';
import { preferencesStore, usePreferences } from '../../store/preferencesStore';
import { Icon } from './icons';
import { LanguageSwitch } from './LanguageSwitch';
import { PhoneTabs } from './PhoneTabs';
import { Sidebar } from './Sidebar';
import { useSearchShortcut } from './useSearchShortcut';

const iconButton =
  'glass inline-flex size-11 items-center justify-center rounded-full text-text2 hover:text-text disabled:cursor-not-allowed disabled:opacity-60';

/**
 * App shell from the approved design: glass sidebar on desktop, tab bar on phones, and a header with the business and
 * branch switcher, search (Ctrl K), theme, notifications, language and sign out. Shared: both developers review.
 */
export function AppShell() {
  const { t } = useI18n();
  const { theme } = usePreferences();
  const logout = useLogout();
  const search = useRef<HTMLInputElement>(null);
  const [searching, setSearching] = useState(false);
  useSearchShortcut(search);
  // Language and sign out: in the sidebar on desktop and in the More sheet on phones (the design's header has neither).
  const account = (
    <>
      <LanguageSwitch />
      <button
        type="button"
        className="min-h-11 rounded-full border border-row-border px-4 text-text2 hover:border-accent"
        onClick={() => logout.mutate()}
      >
        {t('shell.signOut')}
      </button>
    </>
  );
  return (
    <div className="flex min-h-screen">
      <Sidebar footer={account} />
      <div className="flex min-w-0 flex-1 flex-col pb-24 md:pb-0">
        <header className="flex flex-wrap items-center gap-2 px-4 py-3 md:px-6">
          <div className="mr-auto">
            <ScopeSwitcher />
          </div>
          <label className="glass hidden min-h-11 items-center gap-2 rounded-full px-4 text-text2 lg:flex">
            <Icon name="search" size={18} />
            <input
              ref={search}
              readOnly
              aria-label={t('shell.search')}
              aria-describedby="search-later"
              placeholder={t('shell.search')}
              className="w-48 bg-transparent outline-none placeholder:text-muted"
              onFocus={() => setSearching(true)}
              onBlur={() => setSearching(false)}
            />
            <kbd className="rounded-md border border-row-border px-1.5 text-xs text-muted">Ctrl K</kbd>
          </label>
          <span id="search-later" role="status" className={searching ? 'text-[13px] text-muted' : 'sr-only'}>
            {searching ? t('shell.search.later') : ''}
          </span>
          <button
            type="button"
            className={iconButton}
            aria-label={theme === 'light' ? t('shell.theme.toDark') : t('shell.theme.toLight')}
            onClick={() => preferencesStore.set({ theme: theme === 'light' ? 'dark' : 'light' })}
          >
            <Icon name={theme === 'light' ? 'moon' : 'sun'} />
          </button>
          <button
            type="button"
            disabled
            className={iconButton}
            aria-label={t('shell.notifications')}
            title={t('shell.notAvailable')}
          >
            <Icon name="bell" />
          </button>
        </header>
        <main className="w-full max-w-6xl p-4 md:p-6">
          <Outlet />
        </main>
      </div>
      <PhoneTabs menuFooter={account} />
    </div>
  );
}
