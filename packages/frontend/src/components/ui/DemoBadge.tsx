import { useState } from 'react';
import { useI18n } from '../../i18n';
import type { DemoService } from '../../services';
import { useDemoData } from './useDemoData';

const WARNING = 'M12 3l10 18H2zM12 10v5M12 18h.01';

/**
 * The design's "Demo data" badge, next to every figure that comes from a sample service. Nothing for real data.
 * `compact` is an icon-sized marker for dense cards: still named "Demo data" for screen readers, with the
 * explanation on hover (title) and on a tap (touch has no hover), so sample figures are always marked.
 */
export function DemoBadge({ service, compact = false }: { service: DemoService; compact?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!useDemoData(service)) return null;
  const icon = (size: number) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={WARNING} />
    </svg>
  );
  if (compact)
    return (
      <span className="relative inline-flex shrink-0">
        <button
          type="button"
          title={t('demo.explain')}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          onBlur={() => setOpen(false)}
          className="inline-flex size-7 items-center justify-center rounded-full bg-warn-bg text-warn-text"
        >
          {icon(13)}
          <span className="sr-only">{t('demo.badge')}</span>
        </button>
        {open && (
          <span
            role="tooltip"
            className="chart-tip pop top-8 right-0 w-max max-w-56 text-left font-normal text-text"
          >
            {t('demo.explain')}
          </span>
        )}
      </span>
    );
  return (
    <span className="inline-flex min-h-8 shrink-0 items-center gap-2 rounded-full whitespace-nowrap bg-warn-bg px-3 text-xs font-semibold text-warn-text">
      {icon(14)}
      {t('demo.badge')}
    </span>
  );
}
