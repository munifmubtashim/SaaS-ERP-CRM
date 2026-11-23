import { AppError } from '@erp/shared';
import { BaseQuery } from './BaseQuery.js';

/** A claim for one Idempotency-Key in the request's business. dal's shape; businessLogic's ClaimInput matches it. */
export interface ClaimKeyInput {
  key: string;
  route: string;
  userId: string;
  requestHash: Uint8Array;
}

/** A key row that was already there, completed by its first request. */
export interface StoredKeyRow {
  route: string;
  userId: string;
  requestHash: Buffer;
  statusCode: number;
  responseBody: unknown;
  responseHeaders: Record<string, string>;
}

/**
 * Platform: Idempotency-Key records (ADR 0011 section 2, ADR 0014 part 1). Satisfies businessLogic's
 * contracts/IIdempotencyQuery. Runs inside the request's tenant transaction (BaseQuery), for the request's one
 * business, so the claim, the handler's writes and the stored answer commit or roll back together.
 */
export class IdempotencyQuery extends BaseQuery {
  /**
   * INSERT ... ON CONFLICT (business_id, key) DO NOTHING. A concurrent claim of the same key waits on the unique
   * index until the first transaction ends: if it committed, its stored answer is returned; if it rolled back, this
   * insert succeeds. Null means this request holds the claim.
   */
  async claim(input: ClaimKeyInput): Promise<StoredKeyRow | null> {
    const inserted = await this.db.$executeRaw`
      INSERT INTO idempotency_key (business_id, key, user_id, route, request_hash)
      VALUES ((SELECT app_business_ids())[1], ${input.key}, ${input.userId}::uuid, ${input.route},
              ${Buffer.from(input.requestHash)})
      ON CONFLICT (business_id, key) DO NOTHING`;
    if (inserted === 1) return null;
    const [row] = await this.db.$queryRaw<
      (Omit<StoredKeyRow, 'statusCode'> & { statusCode: number | null })[]
    >`
      SELECT route, user_id::text AS "userId", request_hash AS "requestHash", status_code AS "statusCode",
             response_body AS "responseBody", response_headers AS "responseHeaders"
      FROM idempotency_key WHERE business_id = (SELECT app_business_ids())[1] AND key = ${input.key}`;
    if (!row || row.statusCode === null) {
      // The first request's claim committed without an answer: never happens, since both are in one transaction.
      throw new AppError('INTERNAL_ERROR', 'An Idempotency-Key record has no stored answer.');
    }
    return { ...row, statusCode: row.statusCode, requestHash: Buffer.from(row.requestHash) };
  }

  /** Stores the answer once; the trigger refuses a second store (ADR 0011 section 5). */
  async complete(
    key: string,
    statusCode: number,
    body: unknown,
    headers: Record<string, string>,
  ): Promise<void> {
    const stored = await this.db.$executeRaw`
      UPDATE idempotency_key
         SET status_code = ${statusCode}, response_body = ${JSON.stringify(body ?? null)}::jsonb,
             response_headers = ${JSON.stringify(headers)}::jsonb
       WHERE business_id = (SELECT app_business_ids())[1] AND key = ${key}`;
    if (stored !== 1) throw new AppError('INTERNAL_ERROR', 'Idempotency-Key not claimed in this business.');
  }
}
