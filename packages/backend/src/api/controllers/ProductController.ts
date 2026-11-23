import {
  AppError,
  productCreateSchema,
  productEditSchema,
  productListQuerySchema,
  type ProductDetail,
  type ProductListResponse,
} from '@erp/shared';
import type { Request } from 'express';
import { BaseController, type HttpResult } from './BaseController.js';
import type { IProductManager } from './contracts/IProductManager.js';

/**
 * Product module: HTTP controller (ADR 0052). HTTP in and out only. Owner: Munif. Runs inside the request's tenant
 * transaction (the route wrapper), after tenantMiddleware and the role check.
 */
export class ProductController extends BaseController {
  constructor(protected readonly manager: IProductManager) {
    super();
  }

  async list(req: Request): Promise<HttpResult<ProductListResponse>> {
    return this.json(200, await this.manager.list(this.parse(productListQuerySchema, req.query)));
  }

  async get(req: Request): Promise<HttpResult<ProductDetail>> {
    return this.json(200, await this.manager.get(String(req.params.id)));
  }

  /** The creator is the signed-in user; the business is the request's scope. Neither comes from the body. */
  async create(req: Request): Promise<HttpResult<ProductDetail>> {
    const userId = req.auth?.userId;
    if (!userId) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.');
    const product = await this.manager.create(this.parse(productCreateSchema, req.body), userId);
    return { status: 201, body: product, headers: { Location: `/v1/products/${product.id}` } };
  }

  async edit(req: Request): Promise<HttpResult<ProductDetail>> {
    return this.json(
      200,
      await this.manager.edit(String(req.params.id), this.parse(productEditSchema, req.body)),
    );
  }
}
