import { describe, expect, it, vi } from 'vitest';
import type { IHttpClient } from './HttpClient';
import { ProductService } from './productService';

function fakeHttp() {
  const getJson = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
  return { http: { getJson: getJson as IHttpClient['getJson'] }, getJson };
}

describe('ProductService', () => {
  it('GETs /v1/products with only the filters that are set', async () => {
    const { http, getJson } = fakeHttp();
    await new ProductService(http).list({ search: 'brake pad', status: 'active', cursor: undefined });
    expect(getJson).toHaveBeenCalledWith('/v1/products?search=brake+pad&status=active', expect.anything());
  });

  it('GETs /v1/products with no query string when nothing is set', async () => {
    const { http, getJson } = fakeHttp();
    await new ProductService(http).list({});
    expect(getJson).toHaveBeenCalledWith('/v1/products', expect.anything());
  });
});
