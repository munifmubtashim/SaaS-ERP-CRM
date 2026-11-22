import { partyListResponseSchema } from '@erp/shared';
import type { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { IHttpClient } from './HttpClient';
import { PartyService } from './partyService';

/** Records what the service asks the HTTP client for, and answers with an empty page. */
class RecordingHttp implements IHttpClient {
  readonly calls: { path: string; schema: z.ZodType }[] = [];
  async getJson<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
    this.calls.push({ path, schema });
    return schema.parse({ items: [], nextCursor: null });
  }
}

describe('PartyService (GET /v1/parties, used from F2)', () => {
  it('sends only the filters that are set, and checks the reply with the shared schema', async () => {
    const http = new RecordingHttp();
    await new PartyService(http).list({ role: 'customer', search: 'rahim', cursor: 'c1', limit: 25 });
    expect(http.calls).toHaveLength(1);
    expect(http.calls[0]?.path).toBe('/v1/parties?role=customer&search=rahim&cursor=c1&limit=25');
    expect(http.calls[0]?.schema).toBe(partyListResponseSchema);
  });

  it('sends no query string when nothing is set', async () => {
    const http = new RecordingHttp();
    await new PartyService(http).list({});
    expect(http.calls[0]?.path).toBe('/v1/parties');
  });
});
