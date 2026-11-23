import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router';
import { useI18n } from '../../i18n';
import { Icon } from '../../components/ui';
import { NavEntry } from './NavEntry';
import { PHONE_TABS, SIDEBAR } from './nav';

const tab = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-xs';

/** The design's phone navigation: a glass tab bar at the bottom; More opens every design group as a sheet. */
export function PhoneTabs({ menuFooter }: { menuFooter?: ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('shell.tab.more')}
          className="fixed inset-0 z-40 flex items-end md:hidden"
        >
          <button
            type="button"
            aria-label={t('shell.menu.close')}
            className="absolute inset-0"
            onClick={() => setOpen(false)}
          />
          <nav className="glass pop relative z-10 m-3 max-h-[75vh] w-full overflow-y-auto rounded-3xl p-3">
            {SIDEBAR.map((group) => (
              <div key={group.key} className="mb-2">
                <p className="px-3 py-1 text-xs font-semibold text-muted">{t(group.key)}</p>
                {group.items.map((item) => (
                  <NavEntry key={item.key} item={item} onNavigate={() => setOpen(false)} />
                ))}
              </div>
            ))}
            {menuFooter && (
              <div className="flex flex-wrap items-center gap-2 border-t border-row-border px-1 pt-3">
                {menuFooter}
              </div>
            )}
          </nav>
        </div>
      )}
      <nav
        aria-label="Phone"
        className="glass fixed inset-x-3 bottom-3 z-30 flex gap-1 rounded-3xl p-1.5 md:hidden"
      >
        {PHONE_TABS.map((item) =>
          item.to === null ? (
            <span
              key={item.key}
              aria-disabled="true"
              title={t('shell.notAvailable')}
              className={`${tab} text-muted opacity-60`}
            >
              <Icon name={item.icon} />
              {t(item.key)}
            </span>
          ) : (
            <NavLink
              key={item.key}
              to={item.to}
              end={item.to === '/'}
              className={`${tab} text-text2 aria-[current=page]:bg-nav-active aria-[current=page]:font-semibold aria-[current=page]:text-text`}
            >
              <Icon name={item.icon} />
              {t(item.key)}
            </NavLink>
          ),
        )}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={`${tab} text-text2`}
        >
          <Icon name="more" />
          {t('shell.tab.more')}
        </button>
      </nav>
    </>
  );
}
