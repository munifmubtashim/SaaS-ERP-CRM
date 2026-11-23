import { useEffect, type RefObject } from 'react';

/** The design's "Ctrl K" hint: Ctrl+K (Cmd+K on a Mac) puts the cursor in the search box. */
export function useSearchShortcut(target: RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        target.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target]);
}
