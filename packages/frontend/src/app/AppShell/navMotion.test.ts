import { afterEach, describe, expect, it, vi } from 'vitest';
import { startNavMove } from './navMotion';

/** The design's "navmoving": other glass stops blurring while the sidebar changes width. */
describe('startNavMove', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.removeAttribute('data-nav-moving');
  });

  it('marks the page while the sidebar moves and clears the mark when the move ends', () => {
    const end = startNavMove();
    expect(document.documentElement).toHaveAttribute('data-nav-moving', 'true');
    end();
    expect(document.documentElement).not.toHaveAttribute('data-nav-moving');
  });

  it('clears the mark on its own when no transition runs (reduced motion)', () => {
    vi.useFakeTimers();
    startNavMove(document.documentElement, 400);
    vi.advanceTimersByTime(399);
    expect(document.documentElement).toHaveAttribute('data-nav-moving', 'true');
    vi.advanceTimersByTime(1);
    expect(document.documentElement).not.toHaveAttribute('data-nav-moving');
  });
});
