import type { Request, Response } from 'express';
import { BaseController } from './BaseController.js';
import type { IHealthManager } from './contracts/IHealthManager.js';

/** Reference Controller: HTTP in and out only. Depends on IHealthManager, never on the class. */
export class HealthController extends BaseController {
  constructor(private readonly manager: IHealthManager) {
    super();
  }

  /** GET /health: 200 when everything answers, 503 when the database is down (uptime checks alert). */
  async get(_req: Request, res: Response): Promise<void> {
    const health = await this.manager.getHealth();
    this.sendJson(res, health.status === 'ok' ? 200 : 503, health);
  }
}
