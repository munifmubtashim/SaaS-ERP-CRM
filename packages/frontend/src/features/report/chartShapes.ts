import { parseMoney, ratioBasisPoints, sumMoney } from '@erp/shared';

/** Chart geometry from the design (Main.dc.html: the branch bars bp0..bp4, ring() and poff() of the business pie). */

const TAU = 2 * Math.PI;
/** Two decimals, never "-0.00". */
const fixed = (n: number) => (Math.abs(n) < 0.005 ? 0 : n).toFixed(2);

/** A vertical bar centred on `cx` from `base` up to `top`, its top corners rounded by up to half its width. */
export function roundedBar(cx: number, top: number, base: number, width: number): string {
  const x = cx - width / 2;
  const right = x + width;
  const r = Math.min(width / 2, base - top);
  return (
    `M${x} ${base} L${x} ${top + r} Q${x} ${top} ${x + r} ${top} ` +
    `L${right - r} ${top} Q${right} ${top} ${right} ${top + r} L${right} ${base} Z`
  );
}

/** Where `count` bars stand between x0 and x1: equal slots, each bar at most 52px (the design's width). */
export function barSlots(count: number, x0: number, x1: number): { centres: number[]; width: number } {
  const step = (x1 - x0) / Math.max(count, 1);
  return {
    centres: Array.from({ length: count }, (_, i) => x0 + step / 2 + i * step),
    width: Math.min(52, Math.round(step * 0.8125)),
  };
}

/**
 * Each amount's slice of the ring, clockwise from the top, as angles. The share is a display ratio from the shared
 * ratio helper; the last slice always closes the ring. Empty when there is nothing to split.
 */
export function sliceAngles(amounts: readonly string[]): { start: number; end: number; mid: number }[] {
  const values = amounts.map(parseMoney);
  const total = sumMoney(values);
  if (total <= 0n) return [];
  let start = 0;
  return values.map((value, i) => {
    const end =
      i === values.length - 1 ? TAU : start + (Number(ratioBasisPoints(value, total)) / 10_000) * TAU;
    const slice = { start, end, mid: (start + end) / 2 };
    start = end;
    return slice;
  });
}

/** One slice of the design's ring: outer radius 61.6, inner 30.8, centred at 70,70 in a 140 view box. */
export function ringSlice(start: number, end: number, outer = 61.6, inner = 30.8): string {
  const stop = Math.min(end, start + TAU - 0.0005);
  const at = (radius: number, angle: number) =>
    `${fixed(70 + radius * Math.sin(angle))} ${fixed(70 - radius * Math.cos(angle))}`;
  const large = stop - start > Math.PI ? 1 : 0;
  return (
    `M${at(outer, start)} A${outer} ${outer} 0 ${large} 1 ${at(outer, stop)} ` +
    `L${at(inner, stop)} A${inner} ${inner} 0 ${large} 0 ${at(inner, start)} Z`
  );
}

/** The design's hover pop: a slice moves 8.4 units out along its middle angle. */
export function slicePop(mid: number): string {
  return `translate(${fixed(8.4 * Math.sin(mid))}px, ${fixed(-8.4 * Math.cos(mid))}px)`;
}
