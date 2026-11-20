import type { LivenessResponse } from '@erp/shared';
import type { Request, Response } from 'express';
import { BaseController } from './BaseController.js';
import type { IHealthManager } from './contracts/IHealthManager.js';

/** Reference Controller: HTTP in and out only. Depends on IHealthManager, never on the class. */
export class HealthController extends BaseController {
  constructor(private readonly manager: IHealthManager) {
    super();
  }

  /**
   * GET /health/live: liveness for the host's health check. Never asks the Manager, so it never touches the
   * database: a check every few seconds would otherwise keep Neon from scaling to zero.
   */
  live(_req: Request, res: Response): void {
    const body: LivenessResponse = { status: 'ok' };
    this.sendJson(res, 200, body);
  }

  /** GET /health: 200 when everything answers, 503 when the database is down (uptime checks alert). */
  async get(_req: Request, res: Response): Promise<void> {
    const health = await this.manager.getHealth();
    this.sendJson(res, health.status === 'ok' ? 200 : 503, health);
  }
}
