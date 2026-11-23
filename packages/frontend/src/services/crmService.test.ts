import { collectorListResponseSchema, followUpListResponseSchema, followUpSchema } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import { CrmService } from './crmService';
import type { IHttpClient } from './HttpClient';

/** Records every call; answers GETs with an empty list and POSTs with nothing a test reads. */
function recordingHttp() {
  const calls: { method: string; path: string; body?: unknown; schema: unknown }[] = [];
  const http: IHttpClient = {
    getJson: async (path, schema) => {
      calls.push({ method: 'GET', path, schema });
      return schema.parse({ items: [], nextCursor: null });
    },
    postJson: async (path, body, schema) => {
      calls.push({ method: 'POST', path, body, schema });
      return undefined as never;
    },
    post: async () => undefined,
  };
  return { http, calls };
}

describe('CrmService', () => {
  it('lists with GET /v1/follow-ups and only the filters that are set, parsed by the shared schema', async () => {
    const { http, calls } = recordingHttp();
    await new CrmService(http).listFollowUps({ promiseStatus: 'broken', cursor: undefined, limit: 25 });
    expect(calls).toEqual([
      {
        method: 'GET',
        path: '/v1/follow-ups?promiseStatus=broken&limit=25',
        schema: followUpListResponseSchema,
      },
    ]);

    await new CrmService(http).listFollowUps({});
    expect(calls[1]?.path).toBe('/v1/follow-ups');
  });

  it('records with POST /v1/follow-ups, the answer parsed by followUpSchema', async () => {
    const { http, calls } = recordingHttp();
    const input = {
      partyId: '0196f000-0000-7000-8000-000000c00001',
      collectorId: '0196f000-0000-7000-8000-000000d00001',
      channel: 'call' as const,
      outcome: 'no_answer' as const,
      promise: null,
      note: null,
    };
    await new CrmService(http).recordFollowUp(input);
    expect(calls).toEqual([{ method: 'POST', path: '/v1/follow-ups', body: input, schema: followUpSchema }]);
  });

  it('reads the stand-in collector list from GET /v1/follow-ups/collectors (temporary, until A4)', async () => {
    const { http, calls } = recordingHttp();
    // The recording client answers with a list shape this schema refuses; only the call matters here.
    await new CrmService(http).listCollectors().catch(() => undefined);
    expect(calls[0]).toEqual({
      method: 'GET',
      path: '/v1/follow-ups/collectors',
      schema: collectorListResponseSchema,
    });
  });
});
