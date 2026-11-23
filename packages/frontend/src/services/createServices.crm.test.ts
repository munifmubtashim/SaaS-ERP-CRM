import { describe, expect, it } from 'vitest';
import { CrmService } from './crmService';
import { createServices, type IHttpClient } from './index';
import { MockCrmService } from './mock/MockCrmService';

const offline = () => Promise.reject(new Error('no network in this test'));
const http: IHttpClient = { getJson: offline, postJson: offline, post: offline };

describe('createServices: the mock Crm service only in development (as #33 does for Party)', () => {
  it('builds the real CrmService when mocks are off, as in a production build', () => {
    expect(createServices(http, { useMocks: false }).crm).toBeInstanceOf(CrmService);
  });

  it('builds MockCrmService when mocks are on', () => {
    expect(createServices(http, { useMocks: true }).crm).toBeInstanceOf(MockCrmService);
  });

  it('defaults to mocks only in a development build', () => {
    const expected = import.meta.env.DEV ? MockCrmService : CrmService;
    expect(createServices(http).crm).toBeInstanceOf(expected);
  });
});
