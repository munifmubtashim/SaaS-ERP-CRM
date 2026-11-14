import type { HealthManager } from '@erp/business-logic';
import type { RequestHandler } from 'express';

/** Example Controller: HTTP only. It calls HealthManager and maps the result to a status code. */
export class HealthController {
  constructor(private readonly manager: Pick<HealthManager, 'getHealth'>) {}

  /** GET /health: 200 when everything answers, 503 when the database is down (uptime checks alert). */
  get: RequestHandler = async (_req, res) => {
    const health = await this.manager.getHealth();
    res.status(health.status === 'ok' ? 200 : 503).json(health);
  };
}
