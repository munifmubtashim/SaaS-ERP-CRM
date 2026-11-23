import { createHash } from 'node:crypto';
import { AppError } from '@erp/shared';
import type { IIdempotencyQuery } from './contracts/IIdempotencyQuery.js';

/** The request the route wrapper hands to the guard (ADR 0014 section 2). */
export interface IdempotentRequest {
  /** The raw Idempotency-Key header, if any. */
  key: string | undefined;
  route: string;
  userId: string;
  body: unknown;
}

/** A replay answers with the first request's status, body and headers, so a retry sees the same response. */
export type ClaimResult =
  | { kind: 'claimed' }
  | { kind: 'replay'; statusCode: number; body: unknown; headers: Record<string, string> };

/** 1 to 255 visible ASCII characters (ADR 0011 section 1). */
const KEY_FORMAT = /^[\x21-\x7e]{1,255}$/;
const HEADER = 'Idempotency-Key';

/** JSON with object keys sorted at every level; arrays keep their order. Money is already a string. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** SHA-256 of the canonical JSON body (ADR 0014 section 3). */
export function canonicalHash(body: unknown): Buffer {
  return createHash('sha256').update(canonicalJson(body)).digest();
}

/**
 * Idempotency-Key for money and stock routes (ADR 0011, ADR 0014). Not a Manager: it belongs to no module, and
 * every module's idempotent routes use it through the route wrapper, inside the request's one transaction.
 * Claim first; replay the stored answer for the same user, route and body; refuse anything else.
 */
export class IdempotencyGuard {
  constructor(private readonly query: IIdempotencyQuery) {}

  async claim(request: IdempotentRequest): Promise<ClaimResult> {
    const { key } = request;
    if (key === undefined || !KEY_FORMAT.test(key)) {
      throw new AppError('VALIDATION_FAILED', 'Idempotency-Key header is missing or malformed.', [
        {
          path: HEADER,
          code: 'idempotency.missing',
          message: 'Send an Idempotency-Key header of 1 to 255 visible ASCII characters.',
        },
      ]);
    }
    const requestHash = canonicalHash(request.body);
    const stored = await this.query.claim({ key, route: request.route, userId: request.userId, requestHash });
    if (stored === null) return { kind: 'claimed' };
    const same =
      stored.route === request.route &&
      stored.userId === request.userId &&
      stored.requestHash.equals(requestHash);
    if (!same) {
      throw new AppError('CONFLICT', 'This Idempotency-Key was already used for another request.', [
        {
          path: HEADER,
          code: 'idempotency.key_reused',
          message: 'This Idempotency-Key was already used for another request.',
        },
      ]);
    }
    return {
      kind: 'replay',
      statusCode: stored.statusCode,
      body: stored.responseBody,
      headers: stored.responseHeaders,
    };
  }

  /** Stores the handler's answer, headers included; called only after the handler succeeded, in the same transaction. */
  complete(
    key: string,
    result: { status: number; body: unknown; headers?: Record<string, string> },
  ): Promise<void> {
    return this.query.complete(key, result.status, result.body, result.headers ?? {});
  }
}
