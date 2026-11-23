import { useI18n } from '../../i18n';
import type { DemoService } from '../../services';
import { useDemoData } from './useDemoData';

/** The design's "Demo data" badge, next to every figure that comes from a sample service. Nothing for real data. */
export function DemoBadge({ service }: { service: DemoService }) {
  const { t } = useI18n();
  if (!useDemoData(service)) return null;
  return (
    <span className="inline-flex min-h-8 items-center gap-2 rounded-full bg-warn-bg px-3 text-xs font-semibold text-warn-text">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3l10 18H2zM12 10v5M12 18h.01" />
      </svg>
      {t('demo.badge')}
    </span>
  );
}
