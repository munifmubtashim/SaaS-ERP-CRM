import { describe, expect, it } from 'vitest';
import { loginRequestSchema, sessionSchema } from './auth.schema.js';

// Obviously fake sample data only.
const USER = '0196f000-0000-7000-8000-000000000001';

describe('loginRequestSchema', () => {
  it('accepts an E.164 phone or an email as the login', () => {
    expect(loginRequestSchema.safeParse({ login: '+8800000000000', password: 'x'.repeat(8) }).success).toBe(
      true,
    );
    expect(loginRequestSchema.safeParse({ login: 'demo@example.com', password: 'x'.repeat(8) }).success).toBe(
      true,
    );
  });

  it('trims the login and rejects anything that is neither', () => {
    expect(loginRequestSchema.parse({ login: '  demo@example.com ', password: 'x'.repeat(8) }).login).toBe(
      'demo@example.com',
    );
    expect(loginRequestSchema.safeParse({ login: 'demo', password: 'x'.repeat(8) }).success).toBe(false);
    expect(loginRequestSchema.safeParse({ login: '0000000000', password: 'x'.repeat(8) }).success).toBe(
      false,
    );
  });

  it('requires a password of 8 to 128 characters', () => {
    expect(loginRequestSchema.safeParse({ login: 'demo@example.com', password: 'short' }).success).toBe(
      false,
    );
    expect(
      loginRequestSchema.safeParse({ login: 'demo@example.com', password: 'x'.repeat(129) }).success,
    ).toBe(false);
  });
});

describe('sessionSchema', () => {
  it('carries the user and when the session ends, never the password', () => {
    const session = sessionSchema.parse({
      user: { id: USER, name: 'Demo Owner', password: 'leak' },
      expiresAt: '2026-11-17T04:00:00.000Z',
    });
    expect(session.user).toEqual({ id: USER, name: 'Demo Owner' });
  });
});
