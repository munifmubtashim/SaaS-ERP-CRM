import type { Controllers } from '../controllers/index.js';
import { healthRoutes } from './HealthRoutes.js';
import { authRoutes } from './AuthRoutes.js';
import { meRoutes } from './MeRoutes.js';
import { organizationRoutes } from './OrganizationRoutes.js';
import { productRoutes } from './ProductRoutes.js';
import { inventoryRoutes } from './InventoryRoutes.js';
import { accountingRoutes } from './AccountingRoutes.js';
import { vehicleRoutes } from './VehicleRoutes.js';
import { reportRoutes } from './ReportRoutes.js';
import { partyRoutes } from './PartyRoutes.js';
import { salesRoutes } from './SalesRoutes.js';
import { purchaseRoutes } from './PurchaseRoutes.js';
import { serviceRoutes } from './ServiceRoutes.js';
import { crmRoutes } from './CrmRoutes.js';
import type { RouteWrappers } from './tenantRoute.js';
import { LoginRateLimiter, loginRateLimit } from '../middleware/loginRateLimit.js';
import type { ModuleRoutes } from './types.js';

export { PUBLIC_ROUTES, type ModuleRoutes, type RouteScope } from './types.js';

/** Every module router. app.ts mounts exactly these; the isolation test reads this list too. */
export function buildRoutes(
  c: Controllers,
  wrap: RouteWrappers,
  loginRateLimiter: LoginRateLimiter = new LoginRateLimiter(),
): ModuleRoutes[] {
  return [
    healthRoutes(c.health, wrap),
    authRoutes(c.auth, wrap, loginRateLimit(loginRateLimiter)),
    meRoutes(c.auth, wrap),
    organizationRoutes(c.organization),
    productRoutes(c.product, wrap),
    inventoryRoutes(c.inventory, wrap),
    accountingRoutes(c.accounting),
    vehicleRoutes(c.vehicle),
    reportRoutes(c.report, wrap),
    partyRoutes(c.party),
    salesRoutes(c.sales, wrap),
    purchaseRoutes(c.purchase),
    serviceRoutes(c.service),
    crmRoutes(c.crm),
  ];
}
