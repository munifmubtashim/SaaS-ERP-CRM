import { HealthController } from './HealthController.js';
import { AuthController } from './AuthController.js';
import { OrganizationController } from './OrganizationController.js';
import { ProductController } from './ProductController.js';
import { InventoryController } from './InventoryController.js';
import { AccountingController } from './AccountingController.js';
import { VehicleController } from './VehicleController.js';
import { ReportController } from './ReportController.js';
import { PartyController } from './PartyController.js';
import { SalesController } from './SalesController.js';
import { PurchaseController } from './PurchaseController.js';
import { ServiceController } from './ServiceController.js';
import { CrmController } from './CrmController.js';
import type { ApiManagers } from './contracts/index.js';
import { SECURE_SESSION_COOKIE, type SessionCookieConfig } from '../config/sessionCookie.js';

export type Controllers = ReturnType<typeof createControllers>;

/** The ONLY place Controllers are constructed (lint-enforced). Each gets its Manager as an interface. */
export function createControllers(
  managers: ApiManagers,
  sessionCookie: SessionCookieConfig = SECURE_SESSION_COOKIE,
) {
  return {
    health: new HealthController(managers.health),
    auth: new AuthController(managers.auth, sessionCookie),
    organization: new OrganizationController(managers.organization),
    product: new ProductController(managers.product),
    inventory: new InventoryController(managers.inventory),
    accounting: new AccountingController(managers.accounting),
    vehicle: new VehicleController(managers.vehicle),
    report: new ReportController(managers.report),
    party: new PartyController(managers.party),
    sales: new SalesController(managers.sales),
    purchase: new PurchaseController(managers.purchase),
    service: new ServiceController(managers.service),
    crm: new CrmController(managers.crm),
  };
}
