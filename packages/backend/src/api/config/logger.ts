import { pino, type DestinationStream, type Logger } from 'pino';

/**
 * Never logged (CLAUDE.md, ADR 0018 section 2): passwords, tokens, cookies, full phone numbers, NIDs, and a user
 * row's password hash or two-factor secret. The login field (`req.body.login`, `*.login`) is redacted too: it is a
 * phone number or an email (Farhan, #45).
 * The list is the safety net, not permission to log them. test/unit/logger.test.ts checks it.
 */
export const REDACT_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.login',
  '*.login',
  '*.password',
  '*.token',
  '*.refreshToken',
  '*.phone',
  '*.nid',
  '*.passwordHash',
  '*.mfaSecretEnc',
];

/**
 * JSON logs (roadmap 4.1, 10.2). `destination` is for tests; with it, the pretty transport is not used.
 */
export function createLogger(
  options: { level: string; pretty: boolean },
  destination?: DestinationStream,
): Logger {
  const config = {
    level: options.level,
    redact: { paths: [...REDACT_PATHS], censor: '[redacted]' },
  };
  if (destination) return pino(config, destination);
  return pino({
    ...config,
    ...(options.pretty ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
  });
}

export type { Logger };
