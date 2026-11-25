import {
  productDetailSchema,
  productListResponseSchema,
  type ProductCreate,
  type ProductModelSummary,
} from '@erp/shared';
import type { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { DEMO_CAPABLE, DEMO_DEFAULT } from './demoData';
import { ApiRequestError, type IHttpClient, type IHttpPatch } from './HttpClient';
import { ProductService, ProductServiceSwitch, type IProductService } from './productService';
import { SampleProductService } from './sample/SampleProductService';

/**
 * The product catalogue on the UI stack (task 5): GET /v1/products, GET /v1/products/:id, POST /v1/products and
 * PATCH /v1/products/:id (#131, ADR 0052). Archive is a PATCH with status "archived": there is no delete. Every value
 * is invented.
 */
const newProduct: ProductCreate = {
  code: 'HLM-01',
  name: 'Sample Helmet',
  nameBn: null,
  brand: 'Sample Brand',
  category: 'Accessories',
  unit: 'pcs',
  tracking: 'quantity',
  sellPrice: '1850.00',
};

class RecordingHttp implements IHttpClient, IHttpPatch {
  calls: { method: string; path: string; body?: unknown; schema: z.ZodType }[] = [];
  getJson = <T extends z.ZodType>(path: string, schema: T) => {
    this.calls.push({ method: 'GET', path, schema });
    return Promise.reject(new Error('no API in this test'));
  };
  post = () => Promise.reject(new Error('unused'));
  postJson = <T extends z.ZodType>(path: string, body: unknown, schema: T) => {
    this.calls.push({ method: 'POST', path, body, schema });
    return Promise.reject(new Error('no API in this test'));
  };
  patchJson = <T extends z.ZodType>(path: string, body: unknown, schema: T) => {
    this.calls.push({ method: 'PATCH', path, body, schema });
    return Promise.reject(new Error('no API in this test'));
  };
}

describe('ProductService catalogue calls (the API)', () => {
  it('lists, reads, creates and edits on the #131 routes, each answer parsed by the shared schema', async () => {
    const http = new RecordingHttp();
    const api = new ProductService(http);
    await api.list({ search: 'helmet', status: 'active' }).catch(() => undefined);
    await api.list({}).catch(() => undefined);
    await api.get('p 1').catch(() => undefined);
    await api.create(newProduct).catch(() => undefined);
    await api.edit('p 1', { version: 3, status: 'archived' }).catch(() => undefined);
    expect(http.calls).toEqual([
      { method: 'GET', path: '/v1/products?search=helmet&status=active', schema: productListResponseSchema },
      { method: 'GET', path: '/v1/products', schema: productListResponseSchema },
      { method: 'GET', path: '/v1/products/p%201', schema: productDetailSchema },
      { method: 'POST', path: '/v1/products', body: newProduct, schema: productDetailSchema },
      {
        method: 'PATCH',
        path: '/v1/products/p%201',
        body: { version: 3, status: 'archived' },
        schema: productDetailSchema,
      },
    ]);
  });
});

describe('ProductServiceSwitch', () => {
  it('sends models to one side and the catalogue calls to the other, per call', async () => {
    const used: string[] = [];
    const side = (name: string): IProductService => ({
      models: async () => (used.push(`${name}.models`), [] as ProductModelSummary[]),
      list: async () => (used.push(`${name}.list`), { items: [], nextCursor: null }),
      get: async () => {
        used.push(`${name}.get`);
        throw new Error('unused');
      },
      create: async () => {
        used.push(`${name}.create`);
        throw new Error('unused');
      },
      edit: async () => {
        used.push(`${name}.edit`);
        throw new Error('unused');
      },
    });
    const service = new ProductServiceSwitch(side('real'), side('sample'), (call) => call === 'models');
    await service.models();
    await service.list({});
    await service.get('x').catch(() => undefined);
    await service.create(newProduct).catch(() => undefined);
    await service.edit('x', { version: 1, name: 'n' }).catch(() => undefined);
    expect(used).toEqual(['sample.models', 'real.list', 'real.get', 'real.create', 'real.edit']);
  });

  it('product.catalogue is demo-capable and real by default: the routes exist (#131)', () => {
    expect(DEMO_CAPABLE.has('product.catalogue')).toBe(true);
    expect(DEMO_DEFAULT.has('product.catalogue')).toBe(false);
    // The Models tab has no route yet.
    expect(DEMO_DEFAULT.has('product')).toBe(true);
  });
});

describe('SampleProductService catalogue (sample data, marked Demo data on screen)', () => {
  const sample = () => new SampleProductService(0);

  it('adds a product that the list and get then show, active at version 1', async () => {
    const service = sample();
    const created = await service.create(newProduct);
    expect(created).toEqual(expect.objectContaining({ ...newProduct, status: 'active', version: 1 }));
    expect((await service.list({ search: 'hlm-01' })).items.map((p) => p.code)).toEqual(['HLM-01']);
    expect(await service.get(created.id)).toEqual(created);
  });

  it('refuses a code already used, as the API does (409 product.code_taken)', async () => {
    const service = sample();
    await service.create(newProduct);
    const refusal = await service.create({ ...newProduct, name: 'Another' }).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(ApiRequestError);
    expect((refusal as ApiRequestError).status).toBe(409);
    expect((refusal as ApiRequestError).body?.fields[0]?.code).toBe('product.code_taken');
  });

  it('edits with the version read, and refuses a stale one (409 product.version_conflict)', async () => {
    const service = sample();
    const created = await service.create(newProduct);
    const archived = await service.edit(created.id, { version: 1, status: 'archived' });
    expect(archived).toEqual(expect.objectContaining({ status: 'archived', version: 2 }));
    const stale = await service.edit(created.id, { version: 1, name: 'Late' }).catch((e: unknown) => e);
    expect((stale as ApiRequestError).body?.fields[0]?.code).toBe('product.version_conflict');
    expect((await service.list({ status: 'active' })).items.map((p) => p.id)).not.toContain(created.id);
  });

  it('an unknown id is 404 product.not_found', async () => {
    const refusal = await sample()
      .get('0196f000-0000-7000-8000-00000000ffff')
      .catch((e: unknown) => e);
    expect((refusal as ApiRequestError).status).toBe(404);
  });
});
