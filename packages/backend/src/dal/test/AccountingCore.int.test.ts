import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { addBranch, createTree, setScope, type Tree } from './support/orgTree.js';
import {
  policies,
  rlsState,
  sourceIsInMigration,
  tablePrivileges,
  truncateRefusers,
} from './support/tableRules.js';

/**
 * Migration accounting_core (ADR 0013 part 1; .adlc/proposed-sql/accounting_core_proposed.sql with Munif's 23 and
 * 24 Nov decisions): account, account_role, journal, journal_line, tested in SQL. Ledger packet tests 1 to 8 and 10;
 * a line never names another business's account; one side per line; posts once with reversal_of; tenancy on every
 * table; and the two known gaps (period lock, the party check), recorded as tests. PostingService is 2b.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 4, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 4, txTimeoutMs: 15_000 });
const appSingle: DbClient = createDbClient(appUrl, { poolMax: 1, txTimeoutMs: 15_000 });

type Tx = Parameters<Parameters<DbClient['$transaction']>[0]>[0];
const TABLES = ['account', 'account_role', 'journal', 'journal_line'] as const;
type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

let x: Tree;
let y: Tree;
let branchB: string;
/** Accounts in X by name, and one in Y. */
const acc: Record<string, string> = {};
let cashY: string;

function inScope<T>(db: DbClient, tree: Tree, fn: (tx: Tx) => Promise<T>, branchIds = [tree.branchId]) {
  return db.$transaction(async (tx) => {
    await setScope(tx, tree.organizationId, [tree.businessId], branchIds);
    return fn(tx);
  });
}

async function addAccount(
  tree: Tree,
  type: AccountType,
  fields: { postable?: boolean; status?: string } = {},
) {
  return inScope(owner, tree, async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO account (business_id, code, name, type, is_postable, status)
      VALUES (${tree.businessId}::uuid, ${`A-${randomBytes(4).toString('hex')}`}, 'Test account', ${type},
              ${fields.postable ?? true}, ${fields.status ?? 'active'})
      RETURNING id::text`;
    if (!row) throw new Error('no account');
    return row.id;
  });
}

interface Line {
  account: string;
  debit?: string;
  credit?: string;
  partyId?: string | null;
}
interface JournalFields {
  branchId?: string;
  sourceType?: string;
  sourceId?: string;
  reversalOf?: string | null;
}

/** Inserts one journal and its lines in one transaction on `db`; the balance check runs at COMMIT. */
async function post(
  db: DbClient,
  tree: Tree,
  lines: Line[],
  fields: JournalFields = {},
  branchIds?: string[],
) {
  const branchId = fields.branchId ?? tree.branchId;
  return inScope(
    db,
    tree,
    async (tx) => {
      const [journal] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO journal (business_id, branch_id, number, journal_date, source_type, source_id, memo, reversal_of)
        VALUES (${tree.businessId}::uuid, ${branchId}::uuid, ${`JV-${randomBytes(5).toString('hex')}`}, CURRENT_DATE,
                ${fields.sourceType ?? 'test'}, ${fields.sourceId ?? randomUUID()}::uuid, 'Test journal',
                ${fields.reversalOf ?? null}::uuid)
        RETURNING id::text`;
      if (!journal) throw new Error('no journal');
      let lineNo = 0;
      for (const line of lines) {
        lineNo += 1;
        await tx.$executeRaw`
          INSERT INTO journal_line (business_id, journal_id, line_no, account_id, debit, credit, party_id)
          VALUES (${tree.businessId}::uuid, ${journal.id}::uuid, ${lineNo}, ${line.account}::uuid,
                  ${line.debit ?? '0'}::numeric, ${line.credit ?? '0'}::numeric, ${line.partyId ?? null}::uuid)`;
      }
      return journal.id;
    },
    branchIds ?? [tree.branchId, branchId],
  );
}

const balanced = (amount = '1000.00'): Line[] => [
  { account: acc.cash ?? '', debit: amount },
  { account: acc.revenue ?? '', credit: amount },
];
const mirror = (lines: Line[]): Line[] =>
  lines.map((l) => ({ account: l.account, debit: l.credit, credit: l.debit }));

async function mapRole(tree: Tree, role: string, accountId: string) {
  return inScope(
    owner,
    tree,
    (tx) => tx.$executeRaw`
    INSERT INTO account_role (business_id, role, account_id) VALUES (${tree.businessId}::uuid, ${role}, ${accountId}::uuid)`,
  );
}

beforeAll(async () => {
  [x, y] = await Promise.all([createTree(owner), createTree(owner)]);
  branchB = await addBranch(owner, x.organizationId, x.businessId, 'BRB');
  acc.cash = await addAccount(x, 'asset');
  acc.revenue = await addAccount(x, 'income');
  acc.liability = await addAccount(x, 'liability');
  cashY = await addAccount(y, 'asset');
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect(), appSingle.$disconnect()]);
});

describe('the four tables follow the tenant-table rules', () => {
  it.each(TABLES)(
    '%s: RLS enabled and forced; no DELETE or ALL policy; TRUNCATE refused by a trigger',
    async (t) => {
      expect(await rlsState(owner, t)).toEqual([{ enabled: true, forced: true }]);
      const rows = await policies(owner, t);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((p) => p.cmd !== 'DELETE' && p.cmd !== 'ALL')).toBe(true);
      expect(await truncateRefusers(owner, t)).toEqual([`${t}_no_truncate`]);
    },
  );

  it('erp_app holds SELECT and INSERT on all four (UPDATE only on chosen account and role columns)', async () => {
    for (const t of TABLES) expect(await tablePrivileges(owner, t, 'erp_app')).toEqual(['INSERT', 'SELECT']);
  });

  it('dal/sql/rls/accounting.sql and dal/sql/triggers/journal.sql appear, unchanged, in the accounting_core migration', () => {
    expect(sourceIsInMigration('sql/triggers/journal.sql', 'accounting_core')).toBe(true);
    expect(sourceIsInMigration('sql/rls/accounting.sql', 'accounting_core')).toBe(true);
  });
});

describe('packet tests 1 and 2: balanced at COMMIT', () => {
  it('a balanced two-line journal commits', async () => {
    await expect(post(owner, x, balanced())).resolves.toMatch(/^[0-9a-f-]{36}$/);
  });

  it('an unbalanced journal fails at COMMIT and nothing of it remains', async () => {
    const sourceId = randomUUID();
    await expect(
      post(
        owner,
        x,
        [
          { account: acc.cash ?? '', debit: '100.00' },
          { account: acc.revenue ?? '', credit: '99.99' },
        ],
        {
          sourceId,
        },
      ),
    ).rejects.toThrow(/unbalanced/i);
    const left = await inScope(
      owner,
      x,
      (tx) => tx.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM journal WHERE source_id = ${sourceId}::uuid`,
    );
    expect(left[0]?.n).toBe(0);
  });

  it('one line, or none, fails at COMMIT', async () => {
    await expect(post(owner, x, [{ account: acc.cash ?? '', debit: '5.00' }])).rejects.toThrow(
      /fewer than two/i,
    );
    await expect(post(owner, x, [])).rejects.toThrow(/fewer than two/i);
  });
});

describe('packet test 3 and the line CHECK (Munif, 24 Nov): exactly one side, no negatives', () => {
  it.each([
    ['both sides', { debit: '5.00', credit: '5.00' }],
    ['neither side', { debit: '0', credit: '0' }],
    ['a negative debit', { debit: '-5.00' }],
    ['a negative credit', { credit: '-5.00' }],
  ])('%s is refused', async (_name, sides) => {
    await expect(
      post(owner, x, [
        { account: acc.cash ?? '', ...sides },
        { account: acc.revenue ?? '', credit: '5.00' },
      ]),
    ).rejects.toThrow(/journal_line_one_side|check/i);
  });

  it('amounts are numeric(18,2)', async () => {
    const [col] = await owner.$queryRaw<{ numeric_precision: number; numeric_scale: number }[]>`
      SELECT numeric_precision, numeric_scale FROM information_schema.columns
       WHERE table_name = 'journal_line' AND column_name = 'debit'`;
    expect(col).toEqual({ numeric_precision: 18, numeric_scale: 2 });
  });
});

describe('packet test 4: posted is permanent', () => {
  it('erp_app cannot update or delete a journal or a line (no grant)', async () => {
    const id = await post(owner, x, balanced());
    await expect(
      inScope(app, x, (tx) => tx.$executeRaw`UPDATE journal SET memo = 'x' WHERE id = ${id}::uuid`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      inScope(app, x, (tx) => tx.$executeRaw`DELETE FROM journal_line WHERE journal_id = ${id}::uuid`),
    ).rejects.toThrow(/permission denied/i);
  });

  it('the owner cannot either: the trigger refuses for every role', async () => {
    const id = await post(owner, x, balanced());
    await expect(
      inScope(owner, x, (tx) => tx.$executeRaw`UPDATE journal SET memo = 'x' WHERE id = ${id}::uuid`),
    ).rejects.toThrow(/never updated or deleted/i);
    await expect(
      inScope(
        owner,
        x,
        (tx) => tx.$executeRaw`UPDATE journal_line SET debit = 1 WHERE journal_id = ${id}::uuid`,
      ),
    ).rejects.toThrow(/never updated or deleted/i);
    await expect(
      inScope(owner, x, (tx) => tx.$executeRaw`DELETE FROM journal WHERE id = ${id}::uuid`),
    ).rejects.toThrow(/never updated or deleted/i);
  });

  it.each(TABLES)('TRUNCATE %s is refused, even with CASCADE', async (t) => {
    await expect(owner.$executeRawUnsafe(`TRUNCATE ${t} CASCADE`)).rejects.toThrow(
      /refuse|not allowed|truncate/i,
    );
  });
});

describe('packet test 5 and REVIEW 2 (Munif, 24 Nov): posts once; reversals', () => {
  it('a second journal for the same source is refused (business, source_type, source_id)', async () => {
    const sourceId = randomUUID();
    await post(owner, x, balanced(), { sourceType: 'invoice', sourceId });
    await expect(post(owner, x, balanced(), { sourceType: 'invoice', sourceId })).rejects.toThrow(
      /unique|duplicate/i,
    );
  });

  it("a reversal is source_type 'reversal' with source_id = the original; a second reversal is refused", async () => {
    const lines = balanced('250.00');
    const original = await post(owner, x, lines, { sourceType: 'invoice' });
    await expect(
      post(owner, x, mirror(lines), { sourceType: 'reversal', sourceId: original, reversalOf: original }),
    ).resolves.toBeTruthy();
    await expect(
      post(owner, x, mirror(lines), { sourceType: 'reversal', sourceId: original, reversalOf: original }),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it('a reversal of a reversal is refused', async () => {
    const lines = balanced('40.00');
    const original = await post(owner, x, lines);
    const reversal = await post(owner, x, mirror(lines), {
      sourceType: 'reversal',
      sourceId: original,
      reversalOf: original,
    });
    await expect(
      post(owner, x, lines, { sourceType: 'reversal', sourceId: reversal, reversalOf: reversal }),
    ).rejects.toThrow(/reversal of a reversal/i);
  });

  it('a reversal must say so consistently: reversal_of set exactly when source_type is reversal, pointing at source_id', async () => {
    const original = await post(owner, x, balanced());
    await expect(post(owner, x, balanced(), { sourceType: 'invoice', reversalOf: original })).rejects.toThrow(
      /check/i,
    );
    await expect(post(owner, x, balanced(), { sourceType: 'reversal' })).rejects.toThrow(/check/i);
    await expect(
      post(owner, x, mirror(balanced()), {
        sourceType: 'reversal',
        sourceId: randomUUID(),
        reversalOf: original,
      }),
    ).rejects.toThrow(/check/i);
  });
});

describe('packet test 6: a reversal mirrors its original', () => {
  it('any difference from the mirror fails at COMMIT', async () => {
    const original = await post(owner, x, balanced('300.00'));
    await expect(
      post(owner, x, mirror(balanced('299.00')), {
        sourceType: 'reversal',
        sourceId: original,
        reversalOf: original,
      }),
    ).rejects.toThrow(/must mirror/i);
  });

  it("a reversal pointing at another business's journal is refused (visibility trigger, then composite key)", async () => {
    const yJournal = await post(owner, y, [
      { account: cashY, debit: '10.00' },
      { account: await addAccount(y, 'income'), credit: '10.00' },
    ]);
    // journal_no_reversal_of_reversal runs before the foreign key and refuses an original it can't see in scope;
    // the composite key (business_id, reversal_of) would refuse it next.
    await expect(
      post(owner, x, mirror(balanced('10.00')), {
        sourceType: 'reversal',
        sourceId: yJournal,
        reversalOf: yJournal,
      }),
    ).rejects.toThrow(/not visible in this scope|foreign key/i);
  });
});

describe('packet tests 7 and 8: roles and account types', () => {
  it('pass_through_payable and customer_advance map to a liability only (invariant 8)', async () => {
    const t = await createTree(owner);
    await expect(mapRole(t, 'pass_through_payable', await addAccount(t, 'income'))).rejects.toThrow(
      /liability/i,
    );
    await expect(mapRole(t, 'customer_advance', await addAccount(t, 'asset'))).rejects.toThrow(/liability/i);
    await expect(mapRole(t, 'pass_through_payable', await addAccount(t, 'liability'))).resolves.toBe(1);
  });

  it('roles are the 12 decided ones; any other is refused', async () => {
    const t = await createTree(owner);
    await expect(mapRole(t, 'cost_of_goods_sold', await addAccount(t, 'expense'))).resolves.toBe(1);
    await expect(mapRole(t, 'petty_cash', await addAccount(t, 'asset'))).rejects.toThrow(/check/i);
  });

  it("an account's type is fixed once a line or a role uses it, for every role; an unused one may change", async () => {
    const used = await addAccount(x, 'income');
    await post(owner, x, [
      { account: acc.cash ?? '', debit: '1.00' },
      { account: used, credit: '1.00' },
    ]);
    await expect(
      inScope(owner, x, (tx) => tx.$executeRaw`UPDATE account SET type = 'expense' WHERE id = ${used}::uuid`),
    ).rejects.toThrow(/type can.t change/i);
    const unused = await addAccount(x, 'income');
    await expect(
      inScope(
        owner,
        x,
        (tx) => tx.$executeRaw`UPDATE account SET type = 'expense' WHERE id = ${unused}::uuid`,
      ),
    ).resolves.toBe(1);
    await expect(
      inScope(app, x, (tx) => tx.$executeRaw`UPDATE account SET type = 'expense' WHERE id = ${unused}::uuid`),
    ).rejects.toThrow(/permission denied/i);
  });

  it('a line on a parent (not postable) or archived account is refused', async () => {
    const header = await addAccount(x, 'asset', { postable: false });
    const archived = await addAccount(x, 'asset', { status: 'archived' });
    await expect(
      post(owner, x, [
        { account: header, debit: '1.00' },
        { account: acc.revenue ?? '', credit: '1.00' },
      ]),
    ).rejects.toThrow(/not postable|archived/i);
    await expect(
      post(owner, x, [
        { account: archived, debit: '1.00' },
        { account: acc.revenue ?? '', credit: '1.00' },
      ]),
    ).rejects.toThrow(/not postable|archived/i);
  });
});

describe("packet test 10 and Munif's 24 Nov addition: tenancy on every table", () => {
  it("a line can't use another business's account (composite key)", async () => {
    await expect(
      post(owner, x, [
        { account: cashY, debit: '5.00' },
        { account: acc.revenue ?? '', credit: '5.00' },
      ]),
    ).rejects.toThrow(/foreign key/i);
  });

  it.each(TABLES)("in X, erp_app reads nothing of Y's %s rows, even by id", async (t) => {
    await post(owner, y, [
      { account: cashY, debit: '7.00' },
      { account: await addAccount(y, 'income'), credit: '7.00' },
    ]);
    await inScope(
      owner,
      y,
      (tx) => tx.$executeRaw`
      INSERT INTO account_role (business_id, role, account_id) VALUES (${y.businessId}::uuid, 'bank', ${cashY}::uuid)
      ON CONFLICT DO NOTHING`,
    );
    const ids = await inScope(owner, y, (tx) =>
      tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id::text FROM ${t} WHERE business_id = $1::uuid`,
        y.businessId,
      ),
    );
    expect(ids.length).toBeGreaterThan(0);
    const seen = await inScope(app, x, (tx) =>
      tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id::text FROM ${t} WHERE id = ANY($1::uuid[])`,
        ids.map((r) => r.id),
      ),
    );
    expect(seen).toEqual([]);
  });

  it("in X, erp_app can't write a journal or account into Y", async () => {
    await expect(
      inScope(
        app,
        x,
        (tx) => tx.$executeRaw`
        INSERT INTO account (business_id, code, name, type) VALUES (${y.businessId}::uuid, 'Y-1', 'Y', 'asset')`,
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      post(app, x, balanced(), { branchId: y.branchId }, [x.branchId, y.branchId]),
    ).rejects.toThrow(/foreign key|row-level security/i);
  });

  it("with only branch A in scope, erp_app sees neither branch B's journals nor their lines (REVIEW 1)", async () => {
    const id = await post(owner, x, balanced(), { branchId: branchB }, [x.branchId, branchB]);
    const journals = await inScope(
      app,
      x,
      (tx) => tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM journal WHERE id = ${id}::uuid`,
    );
    const lines = await inScope(
      app,
      x,
      (tx) => tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM journal_line WHERE journal_id = ${id}::uuid`,
    );
    expect([journals, lines]).toEqual([[], []]);
  });

  it('a pooled connection returns nothing until the tenant settings are set again', async () => {
    const id = await post(owner, x, balanced());
    const inside = await inScope(
      appSingle,
      x,
      (tx) => tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM journal WHERE id = ${id}::uuid`,
    );
    expect(inside).toHaveLength(1);
    await expect(
      appSingle.$transaction((tx) => tx.$queryRaw`SELECT id FROM journal WHERE id = ${id}::uuid`),
    ).rejects.toThrow(/tenant scope not set/);
  });
});

describe('known gaps (Munif, 23 and 24 Nov), recorded so they show in every run', () => {
  it.skip('GAP 1, invariant 9: a journal dated into a closed period is refused. Known gap: period lock comes with day close (A17)', () => {
    // Written when A17 adds the period table and the lock; until then no close-period action exists anywhere.
  });

  it.skip('GAP 2, decision 4: journal_line.party_id has no foreign key yet. The party table (A11) exists now; the composite FK (NOT VALID, then VALIDATE) and the PostingService party check come in party_keys (Munif)', () => {
    // Was a tripwire on to_regclass('public.party'); A11 tripped it. Replaced by the FK test in party_keys (Munif).
  });
});
