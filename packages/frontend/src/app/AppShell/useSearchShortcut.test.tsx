import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { useSearchShortcut } from './useSearchShortcut';

/** The design's "Ctrl K" hint: Ctrl+K (or Cmd+K on a Mac) puts the cursor in the search box. */
function Harness() {
  const ref = useRef<HTMLInputElement>(null);
  useSearchShortcut(ref);
  return (
    <>
      <button type="button">elsewhere</button>
      <input ref={ref} aria-label="Search" />
    </>
  );
}

describe('useSearchShortcut', () => {
  it('Ctrl+K and Cmd+K focus the search box', () => {
    render(<Harness />);
    for (const key of [{ ctrlKey: true }, { metaKey: true }]) {
      screen.getByRole('button').focus();
      fireEvent.keyDown(window, { key: 'k', ...key });
      expect(screen.getByLabelText('Search')).toHaveFocus();
    }
  });

  it('a plain K, or Ctrl with another key, does nothing', () => {
    render(<Harness />);
    screen.getByRole('button').focus();
    fireEvent.keyDown(window, { key: 'k' });
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    expect(screen.getByRole('button')).toHaveFocus();
  });
});
