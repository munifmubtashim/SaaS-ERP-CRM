import { followUpListResponseSchema } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import { CrmService } from './crmService';
import type { IHttpClient } from './HttpClient';

describe('CrmService.listFollowUps', () => {
  it('calls GET /v1/follow-ups with only the filters that are set, parsed by the shared schema', async () => {
    const calls: { path: string; schema: unknown }[] = [];
    const http: IHttpClient = {
      getJson: async (path, schema) => {
        calls.push({ path, schema });
        return schema.parse({ items: [], nextCursor: null });
      },
    };
    await new CrmService(http).listFollowUps({ promiseStatus: 'broken', cursor: undefined, limit: 25 });
    expect(calls).toEqual([
      { path: '/v1/follow-ups?promiseStatus=broken&limit=25', schema: followUpListResponseSchema },
    ]);

    await new CrmService(http).listFollowUps({});
    expect(calls[1]?.path).toBe('/v1/follow-ups');
  });
});
