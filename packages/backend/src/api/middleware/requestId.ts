import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Reuses a well-formed incoming X-Request-Id (so a proxy's id flows through) or makes a new one.
 * Anything else is replaced, so a client cannot inject arbitrary text into logs.
 */
export function requestIdFor(req: IncomingMessage): string {
  const incoming = req.headers['x-request-id'];
  if (typeof incoming === 'string' && SAFE_ID.test(incoming)) return incoming;
  return randomUUID();
}
