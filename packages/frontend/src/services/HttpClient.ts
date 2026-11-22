import { apiErrorSchema, type ApiError } from '@erp/shared';
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
  /** POST a JSON body and validate the reply. A money or stock POST passes its Idempotency-Key (ADR 0011). */
  postJson<T extends z.ZodType>(
    path: string,
    body: unknown,
    schema: T,
    options?: { idempotencyKey?: string },
  ): Promise<z.infer<T>>;
}

/** fetch-based client. In development, Vite proxies /api to the API server. */
export class HttpClient implements IHttpClient {
  constructor(private readonly baseUrl = '/api') {}

  async getJson<T extends z.ZodType>(
    path: string,
    schema: T,
    options?: { allowStatuses?: number[] },
  ): Promise<z.infer<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, { headers: { Accept: 'application/json' } });
    return this.read(res, schema, options?.allowStatuses);
  }

  async postJson<T extends z.ZodType>(
    path: string,
    body: unknown,
    schema: T,
    options?: { idempotencyKey?: string },
  ): Promise<z.infer<T>> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (options?.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    return this.read(res, schema);
  }

  private async read<T extends z.ZodType>(
    res: Response,
    schema: T,
    allowStatuses: number[] = [],
  ): Promise<z.infer<T>> {
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok && !allowStatuses.includes(res.status)) {
      const parsed = apiErrorSchema.safeParse(json);
      throw new ApiRequestError(res.status, parsed.success ? parsed.data : null);
    }
    // Contract drift between backend and frontend fails loudly here instead of rendering wrong numbers.
    return schema.parse(json);
  }
}
