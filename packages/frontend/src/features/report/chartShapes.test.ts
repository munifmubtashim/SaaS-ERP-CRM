import { describe, expect, it } from 'vitest';
import { barSlots, ringSlice, roundedBar, sliceAngles, slicePop } from './chartShapes';

/** The design's bar and ring geometry (Main.dc.html: bp0..bp4, ring(), poff()). */
describe('roundedBar', () => {
  it('rises from the base with a fully rounded top, as the design draws its 52px bars', () => {
    expect(roundedBar(72, 52, 304, 52)).toBe('M46 304 L46 78 Q46 52 72 52 L72 52 Q98 52 98 78 L98 304 Z');
  });

  it('a bar shorter than its rounding rounds only as far as its height, so it keeps its height', () => {
    expect(roundedBar(72, 294, 304, 52)).toBe(
      'M46 304 L46 304 Q46 294 56 294 L88 294 Q98 294 98 304 L98 304 Z',
    );
  });
});

describe('barSlots', () => {
  it('spreads five bars like the design: centres 64px apart, 52px wide', () => {
    expect(barSlots(5, 40, 360)).toEqual({ centres: [72, 136, 200, 264, 328], width: 52 });
  });

  it('keeps bars at most 52px wide when there are few', () => {
    expect(barSlots(2, 40, 360)).toEqual({ centres: [120, 280], width: 52 });
  });
});

describe('sliceAngles', () => {
  it('turns money shares into angles, clockwise from the top, through the shared ratio helper', () => {
    const [a, b] = sliceAngles(['10200000.00', '3810000.00']);
    expect(a?.start).toBe(0);
    expect(a?.end).toBeCloseTo(0.728 * 2 * Math.PI, 2);
    expect(b?.end).toBeCloseTo(2 * Math.PI, 5);
  });

  it('gives nothing when there is no revenue to split', () => {
    expect(sliceAngles(['0.00', '0.00'])).toEqual([]);
  });
});

describe('ringSlice and slicePop', () => {
  it('draws the slice between the design radii 61.6 and 30.8 around 70,70', () => {
    expect(ringSlice(0, Math.PI / 2)).toBe(
      'M70.00 8.40 A61.6 61.6 0 0 1 131.60 70.00 L100.80 70.00 A30.8 30.8 0 0 0 70.00 39.20 Z',
    );
  });

  it('a hovered slice moves 8.4 units out along its middle', () => {
    expect(slicePop(Math.PI / 2)).toBe('translate(8.40px, 0.00px)');
  });
});
