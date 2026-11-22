import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { createOwnerDatabase, type OwnerDatabase } from './support/ownerDatabase.js';
import { createTree, newIds, setScope, type Tree } from './support/orgTree.js';
import { policies, rlsState, sourceIsInMigration, tablePrivileges } from './support/tableRules.js';

/**
 * Migration idempotency_key (ADR 0011 section 2, ADR 0014 part 1): the table's rules, tested in SQL. ADR 0014's dal
 * tests 1 to 5 and ADR 0011's tests 6 and 7 at the database level; IdempotencyQuery comes with ADR 0014 part 2.
 * Fixtures are written as the migration owner inside the scope they set. Every test uses fresh ids and keys.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 4, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 4, txTimeoutMs: 15_000 });
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdHNhbHQ$dGVzdGhhc2g'; // not a real password's hash
const ROUTE = 'POST /v1/payments';

type Tx = Parameters<Parameters<DbClient['$transaction']>[0]>[0];

let x: Tree;
let y: Tree;
let userX: string;
let userY: string;

const freshKey = () => `k-${randomBytes(8).toString('hex')}`;
const requestHash = (text = randomBytes(8).toString('hex')) => createHash('sha256').update(text).digest();

/** A user in the tree's organization, inserted as the owner inside that organization. */
async function addUser(tree: Tree): Promise<string> {
  return owner.$transaction(async (tx) => {
    const [id] = (await newIds(tx, 1)) as [string];
    await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId]);
    await tx.$executeRaw`
      INSERT INTO app_user (id, organization_id, email, password_hash, display_name)
      VALUES (${id}::uuid, ${tree.organizationId}::uuid, ${`i-${id}@example.com`}, ${HASH}, 'Key User')`;
    return id;
  });
}

/** Runs fn in a transaction on `db`, inside the tree's business and branch, as a request would. */
function inScope<T>(db: DbClient, tree: Tree, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId]);
    return fn(tx);
  });
}

/** A pending claim (no response yet) for `key` in the tree's business. Returns the row id. */
async function claim(db: DbClient | Tx, tree: Tree, userId: string, key: string): Promise<string> {
  const [row] = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO idempotency_key (business_id, key, user_id, route, request_hash)
    VALUES (${tree.businessId}::uuid, ${key}, ${userId}::uuid, ${ROUTE}, ${requestHash()})
    RETURNING id::text`;
  if (!row) throw new Error('the claim returned no row');
  return row.id;
}

/** Stores the response on a pending row. Returns the number of rows changed. */
function complete(tx: Tx, id: string, status = 201): Promise<number> {
  return tx.$executeRaw`
    UPDATE idempotency_key
       SET status_code = ${status}, response_body = '{"id":"r1"}'::jsonb, response_headers = '{}'::jsonb
     WHERE id = ${id}::uuid`;
}

beforeAll(async () => {
  x = await createTree(owner);
  y = await createTree(owner);
  [userX, userY] = await Promise.all([addUser(x), addUser(y)]);
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

describe('the table follows the tenant-table rules', () => {
  it('RLS is enabled and forced', async () => {
    expect(await rlsState(owner, 'idempotency_key')).toEqual([{ enabled: true, forced: true }]);
  });

  it('every policy names its role (erp_app or the migration owner); there is no DELETE or ALL policy', async () => {
    const [{ me }] = (await owner.$queryRaw<{ me: string }[]>`SELECT current_user::text AS me`) as [
      { me: string },
    ];
    const rows = await policies(owner, 'idempotency_key');
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

  it('erp_app holds SELECT and INSERT on the table, and UPDATE only on the three response columns', async () => {
    expect(await tablePrivileges(owner, 'idempotency_key', 'erp_app')).toEqual(['INSERT', 'SELECT']);
    const columns = await owner.$queryRaw<{ column: string }[]>`
      SELECT column_name AS column FROM information_schema.column_privileges
      WHERE table_name = 'idempotency_key' AND grantee = 'erp_app' AND privilege_type = 'UPDATE'
      ORDER BY column_name`;
    expect(columns.map((row) => row.column)).toEqual(['response_body', 'response_headers', 'status_code']);
  });

  it('dal/sql/rls/idempotency_key.sql appears, unchanged, in the idempotency_key migration', () => {
    expect(sourceIsInMigration('sql/rls/idempotency_key.sql', 'idempotency_key')).toBe(true);
  });
});

describe('ADR 0014 tests 1 and 2: a claim waits for the first one', () => {
  /** Holds a claim open in one transaction while a second claim of the same key runs in another. */
  async function race(firstCommits: boolean): Promise<{ waited: boolean; secondInserted: number }> {
    const key = freshKey();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let claimed!: () => void;
    const firstClaimed = new Promise<void>((resolve) => (claimed = resolve));
    const first = inScope(app, x, async (tx) => {
      await claim(tx, x, userX, key);
      claimed();
      await held;
      if (!firstCommits) throw new Error('rolled back on purpose');
    }).catch((error: unknown) => {
      if (firstCommits) throw error;
    });
    await firstClaimed;
    let settled = false;
    const second = inScope(
      app,
      x,
      (tx) =>
        tx.$executeRaw`
        INSERT INTO idempotency_key (business_id, key, user_id, route, request_hash)
        VALUES (${x.businessId}::uuid, ${key}, ${userX}::uuid, ${ROUTE}, ${requestHash()})
        ON CONFLICT (business_id, key) DO NOTHING`,
    ).finally(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 500));
    const waited = !settled;
    release();
    await first;
    return { waited, secondInserted: await second };
  }

  it('1. the second claim waits, then inserts nothing once the first commits', async () => {
    expect(await race(true)).toEqual({ waited: true, secondInserted: 0 });
  });

  it('2. if the first rolls back, the waiting claim succeeds as a new claim', async () => {
    expect(await race(false)).toEqual({ waited: true, secondInserted: 1 });
  });
});

describe('ADR 0014 test 3, ADR 0011 test 7: a stored answer never changes', () => {
  it('erp_app stores status, body and headers once on a pending claim', async () => {
    await inScope(app, x, async (tx) => {
      const row = await claim(tx, x, userX, freshKey());
      expect(await complete(tx, row)).toBe(1);
      const stored = await tx.$queryRaw<{ status: number; body: unknown; headers: unknown }[]>`
        SELECT status_code AS status, response_body AS body, response_headers AS headers
        FROM idempotency_key WHERE id = ${row}::uuid`;
      expect(stored).toEqual([{ status: 201, body: { id: 'r1' }, headers: {} }]);
    });
  });

  it('a second complete is refused by the trigger', async () => {
    const id = await inScope(app, x, async (tx) => {
      const row = await claim(tx, x, userX, freshKey());
      await complete(tx, row);
      return row;
    });
    await expect(inScope(app, x, (tx) => complete(tx, id, 200))).rejects.toThrow(
      /a stored response never changes/,
    );
  });

  it('the owner cannot change a stored answer either (the trigger holds for every role)', async () => {
    const id = await inScope(app, x, async (tx) => {
      const row = await claim(tx, x, userX, freshKey());
      await complete(tx, row);
      return row;
    });
    await expect(
      inScope(
        owner,
        x,
        (tx) => tx.$executeRaw`UPDATE idempotency_key SET status_code = 500 WHERE id = ${id}::uuid`,
      ),
    ).rejects.toThrow(/a stored response never changes/);
  });

  it('on a pending claim, only the response may change, for the owner too', async () => {
    const row = await inScope(app, x, (tx) => claim(tx, x, userX, freshKey()));
    for (const change of [
      `route = 'POST /v1/other'`,
      `key = 'other-key'`,
      `user_id = '${userY}'::uuid`,
      `request_hash = '\\x${'00'.repeat(32)}'::bytea`,
    ]) {
      await expect(
        inScope(owner, x, (tx) =>
          tx.$executeRawUnsafe(`UPDATE idempotency_key SET ${change} WHERE id = '${row}'::uuid`),
        ),
        change,
      ).rejects.toThrow(/only the response is stored after the claim/);
    }
  });
});

describe('ADR 0014 test 4, ADR 0011 test 7: erp_app grants', () => {
  it('erp_app cannot DELETE or TRUNCATE', async () => {
    await expect(app.$executeRawUnsafe('DELETE FROM idempotency_key WHERE false')).rejects.toThrow(
      /permission denied/,
    );
    await expect(app.$executeRawUnsafe('TRUNCATE idempotency_key')).rejects.toThrow(/permission denied/);
  });

  it.each(['business_id', 'key', 'user_id', 'route', 'request_hash', 'created_at'])(
    'erp_app cannot UPDATE %s (column grant)',
    async (column) => {
      await expect(
        inScope(app, x, (tx) =>
          tx.$executeRawUnsafe(`UPDATE idempotency_key SET ${column} = ${column} WHERE false`),
        ),
      ).rejects.toThrow(/permission denied/);
    },
  );
});

describe('TRUNCATE is refused for every role', () => {
  it('the superuser owner: refused by the trigger', async () => {
    const attempt = owner.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('TRUNCATE idempotency_key');
      throw new Error('TRUNCATE ran: the trigger is missing (rolled back)');
    });
    await expect(attempt).rejects.toThrow(/TRUNCATE is refused on idempotency_key/);
  });
});

describe('ADR 0014 test 5, ADR 0011 test 6: tenant isolation', () => {
  it('in X, erp_app sees and changes nothing of Y, even by id, and cannot write into Y', async () => {
    const rowY = await inScope(owner, y, (tx) => claim(tx, y, userY, freshKey()));
    await inScope(app, x, async (tx) => {
      expect(await tx.$queryRaw`SELECT id FROM idempotency_key WHERE id = ${rowY}::uuid`).toEqual([]);
      expect(
        await tx.$queryRaw`SELECT id FROM idempotency_key WHERE business_id = ${y.businessId}::uuid`,
      ).toEqual([]);
      expect(await complete(tx, rowY)).toBe(0);
    });
    await expect(inScope(app, x, (tx) => claim(tx, y, userX, freshKey()))).rejects.toThrow(
      /row-level security/,
    );
  });

  it('the same key in X and in Y are two independent rows', async () => {
    const key = freshKey();
    const inX = await inScope(app, x, (tx) => claim(tx, x, userX, key));
    const inY = await inScope(app, y, (tx) => claim(tx, y, userY, key));
    expect(inX).not.toBe(inY);
  });

  it('the same key twice in one business is refused (unique per business)', async () => {
    const key = freshKey();
    await inScope(app, x, (tx) => claim(tx, x, userX, key));
    await expect(inScope(app, x, (tx) => claim(tx, x, userX, key))).rejects.toThrow(/unique|duplicate/i);
  });

  it('with no tenant scope set, reading fails with "tenant scope not set"', async () => {
    await expect(app.$queryRaw`SELECT id FROM idempotency_key`).rejects.toThrow(/tenant scope not set/);
  });
});

describe('constraints', () => {
  const insertWith = (fields: { key?: string; hash?: Buffer; userId?: string; businessId?: string }) =>
    inScope(
      owner,
      x,
      (tx) =>
        tx.$executeRaw`
        INSERT INTO idempotency_key (business_id, key, user_id, route, request_hash)
        VALUES (${fields.businessId ?? x.businessId}::uuid, ${fields.key ?? freshKey()},
                ${fields.userId ?? userX}::uuid, ${ROUTE}, ${fields.hash ?? requestHash()})`,
    );

  it.each(['', 'has space', 'é-accent', 'x'.repeat(256)])('a key %j is refused', async (key) => {
    await expect(insertWith({ key })).rejects.toThrow(/idempotency_key_format/);
  });

  it('a 255-character key of visible ASCII is accepted', async () => {
    await expect(insertWith({ key: `${randomBytes(4).toString('hex')}${'~'.repeat(247)}` })).resolves.toBe(1);
  });

  it('a request hash that is not 32 bytes is refused', async () => {
    await expect(insertWith({ hash: randomBytes(31) })).rejects.toThrow(/idempotency_key_hash_length/);
  });

  it('status, body and headers are stored together or not at all', async () => {
    const row = await inScope(owner, x, (tx) => claim(tx, x, userX, freshKey()));
    await expect(
      inScope(
        owner,
        x,
        (tx) => tx.$executeRaw`UPDATE idempotency_key SET status_code = 201 WHERE id = ${row}::uuid`,
      ),
    ).rejects.toThrow(/idempotency_key_completed_together/);
  });

  it('headers must be a JSON object', async () => {
    const row = await inScope(owner, x, (tx) => claim(tx, x, userX, freshKey()));
    await expect(
      inScope(
        owner,
        x,
        (tx) => tx.$executeRaw`
          UPDATE idempotency_key SET status_code = 201, response_body = '{}'::jsonb, response_headers = '[]'::jsonb
          WHERE id = ${row}::uuid`,
      ),
    ).rejects.toThrow(/idempotency_key_headers_object/);
  });

  it('an unknown user or business is refused by the foreign keys', async () => {
    const [unknown] = (await newIds(owner, 1)) as [string];
    await expect(insertWith({ userId: unknown })).rejects.toThrow(/idempotency_key_user_id_fkey/);
    await expect(insertWith({ businessId: unknown })).rejects.toThrow(/row-level security|business_id_fkey/);
  });

  it('a user with a key cannot be deleted (ON DELETE RESTRICT)', async () => {
    const userId = await addUser(x);
    await inScope(owner, x, (tx) => claim(tx, x, userId, freshKey()));
    const attempt = owner.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM app_user WHERE id = ${userId}::uuid`;
      throw new Error('the user was deleted: the foreign key is missing (rolled back)');
    });
    await expect(attempt).rejects.toThrow(/idempotency_key_user_id_fkey/);
  });
});

describe('the owner path, for an owner that is neither superuser nor BYPASSRLS', () => {
  let db: OwnerDatabase;
  let tree: Tree;
  let other: Tree;
  let user: string;

  beforeAll(async () => {
    db = await createOwnerDatabase(ownerUrl);
    tree = await createTree(db.client);
    other = await createTree(db.client);
    user = await db.client.$transaction(async (tx) => {
      const [id] = (await newIds(tx, 1)) as [string];
      await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId]);
      await tx.$executeRaw`
        INSERT INTO app_user (id, organization_id, email, password_hash, display_name)
        VALUES (${id}::uuid, ${tree.organizationId}::uuid, ${`o-${id}@example.com`}, ${HASH}, 'Owner User')`;
      return id;
    });
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  }, 60_000);

  it('inserts and reads a claim inside the business it set, and sees no other business', async () => {
    const mine = await inScope(db.client, tree, (tx) => claim(tx, tree, user, freshKey()));
    const seen = await inScope(
      db.client,
      tree,
      (tx) => tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM idempotency_key`,
    );
    expect(seen).toEqual([{ id: mine }]);
  });

  it('an insert into a business outside the scope it set is refused by its own policy', async () => {
    await expect(inScope(db.client, tree, (tx) => claim(tx, other, user, freshKey()))).rejects.toThrow(
      /row-level security/,
    );
  });

  it('with no app.* values set, reading fails with "tenant scope not set"', async () => {
    await expect(db.client.$queryRaw`SELECT id FROM idempotency_key`).rejects.toThrow(/tenant scope not set/);
  });

  it('a DELETE removes 0 rows (no owner DELETE policy) and a TRUNCATE is refused', async () => {
    await inScope(db.client, tree, (tx) => claim(tx, tree, user, freshKey()));
    const deleted = await inScope(db.client, tree, (tx) =>
      tx.$executeRawUnsafe('DELETE FROM idempotency_key'),
    );
    expect(deleted).toBe(0);
    await expect(db.client.$executeRawUnsafe('TRUNCATE idempotency_key')).rejects.toThrow(
      /TRUNCATE is refused on idempotency_key/,
    );
  });
});
