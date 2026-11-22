import type { Session } from '@erp/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { sessionStore } from './sessionStore';

/** ADR 0018 section 2: the token lives only in the HttpOnly cookie; the tab keeps the session body and nothing else. */
afterEach(() => sessionStore.clear());

describe('sessionStore', () => {
  it('keeps only the session body: a token, password or email that rides along is never stored', () => {
    const extra = {
      user: { id: '0196f000-0000-7000-8000-000000000001', name: 'Demo Owner', email: 'owner@example.com' },
      expiresAt: '2099-01-01T00:00:00.000Z',
      token: 'tok_should_not_be_kept',
      password: 'never-stored',
    } as unknown as Session;
    sessionStore.set(extra);
    const stored = sessionStorage.getItem('erp.session') ?? '';
    expect(stored).not.toMatch(/tok_should_not_be_kept|never-stored|owner@example\.com/);
    expect(JSON.parse(stored)).toEqual({
      user: { id: '0196f000-0000-7000-8000-000000000001', name: 'Demo Owner' },
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
  });
});
