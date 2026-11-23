import { compareMoney, parseMoney, ratioBasisPoints, subtractMoney } from '@erp/shared';

export type Point = [x: number, y: number];

const tenth = (n: number) => Math.round(n * 10) / 10;

/** A smooth curve through the points (the design's curve(): Catmull-Rom as cubic Béziers), rounded to 0.1px. */
export function smoothPath(points: readonly Point[]): string {
  const first = points[0];
  if (!first) return '';
  let d = `M${tenth(first[0])} ${tenth(first[1])}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i] ?? first;
    const p0 = points[i - 1] ?? p1;
    const p2 = points[i + 1] ?? p1;
    const p3 = points[i + 2] ?? p2;
    d +=
      ` C${tenth(p1[0] + (p2[0] - p0[0]) / 6)} ${tenth(p1[1] + (p2[1] - p0[1]) / 6)}` +
      ` ${tenth(p2[0] - (p3[0] - p1[0]) / 6)} ${tenth(p2[1] - (p3[1] - p1[1]) / 6)}` +
      ` ${tenth(p2[0])} ${tenth(p2[1])}`;
  }
  return d;
}

/**
 * The design's spark(): amounts spread across `width`, lowest 4px above the bottom and highest 4px below the top,
 * as a line and a fill closed down to the bottom edge. Each point's height is a display ratio from the shared ratio
 * helper, so no money becomes a JavaScript number before that.
 */
export function sparkline(
  amounts: readonly string[],
  width: number,
  height: number,
): { points: Point[]; line: string; fill: string } {
  if (amounts.length < 2) return { points: [], line: '', fill: '' };
  const values = amounts.map(parseMoney);
  const [start] = values;
  if (start === undefined) return { points: [], line: '', fill: '' };
  const min = values.reduce((a, b) => (compareMoney(a, b) <= 0 ? a : b), start);
  const max = values.reduce((a, b) => (compareMoney(a, b) >= 0 ? a : b), start);
  const range = subtractMoney(max, min);
  const step = width / (values.length - 1);
  const points = values.map((value, i): Point => {
    const share = range > 0n ? Number(ratioBasisPoints(subtractMoney(value, min), range)) / 10_000 : 0;
    return [tenth(i * step), tenth(height - 4 - share * (height - 8))];
  });
  const line = smoothPath(points);
  const last = points[points.length - 1] ?? [0, 0];
  return { points, line, fill: `${line} L${last[0]} ${height} L${points[0]?.[0] ?? 0} ${height} Z` };
}
