import { Prisma } from '../generated/prisma/client.js';
import { PartyDTO, type PartyKind, type PartyRow, type PartyStatus } from '../dto/PartyDTO.js';
import { BaseQuery } from './BaseQuery.js';

/**
 * A new party. The business is the request's one business. `code` is passed in until ADR 0019 question 1 decides
 * its source; it never changes afterwards. Phones are already E.164 (the Manager normalises them).
 */
export interface NewParty {
  code: string;
  name: string;
  nameBn: string | null;
  kind: PartyKind;
  isCustomer: boolean;
  isSupplier: boolean;
  phoneE164: string;
  altPhoneE164: string | null;
  email: string | null;
  address: string | null;
  area: string | null;
  /** A decimal string, e.g. "50000.00", or null for no limit; stored as numeric(18,2). */
  creditLimit: string | null;
  payTermDays: number | null;
  createdBranchId: string | null;
  createdBy: string;
}

/** The columns erp_app may change (the column grant in party.sql); code, is_walk_in and the audit columns are not. */
export type PartyChanges = Partial<
  Omit<NewParty, 'code' | 'createdBranchId' | 'createdBy'> & {
    status: PartyStatus;
    assignedTo: string | null;
  }
>;

const COLUMNS = Prisma.sql`
  id::text AS id, business_id::text AS "businessId", code, name, name_bn AS "nameBn", kind,
  is_customer AS "isCustomer", is_supplier AS "isSupplier", phone_e164 AS "phoneE164",
  alt_phone_e164 AS "altPhoneE164", email, address, area, credit_limit::text AS "creditLimit",
  pay_term_days AS "payTermDays", status, is_walk_in AS "isWalkIn", assigned_to::text AS "assignedTo",
  created_branch_id::text AS "createdBranchId", version, created_at AS "createdAt", updated_at AS "updatedAt",
  created_by::text AS "createdBy"`;

/** Each changeable field's SET clause, with its cast, so `edit` sets only what it was given. */
const SETTERS: { [K in keyof PartyChanges]-?: (value: PartyChanges[K]) => Prisma.Sql } = {
  name: (v) => Prisma.sql`name = ${v}`,
  nameBn: (v) => Prisma.sql`name_bn = ${v}`,
  kind: (v) => Prisma.sql`kind = ${v}`,
  isCustomer: (v) => Prisma.sql`is_customer = ${v}`,
  isSupplier: (v) => Prisma.sql`is_supplier = ${v}`,
  phoneE164: (v) => Prisma.sql`phone_e164 = ${v}`,
  altPhoneE164: (v) => Prisma.sql`alt_phone_e164 = ${v}`,
  email: (v) => Prisma.sql`email = ${v}`,
  address: (v) => Prisma.sql`address = ${v}`,
  area: (v) => Prisma.sql`area = ${v}`,
  creditLimit: (v) => Prisma.sql`credit_limit = ${v}::numeric`,
  payTermDays: (v) => Prisma.sql`pay_term_days = ${v}::int`,
  status: (v) => Prisma.sql`status = ${v}`,
  assignedTo: (v) => Prisma.sql`assigned_to = ${v}::uuid`,
};

/**
 * Party module: database access (dal), ADR 0019 section 5. Owner: Farhan. Runs inside the request's tenant
 * transaction (BaseQuery); RLS limits every statement to the request's businesses, so another business's party is
 * never found or edited. The list, the duplicate check and ensureWalkIn() come with the Manager (ADR 0019 part 2).
 */
export class PartyQuery extends BaseQuery {
  async find(id: string): Promise<PartyDTO | null> {
    const [row] = await this.db.$queryRaw<PartyRow[]>`SELECT ${COLUMNS} FROM party WHERE id = ${id}::uuid`;
    return row ? PartyDTO.fromRow(row) : null;
  }

  /** Creates in the request's one business. A code already used there fails on party_business_id_code_key. */
  async create(input: NewParty): Promise<PartyDTO> {
    await this.requireOneBusiness('A party');
    const [row] = await this.db.$queryRaw<PartyRow[]>`
      INSERT INTO party (business_id, code, name, name_bn, kind, is_customer, is_supplier, phone_e164,
                         alt_phone_e164, email, address, area, credit_limit, pay_term_days, created_branch_id,
                         created_by)
      VALUES ((SELECT app_business_ids())[1], ${input.code}, ${input.name}, ${input.nameBn}, ${input.kind},
              ${input.isCustomer}, ${input.isSupplier}, ${input.phoneE164}, ${input.altPhoneE164}, ${input.email},
              ${input.address}, ${input.area}, ${input.creditLimit}::numeric, ${input.payTermDays}::int,
              ${input.createdBranchId}::uuid, ${input.createdBy}::uuid)
      RETURNING ${COLUMNS}`;
    if (!row) throw new Error('the party insert returned no row');
    return PartyDTO.fromRow(row);
  }

  /**
   * The optimistic version check (invariant 6): one `UPDATE … WHERE id AND version = $read RETURNING`. Null means no
   * row matched: the party changed since it was read, or isn't visible in this scope. The Manager tells them apart.
   */
  async edit(id: string, version: number, changes: PartyChanges): Promise<PartyDTO | null> {
    const sets = [Prisma.sql`version = version + 1`, Prisma.sql`updated_at = now()`];
    for (const field of Object.keys(SETTERS) as (keyof PartyChanges)[]) {
      const setter = SETTERS[field] as (value: unknown) => Prisma.Sql;
      if (changes[field] !== undefined) sets.push(setter(changes[field]));
    }
    const [row] = await this.db.$queryRaw<PartyRow[]>`
      UPDATE party SET ${Prisma.join(sets, ', ')}
      WHERE id = ${id}::uuid AND version = ${version}
      RETURNING ${COLUMNS}`;
    return row ? PartyDTO.fromRow(row) : null;
  }
}
