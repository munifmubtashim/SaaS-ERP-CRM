import { describe, expect, it } from 'vitest';
import { loginIdSchema, loginRequestSchema, sessionSchema } from './auth.schema.js';

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

describe('loginRequestSchema boundaries', () => {
  const login = 'demo@example.com';

  it('accepts a password of exactly 8 and exactly 128 characters, and refuses 7', () => {
    expect(loginRequestSchema.safeParse({ login, password: 'x'.repeat(8) }).success).toBe(true);
    expect(loginRequestSchema.safeParse({ login, password: 'x'.repeat(128) }).success).toBe(true);
    expect(loginRequestSchema.safeParse({ login, password: 'x'.repeat(7) }).success).toBe(false);
  });

  it('never trims the password: spaces are part of it', () => {
    expect(loginRequestSchema.parse({ login, password: '  secret pass  ' }).password).toBe('  secret pass  ');
  });

  it('refuses an empty or blank login', () => {
    for (const value of ['', '   ']) {
      expect(
        loginRequestSchema.safeParse({ login: value, password: 'x'.repeat(8) }).success,
        `"${value}"`,
      ).toBe(false);
    }
  });

  it('refuses a phone with spaces or without the plus: the form normalises it first', () => {
    for (const value of ['+880 1700 000000', '8800000000000']) {
      expect(loginRequestSchema.safeParse({ login: value, password: 'x'.repeat(8) }).success, value).toBe(
        false,
      );
    }
  });

  it('gives one plain message for a login that is neither a phone nor an email', () => {
    const result = loginIdSchema.safeParse('demo');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Enter a phone number in +880 form or an email address.');
  });
});

describe('sessionSchema boundaries', () => {
  const session = { user: { id: USER, name: 'Demo Owner' }, expiresAt: '2026-11-17T04:00:00.000Z' };

  it('drops unknown top-level keys, so a token never rides along in the body', () => {
    expect(sessionSchema.parse({ ...session, token: 'secret', refreshToken: 'secret' })).toEqual(session);
  });

  it('takes expiresAt in UTC only', () => {
    expect(sessionSchema.safeParse({ ...session, expiresAt: '2026-11-17T10:00:00+06:00' }).success).toBe(
      false,
    );
  });

  it('requires a user with a UUID id and a non-empty name', () => {
    expect(sessionSchema.safeParse({ expiresAt: session.expiresAt }).success).toBe(false);
    expect(sessionSchema.safeParse({ ...session, user: { id: 'u1', name: 'Demo' } }).success).toBe(false);
    expect(sessionSchema.safeParse({ ...session, user: { id: USER, name: '' } }).success).toBe(false);
  });
});
