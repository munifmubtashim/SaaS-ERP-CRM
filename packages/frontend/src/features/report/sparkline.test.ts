import { describe, expect, it } from 'vitest';
import { smoothPath, sparkline } from './sparkline';

/** The design's spark(), curve() and area() (Main.dc.html), with money kept as strings until the display ratio. */
describe('smoothPath', () => {
  it('draws a curve through every point, starting at the first', () => {
    expect(
      smoothPath([
        [0, 10],
        [10, 0],
        [20, 10],
      ]),
    ).toBe('M0 10 C1.7 8.3 6.7 0 10 0 C13.3 0 18.3 8.3 20 10');
  });

  it('is a single move for a single point', () => {
    expect(smoothPath([[5, 5]])).toBe('M5 5');
  });
});

describe('sparkline', () => {
  it('spreads the points across the width, lowest 4px above the bottom and highest 4px below the top', () => {
    const { points } = sparkline(['100.00', '300.00', '200.00'], 160, 40);
    expect(points).toEqual([
      [0, 36],
      [80, 4],
      [160, 20],
    ]);
  });

  it('closes the fill down to the bottom edge', () => {
    const { line, fill } = sparkline(['100.00', '300.00'], 160, 40);
    expect(fill).toBe(`${line} L160 40 L0 40 Z`);
  });

  it('draws a flat line along the bottom of the band (as the design does) when every value is the same', () => {
    const { points } = sparkline(['5.00', '5.00', '5.00'], 160, 40);
    expect(points.map(([, y]) => y)).toEqual([36, 36, 36]);
  });

  it('handles losses (negative amounts) the same way', () => {
    const { points } = sparkline(['-50.00', '50.00'], 100, 40);
    expect(points).toEqual([
      [0, 36],
      [100, 4],
    ]);
  });

  it('draws nothing for fewer than two values', () => {
    expect(sparkline(['1.00'], 160, 40)).toEqual({ points: [], line: '', fill: '' });
  });
});
