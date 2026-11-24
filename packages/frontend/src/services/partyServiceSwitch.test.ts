import { customerDuesSchema, type CustomerDues, type PartyDetail, type PartyListResponse } from '@erp/shared';
import type { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { IHttpClient, IHttpPatch } from './HttpClient';
import { PartyService, PartyServiceSwitch, type IPartyService, type PartyCall } from './partyService';

/** Task 4 T2: the customer screens on the real party routes, dues on the sample until F5 (frontend-wiring.md). */
class RecordingHttp implements IHttpClient, IHttpPatch {
  patchJson = () => Promise.reject(new Error('unused'));
  gets: { path: string; schema: z.ZodType }[] = [];
  getJson = <T extends z.ZodType>(path: string, schema: T) => {
    this.gets.push({ path, schema });
    return Promise.reject(new Error('no API in this test'));
  };
  postJson = () => Promise.reject(new Error('unused'));
  post = () => Promise.reject(new Error('unused'));
}

describe('PartyService.dues (the API)', () => {
  it('reads GET /v1/parties/:id/dues as customerDuesSchema', async () => {
    const http = new RecordingHttp();
    await new PartyService(http).dues('a b').catch(() => undefined);
    expect(http.gets).toEqual([{ path: '/v1/parties/a%20b/dues', schema: customerDuesSchema }]);
  });
});

describe('PartyServiceSwitch', () => {
  const answer = (who: string): IPartyService => ({
    list: () => Promise.resolve({ items: [], nextCursor: who } as PartyListResponse),
    get: () => Promise.resolve({ code: who } as PartyDetail),
    dues: () => Promise.resolve({ partyId: who } as CustomerDues),
    create: () => Promise.reject(new Error('unused')),
    update: () => Promise.reject(new Error('unused')),
  });

  it('asks the real or the sample service per call', async () => {
    const sampleCalls: PartyCall[] = ['dues'];
    const party = new PartyServiceSwitch(answer('real'), answer('sample'), (call) =>
      sampleCalls.includes(call),
    );
    expect((await party.list({})).nextCursor).toBe('real');
    expect((await party.get('x')).code).toBe('real');
    expect((await party.dues('x')).partyId).toBe('sample');
  });
});
