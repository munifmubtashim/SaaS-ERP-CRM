import { NavLink } from 'react-router';
import { useI18n } from '../../i18n';
import { Icon } from './icons';
import type { NavItem } from './nav';

const base = 'flex min-h-11 items-center gap-3 rounded-xl px-3 whitespace-nowrap';

/** A sidebar or menu entry: a link when its screen exists; otherwise shown, dimmed, as "Not available yet". */
export function NavEntry({
  item,
  compact = false,
  onNavigate,
}: {
  item: NavItem;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const label = t(item.key);
  if (item.to === null) {
    return (
      <span
        aria-disabled="true"
        title={t('shell.notAvailable')}
        className={`${base} cursor-not-allowed text-muted opacity-60`}
      >
        <Icon name={item.icon} />
        {!compact && label}
      </span>
    );
  }
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      title={compact ? label : undefined}
      aria-label={compact ? label : undefined}
      onClick={onNavigate}
      className={`${base} text-text2 hover:bg-nav-hover aria-[current=page]:bg-nav-active aria-[current=page]:font-semibold aria-[current=page]:text-text`}
    >
      <Icon name={item.icon} />
      {!compact && label}
    </NavLink>
  );
}
