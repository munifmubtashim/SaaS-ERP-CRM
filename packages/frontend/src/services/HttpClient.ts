import { apiErrorSchema, type ApiError, type ActiveScope } from '@erp/shared';
import type { z } from 'zod';

/** Thrown for any non-2xx response. Carries the API's {code, message, fields[], requestId} when present. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | null,
  ) {
    super(body?.message ?? `Request failed with status ${status}`);
    this.name = 'ApiRequestError';
  }
}

/** What every <Module>Service needs to reach the API. */
export interface IHttpClient {
  /** GET and validate with a shared Zod schema. Statuses in allowStatuses return the body instead of throwing. */
  getJson<T extends z.ZodType>(
    path: string,
    schema: T,
    options?: { allowStatuses?: number[] },
  ): Promise<z.infer<T>>;
  /** POST a JSON body and validate the answer with a shared Zod schema. Throws ApiRequestError on a non-2xx. */
  postJson<T extends z.ZodType>(
    path: string,
    body: unknown,
    schema: T,
    options?: { idempotencyKey?: string },
  ): Promise<z.infer<T>>;
  /** POST with no answer expected (for example logout's 204). Throws ApiRequestError on a non-2xx. */
  post(path: string, body?: unknown): Promise<void>;
}

/**
 * fetch-based client. In development, Vite proxies /api to the API server, so every call is same-origin: the
 * browser sends the HttpOnly session cookie and the app's Origin itself (ADR 0018 section 2). No token is ever read,
 * stored or sent by this code; there is no Authorization header.
 */
/** PATCH, for the few routes that edit in place (PATCH /v1/parties/:id). Its own interface, so only they depend on it. */
export interface IHttpPatch {
  patchJson<T extends z.ZodType>(path: string, body: unknown, schema: T): Promise<z.infer<T>>;
}

export class HttpClient implements IHttpClient, IHttpPatch {
  /**
   * `scope` is the tab's active business and branch (activeScopeStore, ADR 0007): tenantMiddleware reads them from
   * X-Business-Id and X-Branch-Id. Null before one is chosen (the login and the business switcher), and then neither
   * header is sent.
   */
  constructor(
    private readonly baseUrl = '/api',
    private readonly scope: () => ActiveScope | null = () => null,
  ) {}

  private scopeHeaders(): Record<string, string> {
    const active = this.scope();
    return active ? { 'X-Business-Id': active.businessId, 'X-Branch-Id': active.branchId } : {};
  }

  async getJson<T extends z.ZodType>(
    path: string,
    schema: T,
    options?: { allowStatuses?: number[] },
  ): Promise<z.infer<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...this.scopeHeaders() },
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok && !options?.allowStatuses?.includes(res.status)) throw toError(res.status, json);
    // Contract drift between backend and frontend fails loudly here instead of rendering wrong numbers.
    return schema.parse(json);
  }

  /** A money or stock POST passes its Idempotency-Key (ADR 0011): a retry with the same key answers the first result. */
  async postJson<T extends z.ZodType>(
    path: string,
    body: unknown,
    schema: T,
    options?: { idempotencyKey?: string },
  ): Promise<z.infer<T>> {
    const res = await this.send(path, body, options?.idempotencyKey);
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) throw toError(res.status, json);
    return schema.parse(json);
  }

  async patchJson<T extends z.ZodType>(path: string, body: unknown, schema: T): Promise<z.infer<T>> {
    const res = await this.send(path, body, undefined, 'PATCH');
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) throw toError(res.status, json);
    return schema.parse(json);
  }

  async post(path: string, body?: unknown): Promise<void> {
    const res = await this.send(path, body);
    if (!res.ok) throw toError(res.status, await res.json().catch(() => null));
  }

  private send(
    path: string,
    body: unknown,
    idempotencyKey?: string,
    method: 'POST' | 'PATCH' = 'POST',
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...this.scopeHeaders(),
    };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    return fetch(`${this.baseUrl}${path}`, {
      method,
      credentials: 'same-origin',
      headers,
      body: JSON.stringify(body ?? {}),
    });
  }
}

function toError(status: number, json: unknown): ApiRequestError {
  const parsed = apiErrorSchema.safeParse(json);
  return new ApiRequestError(status, parsed.success ? parsed.data : null);
}
