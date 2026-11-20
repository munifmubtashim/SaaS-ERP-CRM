import type { ProductListItem, ProductListQueryInput, ProductListResponse } from '@erp/shared';
import type { IProductService } from '../productService';

const id = (n: number) => `0196f000-0000-7000-8000-${String(n).padStart(12, '0')}`;

/** Invented sample catalogue: fictional brands, no real business or product line. */
const PRODUCTS: ProductListItem[] = [
  {
    id: id(201),
    code: 'P-0001',
    name: 'Padma 110 Standard',
    brand: 'Padma Moto',
    unit: 'pcs',
    tracking: 'serial',
    status: 'active',
  },
  {
    id: id(202),
    code: 'P-0002',
    name: 'Padma 125 Disc',
    brand: 'Padma Moto',
    unit: 'pcs',
    tracking: 'serial',
    status: 'active',
  },
  {
    id: id(203),
    code: 'P-0003',
    name: 'Meghna 150 Sport',
    brand: 'Meghna',
    unit: 'pcs',
    tracking: 'serial',
    status: 'active',
  },
  {
    id: id(204),
    code: 'P-0004',
    name: 'Meghna 100 City',
    brand: 'Meghna',
    unit: 'pcs',
    tracking: 'serial',
    status: 'archived',
  },
  {
    id: id(205),
    code: 'P-0101',
    name: 'Engine oil 10W-30, 1 litre',
    brand: 'Jamuna Lube',
    unit: 'bottle',
    tracking: 'quantity',
    status: 'active',
  },
  {
    id: id(206),
    code: 'P-0102',
    name: 'Front brake pad',
    brand: null,
    unit: 'set',
    tracking: 'quantity',
    status: 'active',
  },
  {
    id: id(207),
    code: 'P-0103',
    name: 'Rear brake shoe',
    brand: null,
    unit: 'set',
    tracking: 'quantity',
    status: 'active',
  },
  {
    id: id(208),
    code: 'P-0104',
    name: 'Full-face helmet, size L',
    brand: 'Karnaphuli',
    unit: 'pcs',
    tracking: 'quantity',
    status: 'active',
  },
  {
    id: id(209),
    code: 'P-0105',
    name: 'Chain sprocket kit',
    brand: 'Padma Moto',
    unit: 'kit',
    tracking: 'quantity',
    status: 'archived',
  },
];

/** Stands in for GET /v1/products until the catalogue tables exist. Filters and pages like the API will. */
export class MockProductService implements IProductService {
  constructor(private readonly delayMs = 400) {}

  async list(query: ProductListQueryInput): Promise<ProductListResponse> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const search = query.search?.trim().toLowerCase();
    const matches = PRODUCTS.filter(
      (p) =>
        (!query.status || p.status === query.status) &&
        (!search || `${p.code} ${p.name} ${p.brand ?? ''}`.toLowerCase().includes(search)),
    );
    const start = query.cursor ? Number(query.cursor) : 0;
    const limit = Number(query.limit ?? 25);
    const end = start + limit;
    return { items: matches.slice(start, end), nextCursor: end < matches.length ? String(end) : null };
  }
}
