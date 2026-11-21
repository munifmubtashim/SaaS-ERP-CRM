import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger, REDACT_PATHS } from '../../config/logger.js';

/**
 * ADR 0018 test 10 and the CLAUDE.md logging rule: a logged login request carries no password, cookie, token or
 * phone number, wherever pino-http puts them (headers, body, response headers).
 */
function capture(): { lines: string[]; stream: Writable } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  return { lines, stream };
}

describe('logger redaction (ADR 0018 test 10)', () => {
  it('a login request and its response log no password, cookie, token or phone', () => {
    const { lines, stream } = capture();
    const logger = createLogger({ level: 'info', pretty: false }, stream);
    logger.info(
      {
        req: {
          method: 'POST',
          url: '/v1/auth/login',
          headers: { cookie: '__Host-erp_sid=secret-cookie-token', authorization: 'Bearer secret-bearer' },
          body: { login: '+8801712345678', password: 'secret-password' },
        },
        res: { statusCode: 200, headers: { 'set-cookie': '__Host-erp_sid=secret-new-token; HttpOnly' } },
        session: { token: 'secret-session-token' },
        user: { phone: '+8801712345678' },
      },
      'request completed',
    );
    const line = lines.join('');
    expect(line).toContain('request completed');
    for (const secret of [
      'secret-cookie-token',
      'secret-bearer',
      'secret-password',
      'secret-new-token',
      'secret-session-token',
      '8801712345678',
    ]) {
      expect(line, secret).not.toContain(secret);
    }
  });

  it('redacts the password_hash and two-factor secret if a user row is ever logged', () => {
    const { lines, stream } = capture();
    createLogger({ level: 'info', pretty: false }, stream).info({
      user: { passwordHash: '$argon2id$secret', mfaSecretEnc: 'secret-mfa' },
    });
    expect(lines.join('')).not.toMatch(/argon2id|secret-mfa/);
  });

  it('keeps the list of redacted paths explicit', () => {
    expect(REDACT_PATHS).toContain('req.body.password');
    expect(REDACT_PATHS).toContain('res.headers["set-cookie"]');
  });
});
