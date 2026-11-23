import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SessionTokens } from './SessionTokens.js';

describe('SessionTokens (ADR 0018 section 2)', () => {
  const tokens = new SessionTokens();

  it('a token is 32 random bytes in base64url, and no two are equal', () => {
    const [a, b] = [tokens.generate(), tokens.generate()];
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(a).not.toBe(b);
  });

  it('the hash is the SHA-256 of the token, 32 bytes', () => {
    const token = tokens.generate();
    const hash = tokens.hash(token);
    expect(hash).toHaveLength(32);
    expect(Buffer.from(hash).toString('hex')).toBe(createHash('sha256').update(token).digest('hex'));
  });
});
