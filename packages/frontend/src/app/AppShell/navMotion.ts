const MARK = 'data-nav-moving';

/**
 * The design's "navmoving": while the sidebar changes width, the other glass cards stop blurring, because redrawing a
 * 30px blur on every frame stutters on slow machines (styles/index.css). Returns the function that ends the move; the
 * move also ends by itself after `fallbackMs`, for when no transition runs (reduced motion).
 */
export function startNavMove(root: HTMLElement = document.documentElement, fallbackMs = 400): () => void {
  root.setAttribute(MARK, 'true');
  const timer = setTimeout(end, fallbackMs);
  function end() {
    clearTimeout(timer);
    root.removeAttribute(MARK);
  }
  return end;
}
