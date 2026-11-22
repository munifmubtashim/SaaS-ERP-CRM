/** A claim for one Idempotency-Key in the request's business (ADR 0011 section 2). */
export interface ClaimInput {
  key: string;
  /** Method and route pattern, e.g. `POST /v1/payments`. */
  route: string;
  userId: string;
  /** SHA-256 of the canonical JSON body. */
  requestHash: Buffer;
}

/** A key row that was already there when the claim ran, after its first request committed. */
export interface StoredKey {
  route: string;
  userId: string;
  requestHash: Buffer;
  statusCode: number;
  responseBody: unknown;
  /** The headers the first answer sent (a 201's Location, for example); {} when it sent none (Farhan, #96). */
  responseHeaders: Record<string, string>;
}

/**
 * What IdempotencyGuard needs from dal (ADR 0014 section 1). Owned by businessLogic; dal's IdempotencyQuery
 * will satisfy it once migration idempotency_key exists. Both run inside the request's one transaction.
 */
export interface IIdempotencyQuery {
  /**
   * INSERT ... ON CONFLICT (business_id, key) DO NOTHING. Returns null when this request claimed the key (it may
   * have waited for a concurrent request that rolled back), or the stored row when the key was already used.
   */
  claim(input: ClaimInput): Promise<StoredKey | null>;
  /** Stores the answer, headers included, once; the database refuses a second store (ADR 0011 section 5). */
  complete(key: string, statusCode: number, body: unknown, headers: Record<string, string>): Promise<void>;
}
