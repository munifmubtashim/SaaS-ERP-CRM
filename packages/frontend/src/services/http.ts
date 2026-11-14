import { apiErrorSchema, type ApiError } from '@erp/shared';
import type { z } from 'zod';

/** Base path for API calls. In development, Vite proxies /api to the API server. */
export const API_BASE = '/api';

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

/**
 * GET a JSON resource and validate it with a shared Zod schema, so a contract drift between
 * backend and frontend fails loudly here instead of rendering wrong numbers.
 */
export async function getJson<T extends z.ZodType>(
  path: string,
  schema: T,
  options?: { allowStatuses?: number[] },
): Promise<z.infer<T>> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' } });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok && !options?.allowStatuses?.includes(res.status)) {
    const parsed = apiErrorSchema.safeParse(json);
    throw new ApiRequestError(res.status, parsed.success ? parsed.data : null);
  }
  return schema.parse(json);
}
