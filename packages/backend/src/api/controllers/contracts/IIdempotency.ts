/** The request the tenant wrapper hands to the idempotency guard (ADR 0014 section 2). */
export interface IdempotentRouteRequest {
  /** The raw Idempotency-Key header, if any; the guard validates it. */
  key: string | undefined;
  route: string;
  userId: string;
  body: unknown;
}

/** A claim either holds the key for this request, or replays the first request's answer with its headers. */
export type IdempotentClaim =
  | { kind: 'claimed' }
  | { kind: 'replay'; statusCode: number; body: unknown; headers: Record<string, string> };

/**
 * What the tenant route wrapper needs to make a money or stock route idempotent (ADR 0011, ADR 0014). businessLogic's
 * IdempotencyGuard satisfies it. Both calls run inside the request's one tenant transaction.
 */
export interface IIdempotency {
  claim(request: IdempotentRouteRequest): Promise<IdempotentClaim>;
  complete(
    key: string,
    result: { status: number; body: unknown; headers?: Record<string, string> },
  ): Promise<void>;
}
