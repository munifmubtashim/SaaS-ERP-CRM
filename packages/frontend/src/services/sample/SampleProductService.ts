import type {
  ProductCreate,
  ProductDetail,
  ProductEdit,
  ProductListQueryInput,
  ProductListResponse,
} from '@erp/shared';
import { ApiRequestError } from '../HttpClient';
import type { IProductService } from '../productService';
import { MODELS, sampleModels } from './sampleUnits';

/** The sample catalogue: the four sample models (serial-tracked) and a few counted items. Every value is invented. */
function seed(): ProductDetail[] {
  const bikes = MODELS.map((m, i): ProductDetail => ({
    id: `0196f000-0000-7000-8000-00000000c${String(i + 1).padStart(3, '0')}`,
    code: m.id.toUpperCase(),
    name: m.name,
    nameBn: null,
    brand: 'Sample Motors',
    category: 'Motorcycles',
    unit: 'pcs',
    tracking: 'serial',
    sellPrice: m.price,
    status: 'active',
    version: 1,
  }));
  const counted: [string, string, string, string, string][] = [
    ['HLM-STD', 'Helmet, standard', 'Accessories', 'pcs', '1850.00'],
    ['OIL-10W30', 'Engine oil 10W-30, 1 litre', 'Lubricants', 'litre', '650.00'],
    ['CHN-KIT', 'Chain and sprocket kit', 'Spare parts', 'set', '2400.00'],
  ];
  return [
    ...bikes,
    ...counted.map(([code, name, category, unit, sellPrice], i): ProductDetail => ({
      id: `0196f000-0000-7000-8000-00000000d${String(i + 1).padStart(3, '0')}`,
      code,
      name,
      nameBn: null,
      brand: null,
      category,
      unit,
      tracking: 'quantity',
      sellPrice,
      status: 'active',
      version: 1,
    })),
  ];
}

const refusal = (
  status: number,
  code: 'NOT_FOUND' | 'CONFLICT',
  path: string,
  fieldCode: string,
  message: string,
) =>
  new ApiRequestError(status, {
    code,
    message,
    fields: [{ path, code: fieldCode, message }],
    requestId: 'sample',
  });

/**
 * The Products sample behind IProductService: development builds only (VITE_DEMO_DATA=product for the Models tab,
 * product.catalogue for the catalogue). The catalogue keeps added and edited products in memory and refuses what the
 * API refuses (ADR 0052): a used code, a stale version, an unknown id.
 */
export class SampleProductService implements IProductService {
  private readonly products = seed();
  private next = 1;

  constructor(private readonly delayMs = 300) {}

  private later<T>(value: () => T): Promise<T> {
    return new Promise((resolve, reject) =>
      setTimeout(() => {
        try {
          resolve(value());
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }, this.delayMs),
    );
  }

  private find(id: string): ProductDetail {
    const product = this.products.find((p) => p.id === id);
    if (!product) throw refusal(404, 'NOT_FOUND', 'id', 'product.not_found', 'Product not found.');
    return product;
  }

  models = () => this.later(() => sampleModels());

  list(query: ProductListQueryInput): Promise<ProductListResponse> {
    return this.later(() => {
      const term = query.search?.trim().toLowerCase() ?? '';
      const items = this.products
        .filter((p) => !query.status || p.status === query.status)
        .filter(
          (p) => term === '' || [p.name, p.code, p.brand ?? ''].some((v) => v.toLowerCase().includes(term)),
        )
        .map(({ id, code, name, brand, unit, tracking, status }) => ({
          id,
          code,
          name,
          brand,
          unit,
          tracking,
          status,
        }));
      return { items, nextCursor: null };
    });
  }

  get(id: string): Promise<ProductDetail> {
    return this.later(() => ({ ...this.find(id) }));
  }

  create(input: ProductCreate): Promise<ProductDetail> {
    return this.later(() => {
      if (this.products.some((p) => p.code === input.code)) {
        throw refusal(
          409,
          'CONFLICT',
          'code',
          'product.code_taken',
          'A product with this code already exists.',
        );
      }
      const id = `0196f000-0000-7000-8000-00000000e${String(this.next++).padStart(3, '0')}`;
      const created: ProductDetail = { ...input, id, status: 'active', version: 1 };
      this.products.push(created);
      return { ...created };
    });
  }

  edit(id: string, input: ProductEdit): Promise<ProductDetail> {
    return this.later(() => {
      const product = this.find(id);
      const { version, ...changes } = input;
      if (product.version !== version) {
        throw refusal(
          409,
          'CONFLICT',
          'version',
          'product.version_conflict',
          'This product was changed by someone else. Reload it and try again.',
        );
      }
      Object.assign(product, changes, { version: version + 1 });
      return { ...product };
    });
  }
}
