import { pino, type Logger } from 'pino';

/**
 * JSON logs (roadmap 4.1, 10.2). Never log passwords, tokens, cookies or full phone numbers:
 * the redact list below is the safety net, not permission to log them.
 */
export function createLogger(options: { level: string; pretty: boolean }): Logger {
  return pino({
    level: options.level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.token',
        '*.refreshToken',
        '*.phone',
        '*.nid',
      ],
      censor: '[redacted]',
    },
    ...(options.pretty ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
  });
}

export type { Logger };
