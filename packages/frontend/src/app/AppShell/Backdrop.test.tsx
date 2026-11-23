import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Backdrop } from './Backdrop';

/** The design's four blurred glows behind the glass, coloured by the orb tokens; decoration only. */
describe('Backdrop', () => {
  it('draws the four orb glows for desktop and for phones, hidden from screen readers', () => {
    const { container } = render(<Backdrop />);
    const root = container.firstElementChild;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    const orbs = [...container.querySelectorAll<HTMLElement>('[data-orb]')];
    const colours = (size: string) =>
      orbs.filter((orb) => orb.dataset.size === size).map((orb) => orb.style.background);
    expect(colours('desktop')).toEqual(['var(--orb-a)', 'var(--orb-b)', 'var(--orb-c)', 'var(--orb-d)']);
    expect(colours('phone')).toEqual(['var(--orb-a)', 'var(--orb-b)', 'var(--orb-c)', 'var(--orb-d)']);
  });
});
