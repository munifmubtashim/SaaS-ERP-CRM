import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { createOwnerDatabase, type OwnerDatabase } from './support/ownerDatabase.js';
import { addBranch, createTree, setScope, type Tree } from './support/orgTree.js';
import {
  policies,
  rlsState,
  sourceIsInMigration,
  tablePrivileges,
  truncateRefusers,
} from './support/tableRules.js';

/**
 * Migration party (ADR 0019 part 3): the party table's rules, tested in SQL as erp_app and as owners. ADR 0019
 * database tests 1 to 7 and 9; test 8 (the version check) is PartyQuery.int.test.ts. Every test uses fresh
 * businesses or codes and asserts only on its own rows: nothing is deleted (ADR 0008).
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 4, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 4, txTimeoutMs: 10_000 });
const USER = randomUUID();

type Tx = Parameters<Parameters<DbClient['$transaction']>[0]>[0];

let x: Tree;
let y: Tree;

const freshCode = () => `C-${randomBytes(5).toString('hex')}`;

function inScope<T>(db: DbClient, tree: Tree, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId]);
    return fn(tx);
  });
}

interface PartyFields {
  code?: string;
  kind?: string;
  isCustomer?: boolean;
  isSupplier?: boolean;
  creditLimit?: string | null;
  payTermDays?: number | null;
  status?: string;
  isWalkIn?: boolean;
  createdBy?: string | null;
  businessId?: string;
  createdBranchId?: string | null;
}

/** Inserts a party in `tree`'s scope on `db` (erp_app or an owner). Returns its id. */
async function addParty(db: DbClient, tree: Tree, fields: PartyFields = {}): Promise<string> {
  return inScope(db, tree, async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO party (business_id, code, name, kind, is_customer, is_supplier, phone_e164, credit_limit,
                         pay_term_days, status, is_walk_in, created_branch_id, created_by)
      VALUES (${fields.businessId ?? tree.businessId}::uuid, ${fields.code ?? freshCode()}, 'Rahim Uddin',
              ${fields.kind ?? 'person'}, ${fields.isCustomer ?? true}, ${fields.isSupplier ?? false},
              '+8801712345678', ${fields.creditLimit ?? null}::numeric, ${fields.payTermDays ?? null}::int,
              ${fields.status ?? 'active'}, ${fields.isWalkIn ?? false},
              ${fields.createdBranchId === undefined ? tree.branchId : fields.createdBranchId}::uuid,
              ${fields.createdBy === undefined ? USER : fields.createdBy}::uuid)
      RETURNING id::text`;
    if (!row) throw new Error('the insert returned no row');
    return row.id;
  });
}

beforeAll(async () => {
  [x, y] = await Promise.all([createTree(owner), createTree(owner)]);
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

describe('ADR 0019 test 1: RLS is forced, and every policy names its role', () => {
  it('RLS is enabled and forced', async () => {
    expect(await rlsState(owner, 'party')).toEqual([{ enabled: true, forced: true }]);
  });

  it('policies: SELECT, INSERT and UPDATE for erp_app and the migration owner; no DELETE or ALL policy', async () => {
    const [{ me }] = (await owner.$queryRaw<{ me: string }[]>`SELECT current_user::text AS me`) as [
      { me: string },
    ];
    const rows = await policies(owner, 'party');
    expect(rows.map((row) => `${row.cmd} ${row.roles.join(',')}`).sort()).toEqual(
      [
        'INSERT erp_app',
        `INSERT ${me}`,
        'SELECT erp_app',
        `SELECT ${me}`,
        'UPDATE erp_app',
        `UPDATE ${me}`,
      ].sort(),
    );
  });

  it('with no tenant scope set, reading fails with "tenant scope not set"', async () => {
    // On an empty table PostgreSQL never runs the policy's InitPlan, so nothing would raise: one row first.
    await addParty(owner, x);
    await expect(app.$queryRaw`SELECT id FROM party`).rejects.toThrow(/tenant scope not set/);
  });
});

describe('ADR 0019 test 2: business X sees, changes and creates nothing of business Y', () => {
  it("in X, erp_app finds no Y party, even by id, updates none, and can't insert one into Y", async () => {
    const idY = await addParty(owner, y);
    await inScope(app, x, async (tx) => {
      expect(await tx.$queryRaw`SELECT id FROM party WHERE id = ${idY}::uuid`).toEqual([]);
      expect(await tx.$queryRaw`SELECT id FROM party WHERE business_id = ${y.businessId}::uuid`).toEqual([]);
      expect(await tx.$executeRaw`UPDATE party SET name = 'X' WHERE id = ${idY}::uuid`).toBe(0);
    });
    await expect(addParty(app, x, { businessId: y.businessId, createdBranchId: null })).rejects.toThrow(
      /row-level security/,
    );
  });
});

describe('ADR 0019 test 3: no DELETE or TRUNCATE; erp_app writes only the editable columns', () => {
  it('erp_app holds SELECT and INSERT, and UPDATE only on the editable columns', async () => {
    expect(await tablePrivileges(owner, 'party', 'erp_app')).toEqual(['INSERT', 'SELECT']);
    const columns = await owner.$queryRaw<{ column: string }[]>`
      SELECT column_name AS column FROM information_schema.column_privileges
      WHERE table_name = 'party' AND grantee = 'erp_app' AND privilege_type = 'UPDATE' ORDER BY column_name`;
    expect(columns.map((row) => row.column)).toEqual([
      'address',
      'alt_phone_e164',
      'area',
      'assigned_to',
      'credit_limit',
      'email',
      'is_customer',
      'is_supplier',
      'kind',
      'name',
      'name_bn',
      'pay_term_days',
      'phone_e164',
      'status',
      'updated_at',
      'version',
    ]);
  });

  it.each(['code', 'business_id', 'is_walk_in', 'created_branch_id', 'created_by', 'created_at', 'id'])(
    'erp_app cannot UPDATE %s',
    async (column) => {
      await expect(
        inScope(app, x, (tx) => tx.$executeRawUnsafe(`UPDATE party SET ${column} = ${column} WHERE false`)),
      ).rejects.toThrow(/permission denied/);
    },
  );

  it('erp_app cannot DELETE or TRUNCATE', async () => {
    await expect(app.$executeRawUnsafe('DELETE FROM party WHERE false')).rejects.toThrow(/permission denied/);
    await expect(app.$executeRawUnsafe('TRUNCATE party')).rejects.toThrow(/permission denied/);
  });

  it('the BEFORE TRUNCATE trigger exists on party', async () => {
    expect(await truncateRefusers(owner, 'party')).toEqual(['party_no_truncate']);
  });

  it('TRUNCATE party is refused for the superuser owner too, by any mechanism, and every row remains', async () => {
    // Since party_keys, other tables reference party, so PostgreSQL may refuse before the trigger runs; either way the
    // TRUNCATE must fail and nothing may be removed. The test above proves the trigger is there regardless.
    const count = async () =>
      (await owner.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM party`)[0]?.n;
    const before = await count();
    expect(before).toBeGreaterThan(0);
    const attempt = owner.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('TRUNCATE party');
      throw new Error('TRUNCATE ran (rolled back)');
    });
    await expect(attempt).rejects.toThrow();
    await expect(attempt).rejects.not.toThrow(/TRUNCATE ran/);
    expect(await count()).toBe(before);
  });

  describe('an owner that is neither superuser nor BYPASSRLS (ADR 0009 test case 6)', () => {
    let db: OwnerDatabase;
    let tree: Tree;
    let other: Tree;

    beforeAll(async () => {
      db = await createOwnerDatabase(ownerUrl);
      [tree, other] = await Promise.all([createTree(db.client), createTree(db.client)]);
    }, 120_000);

    afterAll(async () => {
      await db?.drop();
    }, 60_000);

    it('writes and reads only inside the business it set', async () => {
      const mine = await addParty(db.client, tree);
      await addParty(db.client, other);
      const seen = await inScope(
        db.client,
        tree,
        // The business's walk-in party (ADR 0055 trigger) is in scope too; this test is about the other rows.
        (tx) => tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM party WHERE NOT is_walk_in`,
      );
      expect(seen).toEqual([{ id: mine }]);
      await expect(
        addParty(db.client, tree, { businessId: other.businessId, createdBranchId: null }),
      ).rejects.toThrow(/row-level security/);
    });

    it('a DELETE removes 0 rows and the rows remain; a TRUNCATE is refused (any mechanism) and they still remain', async () => {
      await addParty(db.client, tree);
      const result = await inScope(db.client, tree, async (tx) => ({
        deleted: await tx.$executeRawUnsafe('DELETE FROM party'),
        left: (await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM party`)[0]?.n,
      }));
      expect(result.deleted).toBe(0);
      expect(result.left).toBeGreaterThan(0);
      await expect(db.client.$executeRawUnsafe('TRUNCATE party')).rejects.toThrow();
      const after = await inScope(
        db.client,
        tree,
        (tx) => tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM party`,
      );
      expect(after[0]?.n).toBe(result.left);
    });
  });
});

describe('ADR 0019 test 4: the creating branch belongs to the same business', () => {
  it("a party of X naming Y's branch fails on the composite key, even as the owner", async () => {
    await expect(addParty(owner, x, { createdBranchId: y.branchId })).rejects.toThrow(
      /party_business_id_created_branch_id_fkey/,
    );
  });

  it('another branch of the same business is accepted, and no branch at all is too', async () => {
    const shortCode = `P${randomBytes(2).toString('hex').toUpperCase()}`;
    const second = await addBranch(owner, x.organizationId, x.businessId, shortCode);
    await expect(addParty(owner, x, { createdBranchId: second })).resolves.toMatch(/^[0-9a-f-]{36}$/);
    await expect(addParty(owner, x, { createdBranchId: null })).resolves.toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('ADR 0019 test 5: a code is unique per business', () => {
  it('the same code is refused twice in one business and accepted in another', async () => {
    const code = freshCode();
    await addParty(app, x, { code });
    await expect(addParty(app, x, { code })).rejects.toThrow(/party_business_id_code_key/);
    await expect(addParty(owner, y, { code })).resolves.toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('ADR 0019 test 6: one walk-in party per business; created_by is required for every other party', () => {
  /** The walk-in insert ensureWalkIn() will run (ADR 0019 section 5): insert if missing, then read. */
  const ensureWalkIn = (tree: Tree) =>
    inScope(app, tree, async (tx) => {
      await tx.$executeRaw`
        INSERT INTO party (business_id, code, name, kind, is_customer, is_supplier, phone_e164, is_walk_in, created_by)
        VALUES (${tree.businessId}::uuid, ${freshCode()}, 'Walk-in customer', 'person', true, false, '+8800000000000',
                true, ${USER}::uuid)
        ON CONFLICT (business_id) WHERE is_walk_in DO NOTHING`;
      const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM party WHERE is_walk_in`;
      return row?.id;
    });

  it('a second walk-in party in one business is refused', async () => {
    // The business's trigger already made its walk-in party (ADR 0055), so one more insert is the second.
    const tree = await createTree(owner);
    await expect(addParty(owner, tree, { isWalkIn: true })).rejects.toThrow(/party_one_walk_in_per_business/);
  });

  it('two parallel walk-in inserts in one business leave exactly one, and both return it', async () => {
    const tree = await createTree(owner);
    const [first, second] = await Promise.all([ensureWalkIn(tree), ensureWalkIn(tree)]);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toBe(first);
  });

  it('a party that is not the walk-in party needs created_by; a seeded walk-in party may have none', async () => {
    await expect(addParty(owner, x, { createdBy: null })).rejects.toThrow(/party_created_by_required/);
    // The walk-in party the business's trigger made (ADR 0055) has no created_by, and the CHECK allows it.
    const tree = await createTree(owner);
    const walkIns = await inScope(
      owner,
      tree,
      (tx) => tx.$queryRaw<{ created_by: string | null }[]>`
        SELECT created_by::text FROM party WHERE business_id = ${tree.businessId}::uuid AND is_walk_in`,
    );
    expect(walkIns).toEqual([{ created_by: null }]);
  });
});

describe('ADR 0019 test 7: credit limit and the other column rules', () => {
  it('credit limits 50000.00 and 0.00 read back exactly as numeric(18,2); no limit is null', async () => {
    const ids = await Promise.all(
      ['50000.00', '0.00', null].map((creditLimit) => addParty(app, x, { creditLimit })),
    );
    const rows = await inScope(
      app,
      x,
      (tx) => tx.$queryRaw<{ limit: string | null }[]>`
        SELECT credit_limit::text AS limit FROM party WHERE id = ANY (${ids}::uuid[]) ORDER BY array_position(${ids}::uuid[], id)`,
    );
    expect(rows.map((row) => row.limit)).toEqual(['50000.00', '0.00', null]);
  });

  it.each([
    ['a negative credit limit', { creditLimit: '-0.01' }, /party_credit_limit_nonnegative/],
    ['an unknown kind', { kind: 'trust' }, /party_kind_known/],
    ['an unknown status', { status: 'merged' }, /party_status_known/],
    ['neither customer nor supplier', { isCustomer: false, isSupplier: false }, /party_customer_or_supplier/],
    ['pay terms above 365 days', { payTermDays: 366 }, /party_pay_term_days_range/],
    ['negative pay terms', { payTermDays: -1 }, /party_pay_term_days_range/],
    ['a code over 32 characters', { code: `C-${'9'.repeat(31)}` }, /party_code_length/],
  ] as const)('%s is refused', async (_name, fields, error) => {
    await expect(addParty(app, x, fields)).rejects.toThrow(error);
  });
});

describe('ADR 0019 test 9: the readable source matches the migration', () => {
  it('dal/sql/rls/party.sql appears, unchanged, in the party migration', () => {
    expect(sourceIsInMigration('sql/rls/party.sql', 'party')).toBe(true);
  });
});
