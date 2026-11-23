import { formatShare, formatTaka, parseMoney, sumMoney, type BranchResults } from '@erp/shared';
import { useId, useState } from 'react';
import { useI18n } from '../../i18n';
import { barSlots, roundedBar } from './chartShapes';
import { chartFrame } from './derive';

type Branch = BranchResults['branches'][number];

// The design's bar chart: a 392 x 346 view box, bars from y 304 up to y 16, between x 40 and 360.
const BASE = 304;
const TOP = 16;
const TONES = ['var(--biz-a)', 'var(--biz-b)'];

/**
 * The design's "Revenue by branch": a gradient bar per branch that grows in, its amount on top and its name below;
 * hovering or focusing a bar shows its figures and dims the others. Each bar is named, so nothing is colour-only.
 */
export function BranchRevenueChart({
  branches,
  lakh,
  loc,
}: {
  branches: readonly Branch[];
  lakh: (amount: string) => string;
  loc: 'bn-BD' | 'en-BD';
}) {
  const { t } = useI18n();
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const businesses = [...new Set(branches.map((b) => b.businessName))];
  const tone = (b: Branch) => businesses.indexOf(b.businessName) % TONES.length;
  const frame = chartFrame(branches.map((b) => b.revenue));
  const total = sumMoney(branches.map((b) => parseMoney(b.revenue)));
  const { centres, width } = barSlots(branches.length, 40, 360);
  const top = (b: Branch) => Math.round((BASE - frame.position(b.revenue) * (BASE - TOP)) * 10) / 10;
  const shown = hover === null ? null : branches[hover];
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-4 text-[13px] text-text2">
        {businesses.map((name, i) => (
          <li key={name} className="flex items-center gap-2">
            <span className="size-2.5 rounded-[3px]" style={{ background: TONES[i % TONES.length] }} />
            {name}
          </li>
        ))}
      </ul>
      <div className="relative">
        <svg viewBox="0 0 392 346" className="block w-full">
          <defs>
            {TONES.map((color, i) => (
              <linearGradient key={color} id={`${id}${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style={{ stopColor: `color-mix(in oklab, ${color} 66%, white)` }} />
                <stop offset="0.6" style={{ stopColor: color }} />
                <stop offset="1" style={{ stopColor: `color-mix(in oklab, ${color} 88%, black)` }} />
              </linearGradient>
            ))}
          </defs>
          {frame.ticks.map((tick) => {
            const y = BASE - frame.position(tick) * (BASE - TOP);
            return <path key={tick} d={`M40 ${y} L360 ${y}`} stroke="var(--grid)" strokeWidth="1" />;
          })}
          {branches.map((b, i) => (
            <path
              key={b.branchId}
              className="bv outline-none"
              role="img"
              tabIndex={0}
              aria-label={t('dash.branch.bar', {
                branch: b.branchName,
                business: b.businessName,
                amount: lakh(b.revenue),
              })}
              d={roundedBar(centres[i] ?? 0, top(b), BASE, width)}
              fill={`url(#${id}${tone(b)})`}
              style={{ opacity: hover === null || hover === i ? 1 : 0.3, animationDelay: `${i * 0.06}s` }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            />
          ))}
        </svg>
        {/* Labels are HTML, so they stay 12px however narrow the card makes the chart; the bars carry the names. */}
        {branches.map((b, i) => {
          const [figure, unit] = lakh(b.revenue).split(' ');
          const slot = { left: `${((centres[i] ?? 0) / 392) * 100}%`, width: `${(64 / 392) * 100}%` };
          return (
            <div key={b.branchId} aria-hidden="true" className="text-[12px] font-semibold">
              <span
                className="num absolute flex -translate-x-1/2 -translate-y-full flex-col items-center pb-1 leading-tight"
                style={{ left: slot.left, top: `${(top(b) / 346) * 100}%` }}
              >
                {figure}
                {unit && <span className="font-normal text-muted">{unit}</span>}
              </span>
              <span
                className="absolute -translate-x-1/2 truncate text-center"
                style={{ ...slot, top: `${(310 / 346) * 100}%` }}
              >
                {b.branchName}
              </span>
            </div>
          );
        })}
        {shown && hover !== null && (
          <div
            role="tooltip"
            className="chart-tip flex flex-col gap-1"
            style={{
              left: `${((centres[hover] ?? 0) / 392) * 100}%`,
              top: `${(Math.max(top(shown), 30) / 346) * 100}%`,
              transform:
                hover > branches.length / 2 ? 'translate(calc(-100% - 34px), 0)' : 'translate(34px, 0)',
            }}
          >
            <span className="font-semibold">{shown.branchName}</span>
            <span className="flex items-center gap-1.5 text-text2">
              <span className="size-2 rounded-[2px]" style={{ background: TONES[tone(shown)] }} />
              {shown.businessName}
            </span>
            <span className="num text-[13px] font-semibold">৳{formatTaka(shown.revenue, loc)}</span>
            <span className="text-muted">
              {t('dash.branch.share', { share: formatShare(parseMoney(shown.revenue), total, loc) })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
