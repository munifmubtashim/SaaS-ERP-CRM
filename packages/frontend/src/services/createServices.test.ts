import { describe, expect, it } from 'vitest';
import { createServices, type IHttpClient } from './index';
import { MockPartyService } from './mock/MockPartyService';
import { MockSalesService } from './mock/MockSalesService';
import { PartyService } from './partyService';
import { SalesService } from './salesService';

const http: IHttpClient = { getJson: () => Promise.reject(new Error('no network in this test')) };

describe('createServices: the mock Party service only in development (review on #33)', () => {
  it('builds the real PartyService when mocks are off, as in a production build', () => {
    expect(createServices(http, { useMocks: false }).party).toBeInstanceOf(PartyService);
  });

  it('builds MockPartyService when mocks are on', () => {
    expect(createServices(http, { useMocks: true }).party).toBeInstanceOf(MockPartyService);
  });

  it('treats the mock Sales service the same way', () => {
    expect(createServices(http, { useMocks: false }).sales).toBeInstanceOf(SalesService);
    expect(createServices(http, { useMocks: true }).sales).toBeInstanceOf(MockSalesService);
  });

  it('defaults to mocks only in a development build', () => {
    const expected = import.meta.env.DEV ? MockPartyService : PartyService;
    expect(createServices(http).party).toBeInstanceOf(expected);
  });
});
