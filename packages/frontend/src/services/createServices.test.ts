import { describe, expect, it } from 'vitest';
import { createServices, type IHttpClient } from './index';
import { MockPartyService } from './mock/MockPartyService';
import { PartyService } from './partyService';

const http: IHttpClient = { getJson: () => Promise.reject(new Error('no network in this test')) };

describe('createServices: the mock Party service only in development (review on #33)', () => {
  it('builds the real PartyService when mocks are off, as in a production build', () => {
    expect(createServices(http, { useMocks: false }).party).toBeInstanceOf(PartyService);
  });

  it('builds MockPartyService when mocks are on', () => {
    expect(createServices(http, { useMocks: true }).party).toBeInstanceOf(MockPartyService);
  });

  it('defaults to mocks only in a development build', () => {
    const expected = import.meta.env.DEV ? MockPartyService : PartyService;
    expect(createServices(http).party).toBeInstanceOf(expected);
  });
});
