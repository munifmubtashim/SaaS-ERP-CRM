import type { HealthResponse } from '@erp/shared';
import { BaseController, type HttpResult } from './BaseController.js';
import type { IHealthManager } from './contracts/IHealthManager.js';

/** Reference Controller: HTTP in and out only. Depends on IHealthManager, never on the class. */
export class HealthController extends BaseController {
  constructor(private readonly manager: IHealthManager) {
    super();
  }

  /** GET /health: 200 when everything answers, 503 when the database is down (uptime checks alert). */
  async get(): Promise<HttpResult<HealthResponse>> {
    const health = await this.manager.getHealth();
    return this.json(health.status === 'ok' ? 200 : 503, health);
  }
}
