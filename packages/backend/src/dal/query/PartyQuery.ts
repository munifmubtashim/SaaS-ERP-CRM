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

/** One page of the customer list (ADR 0056 section 4); the same shape as businessLogic's PartyListFilter. */
export interface PartyListFilter {
  limit: number;
  search?: string;
  status?: PartyStatus;
  alsoSupplier?: boolean;
  after?: { name: string; id: string };
}

/** An active party with a looked-up phone (ADR 0019 section 4): what the duplicate warning shows. Never the NID. */
export interface PartyPhoneMatch {
  id: string;
  code: string;
  name: string;
  phoneE164: string;
  altPhoneE164: string | null;
}

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
 * never found or edited. The walk-in party is made by the business's trigger (ADR 0055), never here.
 */
export class PartyQuery extends BaseQuery {
  async find(id: string): Promise<PartyDTO | null> {
    const [row] = await this.db.$queryRaw<PartyRow[]>`SELECT ${COLUMNS} FROM party WHERE id = ${id}::uuid`;
    return row ? PartyDTO.fromRow(row) : null;
  }

  /**
   * Customers, by name then id (the (business_id, name) index, ADR 0019 section 2), after the cursor's row. Search is
   * contains on name, code and phone (ADR 0019 question 4); strpos, not LIKE, so % and _ are characters.
   */
  async list(filter: PartyListFilter): Promise<PartyDTO[]> {
    const where = [Prisma.sql`is_customer`];
    if (filter.search) {
      const term = filter.search.toLowerCase();
      where.push(Prisma.sql`(strpos(lower(name), ${term}) > 0 OR strpos(lower(code), ${term}) > 0
        OR strpos(phone_e164, ${term}) > 0)`);
    }
    if (filter.status) where.push(Prisma.sql`status = ${filter.status}`);
    if (filter.alsoSupplier) where.push(Prisma.sql`is_supplier`);
    if (filter.after) where.push(Prisma.sql`(name, id) > (${filter.after.name}, ${filter.after.id}::uuid)`);
    const rows = await this.db.$queryRaw<PartyRow[]>`
      SELECT ${COLUMNS} FROM party WHERE ${Prisma.join(where, ' AND ')} ORDER BY name, id LIMIT ${filter.limit}`;
    return rows.map((row) => PartyDTO.fromRow(row));
  }

  /** The duplicate-phone lookup: active, non-walk-in parties with any of the phones, except the one being edited. */
  async findByPhones(phones: string[], exceptId: string | null): Promise<PartyPhoneMatch[]> {
    if (phones.length === 0) return [];
    return this.db.$queryRaw<PartyPhoneMatch[]>`
      SELECT id::text AS "id", code, name, phone_e164 AS "phoneE164", alt_phone_e164 AS "altPhoneE164"
        FROM party
       WHERE status = 'active' AND NOT is_walk_in
         AND (phone_e164 = ANY (${phones}::text[]) OR alt_phone_e164 = ANY (${phones}::text[]))
         AND (${exceptId}::uuid IS NULL OR id <> ${exceptId}::uuid)
       ORDER BY code`;
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
