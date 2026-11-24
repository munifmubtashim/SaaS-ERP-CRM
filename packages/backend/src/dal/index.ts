// Public surface of @erp/dal. Only businessLogic imports it. Never re-export generated Prisma types.
export { createDbClient, type DbClient, type DbClientOptions } from './config/db.js';
export { runInTenantScope, TenantScopeRunner, type TenantRunOptions } from './config/tenantScope.js';
export { BaseDTO, type BaseRow } from './dto/BaseDTO.js';
export { HealthDTO } from './dto/HealthDTO.js';
export { BaseQuery } from './query/BaseQuery.js';
export { HealthQuery } from './query/HealthQuery.js';
export { AuthDTO, LoginUserDTO, ScopeDTO, SessionDTO } from './dto/AuthDTO.js';
export { AuthQuery, type CreateUserInput, type NewSessionInput } from './query/AuthQuery.js';
export { NumberSeriesQuery, type TakenNumberRow } from './query/NumberSeriesQuery.js';
export { IdempotencyQuery, type ClaimKeyInput, type StoredKeyRow } from './query/IdempotencyQuery.js';
export { OrganizationDTO } from './dto/OrganizationDTO.js';
export { OrganizationQuery } from './query/OrganizationQuery.js';
// The provisioner (ADR 0010): the factory and the types only. The client stays inside dal.
export { BusinessDTO, BranchDTO } from './dto/OrganizationDTO.js';
export {
  createProvisioningQuery,
  type ProvisioningQuery,
  type CreateBusinessInput,
  type CreateBranchInput,
} from './query/ProvisioningQuery.js';
export { ProductDTO, type ProductRow } from './dto/ProductDTO.js';
export {
  ProductQuery,
  type NewProduct,
  type ProductChanges,
  type ProductFilter,
} from './query/ProductQuery.js';
export { SerialUnitQuery } from './query/SerialUnitQuery.js';
export { StockQuery, type StockMovementInsert } from './query/StockQuery.js';
export { JournalQuery, type JournalInsert, type JournalLineInsert } from './query/JournalQuery.js';
export { InventoryDTO, SerialUnitDTO, type SerialUnitRow } from './dto/InventoryDTO.js';
export { InventoryQuery } from './query/InventoryQuery.js';
export { AccountingDTO } from './dto/AccountingDTO.js';
export { AccountingQuery } from './query/AccountingQuery.js';
export { VehicleDTO } from './dto/VehicleDTO.js';
export { VehicleQuery } from './query/VehicleQuery.js';
export { ReportDTO } from './dto/ReportDTO.js';
export { ReportQuery } from './query/ReportQuery.js';
export { PartyDTO } from './dto/PartyDTO.js';
export { PartyQuery } from './query/PartyQuery.js';
export { SalesDTO } from './dto/SalesDTO.js';
export { SalesQuery, type InvoiceInsert, type InvoiceLineInsert } from './query/SalesQuery.js';
export { SalesPaymentQuery, type SalesPaymentInsert } from './query/SalesPaymentQuery.js';
export { LedgerQuery } from './query/LedgerQuery.js';
export { PurchaseDTO } from './dto/PurchaseDTO.js';
export { PurchaseQuery } from './query/PurchaseQuery.js';
export { ServiceDTO } from './dto/ServiceDTO.js';
export { ServiceQuery } from './query/ServiceQuery.js';
export { CrmDTO } from './dto/CrmDTO.js';
export { CrmQuery } from './query/CrmQuery.js';
// Seeds (ADR 0009 part 4): run as the migration owner, outside requests, by the seed script.
export { seedPermissions, seedSystemRoles } from './prisma/seeds/systemRoles.js';
export {
  DEMO_IDS,
  seedDemoOrganization,
  type DemoIds,
  type DemoOwner,
} from './prisma/seeds/demoOrganization.js';
