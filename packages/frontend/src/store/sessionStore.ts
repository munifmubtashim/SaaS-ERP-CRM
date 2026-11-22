import { sessionSchema, type Session } from '@erp/shared';
import { useSyncExternalStore } from 'react';

/**
 * The signed-in session, kept for this browser tab (sessionStorage), so a reload keeps you signed in and
 * closing the tab signs you out. An expired session reads as signed out.
 */
const KEY = 'erp.session';
const listeners = new Set<() => void>();

function load(): Session | null {
  try {
    const parsed = sessionSchema.safeParse(JSON.parse(sessionStorage.getItem(KEY) ?? 'null'));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

let state: Session | null = load();

function save(input: Session | null): void {
  // Only what sessionSchema allows is kept: never a token, password or email, whatever the caller passed.
  const next = input ? sessionSchema.parse(input) : null;
  state = next;
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage can be unavailable (private mode); the session then lasts until reload.
  }
  listeners.forEach((listener) => listener());
}

export const sessionStore = {
  /** The current session, or null when signed out or expired. */
  get: (): Session | null => (state && Date.parse(state.expiresAt) > Date.now() ? state : null),
  set: (session: Session): void => save(session),
  clear: (): void => save(null),
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useSession(): Session | null {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.get, sessionStore.get);
}
