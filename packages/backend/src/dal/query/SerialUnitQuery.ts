import { AppError } from '@erp/shared';
import { Prisma } from '../generated/prisma/client.js';
import { SerialUnitDTO, type SerialUnitRow } from '../dto/InventoryDTO.js';
import { BaseQuery } from './BaseQuery.js';

/** The columns a unit DTO carries: never unit_cost (ADR 0020 section 3). */
const COLUMNS = Prisma.sql`
  su.id::text AS id, su.business_id::text AS "businessId", su.branch_id::text AS "branchId",
  su.product_id::text AS "productId", su.serial_no AS "serialNo", su.status, su.invoice_id::text AS "invoiceId",
  su.reserved_by_ref::text AS "reservedByRef", su.version, su.created_at AS "createdAt",
  su.updated_at AS "updatedAt", su.created_by::text AS "createdBy"`;

const conflict = (code: string, message: string, path = 'unitId') =>
  new AppError('CONFLICT', message, [{ path, code, message }]);

/**
 * Inventory module: serial units (ADR 0020 sections 2 to 4). Owner: Munif. Runs inside the request's tenant
 * transaction (BaseQuery); RLS limits it to the request's businesses and branches.
 *
 * Every status change is ONE conditional UPDATE that names the status it expects (invariant 6, F-02), never
 * read-then-write: two cashiers, one chassis, one wins; the other's UPDATE re-checks the row after the first
 * commits, matches nothing, and is refused with 409. The status trigger (#106) refuses any other change.
 */
export class SerialUnitQuery extends BaseQuery {
  async findBySerial(serialNo: string): Promise<SerialUnitDTO | null> {
    const [row] = await this.db.$queryRaw<SerialUnitRow[]>`
      SELECT ${COLUMNS} FROM serial_unit su WHERE su.serial_no = ${serialNo}`;
    return row ? SerialUnitDTO.fromRow(row) : null;
  }

  async listByBranch(
    branchId: string,
    filter: { status?: SerialUnitRow['status']; afterId?: string; limit: number },
  ): Promise<SerialUnitDTO[]> {
    const where = [Prisma.sql`su.branch_id = ${branchId}::uuid`];
    if (filter.status) where.push(Prisma.sql`su.status = ${filter.status}`);
    if (filter.afterId) where.push(Prisma.sql`su.id > ${filter.afterId}::uuid`);
    const rows = await this.db.$queryRaw<SerialUnitRow[]>`
      SELECT ${COLUMNS} FROM serial_unit su WHERE ${Prisma.join(where, ' AND ')} ORDER BY su.id LIMIT ${filter.limit}`;
    return rows.map((row) => SerialUnitDTO.fromRow(row));
  }

  /** in_stock → reserved, for a reference (a booking). 409 unit.not_available if it isn't in stock here. */
  async reserve(unitId: string, branchId: string, ref: string): Promise<SerialUnitDTO> {
    return this.change(
      Prisma.sql`status = 'reserved', reserved_by_ref = ${ref}::uuid`,
      Prisma.sql`su.id = ${unitId}::uuid AND su.branch_id = ${branchId}::uuid AND su.status = 'in_stock'`,
      () => conflict('unit.not_available', 'This unit is not in stock at this branch.'),
    );
  }

  /** reserved → in_stock, only by the reference that holds it. 409 unit.not_reserved otherwise. */
  async release(unitId: string, branchId: string, ref: string): Promise<SerialUnitDTO> {
    return this.change(
      Prisma.sql`status = 'in_stock', reserved_by_ref = NULL`,
      Prisma.sql`su.id = ${unitId}::uuid AND su.branch_id = ${branchId}::uuid AND su.status = 'reserved'
                 AND su.reserved_by_ref = ${ref}::uuid`,
      () => conflict('unit.not_reserved', 'This unit is not reserved by this reference.'),
    );
  }

  /**
   * in_stock (or reserved by `ref`) → sold, for an invoice, if its product is active (C2). Returns the unit's own
   * cost (invariant 7) for the sale's cost of goods (ADR 0022), and nothing else. 409 product.archived, or
   * unit.not_available. The refused sale throws, so the request's transaction rolls back whole.
   */
  async sell(
    unitId: string,
    branchId: string,
    invoiceId: string,
    ref: string | null,
  ): Promise<{ unitCost: string }> {
    const sellable = Prisma.sql`su.id = ${unitId}::uuid AND su.branch_id = ${branchId}::uuid
      AND (su.status = 'in_stock' OR (su.status = 'reserved' AND su.reserved_by_ref = ${ref}::uuid))`;
    const [sold] = await this.db.$queryRaw<{ unitCost: string }[]>`
      UPDATE serial_unit su
         SET status = 'sold', invoice_id = ${invoiceId}::uuid, version = su.version + 1, updated_at = now()
        FROM product p
       WHERE p.business_id = su.business_id AND p.id = su.product_id AND p.status = 'active' AND ${sellable}
      RETURNING su.unit_cost::text AS "unitCost"`;
    if (sold) return sold;
    // Nothing changed. Only the error's code depends on this read; it writes nothing.
    const [blocked] = await this.db.$queryRaw<{ productStatus: string }[]>`
      SELECT p.status AS "productStatus" FROM serial_unit su
        JOIN product p ON p.business_id = su.business_id AND p.id = su.product_id
       WHERE ${sellable}`;
    if (blocked?.productStatus === 'archived') {
      throw conflict('product.archived', 'This product is archived and cannot be sold.', 'productId');
    }
    throw conflict('unit.not_available', 'This unit is not available to sell at this branch.');
  }

  /** sold → delivered, for the invoice that sold it. 409 unit.not_sold otherwise. */
  async deliver(unitId: string, branchId: string, invoiceId: string): Promise<SerialUnitDTO> {
    return this.change(
      Prisma.sql`status = 'delivered'`,
      Prisma.sql`su.id = ${unitId}::uuid AND su.branch_id = ${branchId}::uuid AND su.status = 'sold'
                 AND su.invoice_id = ${invoiceId}::uuid`,
      () => conflict('unit.not_sold', 'This unit was not sold on this invoice.'),
    );
  }

  /** One conditional UPDATE … RETURNING; zero rows throws the caller's 409. */
  private async change(set: Prisma.Sql, where: Prisma.Sql, refused: () => AppError): Promise<SerialUnitDTO> {
    const [row] = await this.db.$queryRaw<SerialUnitRow[]>`
      UPDATE serial_unit su SET ${set}, version = su.version + 1, updated_at = now()
       WHERE ${where}
      RETURNING ${COLUMNS}`;
    if (!row) throw refused();
    return SerialUnitDTO.fromRow(row);
  }
}
