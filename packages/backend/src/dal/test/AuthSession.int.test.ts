import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { createOwnerDatabase, type OwnerDatabase } from './support/ownerDatabase.js';
import { createTree, newIds, setScope, type Tree } from './support/orgTree.js';
import {
  policies,
  rlsState,
  sourceIsInMigration,
  tablePrivileges,
  truncateRefusers,
} from './support/tableRules.js';

/**
 * Migration auth_session (ADR 0018 section 1, ADR 0050 section 6): sessions with forced RLS and a session path keyed
 * on the token hash, plus the email CHECK on app_user. Every row of the v2 dry run (#102) is a test here, with the
 * owner path for an owner that is neither superuser nor BYPASSRLS. Fixtures are written as the migration owner
 * inside the organization they set; every test uses fresh users and tokens.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 4, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 4, txTimeoutMs: 10_000 });
/** One connection, so a test can show that a key set in one transaction is gone in the next on the same one. */
const appOne: DbClient = createDbClient(appUrl, { poolMax: 1, txTimeoutMs: 10_000 });
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdHNhbHQ$dGVzdGhhc2g'; // not a real password's hash

type Tx = Parameters<Parameters<DbClient['$transaction']>[0]>[0];

let x: Tree;
let y: Tree;

/** A fresh token's SHA-256, as bytes and as the hex string the session key carries. */
function freshToken(): { hash: Buffer; hex: string } {
  const hash = createHash('sha256').update(randomBytes(32)).digest();
  return { hash, hex: hash.toString('hex') };
}

/** A fresh E.164 Bangladeshi mobile number. */
const freshPhone = () => `+88017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

/** Runs fn on `db` inside the tree's organization (and its business and branch). */
function inOrg<T>(db: DbClient, tree: Tree, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId]);
    return fn(tx);
  });
}

/** Runs fn on `db` with only app.session_key set, as the session middleware's lookup does. */
function withSessionKey<T>(db: DbClient, hex: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.session_key', ${hex}, true)`;
    return fn(tx);
  });
}

/** A user in the tree's organization, inserted by `db` inside that organization. */
async function addUser(
  tree: Tree,
  fields: { email?: string | null; phone?: string | null } = {},
  db: DbClient = owner,
): Promise<string> {
  return inOrg(db, tree, async (tx) => {
    const [id] = (await newIds(tx, 1)) as [string];
    const email = fields.email === undefined ? `s-${id}@example.com` : fields.email;
    await tx.$executeRaw`
      INSERT INTO app_user (id, organization_id, email, phone, password_hash, display_name)
      VALUES (${id}::uuid, ${tree.organizationId}::uuid, ${email}, ${fields.phone ?? null}, ${HASH}, 'Session User')`;
    return id;
  });
}

/** A session for `userId`, inserted by `db` inside `tree`'s organization. Returns its id and token. */
async function addSession(
  db: DbClient,
  tree: Tree,
  userId: string,
  times: { idle?: string; absolute?: string } = {},
): Promise<{ id: string; hex: string }> {
  const token = freshToken();
  const id = await inOrg(db, tree, async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO auth_session (token_hash, user_id, organization_id, idle_expires_at, absolute_expires_at, user_agent)
      VALUES (${token.hash}, ${userId}::uuid, ${tree.organizationId}::uuid,
              now() + ${times.idle ?? '8 hours'}::interval, now() + ${times.absolute ?? '7 days'}::interval, 'Vitest')
      RETURNING id::text`;
    if (!row) throw new Error('the insert returned no row');
    return row.id;
  });
  return { id, hex: token.hex };
}

const sessionIds = (tx: Tx) => tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM auth_session`;

beforeAll(async () => {
  x = await createTree(owner);
  y = await createTree(owner);
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect(), appOne.$disconnect()]);
});

describe('dry run: the table follows the tenant-table rules', () => {
  it('RLS is enabled and forced', async () => {
    expect(await rlsState(owner, 'auth_session')).toEqual([{ enabled: true, forced: true }]);
  });

  it('six policies, each naming its role: erp_app and the migration owner, SELECT, INSERT and UPDATE', async () => {
    const [{ me }] = (await owner.$queryRaw<{ me: string }[]>`SELECT current_user::text AS me`) as [
      { me: string },
    ];
    const rows = await policies(owner, 'auth_session');
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

  it('two foreign keys: the organization, and (user_id, organization_id) to app_user', async () => {
    const rows = await owner.$queryRaw<{ name: string; definition: string }[]>`
      SELECT conname AS name, pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid = 'auth_session'::regclass AND contype = 'f' ORDER BY conname`;
    expect(rows).toEqual([
      {
        name: 'auth_session_organization_id_fkey',
        definition:
          'FOREIGN KEY (organization_id) REFERENCES organization(id) ON UPDATE CASCADE ON DELETE RESTRICT',
      },
      {
        name: 'auth_session_user_id_organization_id_fkey',
        definition:
          'FOREIGN KEY (user_id, organization_id) REFERENCES app_user(id, organization_id) ON UPDATE CASCADE ON DELETE RESTRICT',
      },
    ]);
  });

  it('erp_app holds SELECT and INSERT, and UPDATE on last_seen_at, idle_expires_at and revoked_at only', async () => {
    expect(await tablePrivileges(owner, 'auth_session', 'erp_app')).toEqual(['INSERT', 'SELECT']);
    const columns = await owner.$queryRaw<{ column: string }[]>`
      SELECT column_name AS column FROM information_schema.column_privileges
      WHERE table_name = 'auth_session' AND grantee = 'erp_app' AND privilege_type = 'UPDATE'
      ORDER BY column_name`;
    expect(columns.map((row) => row.column)).toEqual(['idle_expires_at', 'last_seen_at', 'revoked_at']);
  });

  it('app_user has a unique index on (id, organization_id) for the composite foreign key', async () => {
    const rows = await owner.$queryRaw<{ definition: string }[]>`
      SELECT pg_get_indexdef(indexrelid) AS definition FROM pg_index
      WHERE indexrelid = 'app_user_id_organization_id_key'::regclass AND indisunique`;
    expect(rows).toEqual([
      {
        definition:
          'CREATE UNIQUE INDEX app_user_id_organization_id_key ON public.app_user USING btree (id, organization_id)',
      },
    ]);
  });

  it('a BEFORE TRUNCATE trigger refuses TRUNCATE for every role', async () => {
    expect(await truncateRefusers(owner, 'auth_session')).toEqual(['auth_session_no_truncate']);
  });

  it('dal/sql/rls/auth_session.sql appears, unchanged, in the auth_session migration', () => {
    expect(sourceIsInMigration('sql/rls/auth_session.sql', 'auth_session')).toBe(true);
  });
});

describe('dry run: the session path (app.session_key)', () => {
  it('with the right token key, erp_app sees exactly that session, before any organization is set', async () => {
    const user = await addUser(x);
    const session = await addSession(owner, x, user);
    await addSession(owner, x, user);
    const rows = await withSessionKey(
      app,
      session.hex,
      (tx) =>
        tx.$queryRaw<{ id: string; user: string; org: string }[]>`
        SELECT id::text, user_id::text AS user, organization_id::text AS org FROM auth_session`,
    );
    expect(rows).toEqual([{ id: session.id, user, org: x.organizationId }]);
  });

  it('with an unknown or a wrong token key, erp_app sees nothing', async () => {
    const user = await addUser(x);
    await addSession(owner, x, user);
    expect(await withSessionKey(app, freshToken().hex, sessionIds)).toEqual([]);
  });

  it('with a key and an organization both set, only the key row shows (the key path wins)', async () => {
    const user = await addUser(x);
    const session = await addSession(owner, x, user);
    await addSession(owner, x, user);
    const rows = await app.$transaction(async (tx) => {
      await setScope(tx, x.organizationId, [x.businessId], [x.branchId]);
      await tx.$queryRaw`SELECT set_config('app.session_key', ${session.hex}, true)`;
      return sessionIds(tx);
    });
    expect(rows).toEqual([{ id: session.id }]);
  });

  it('with the key, erp_app touches the session (last_seen_at, idle_expires_at)', async () => {
    const session = await addSession(owner, x, await addUser(x));
    const touched = await withSessionKey(
      app,
      session.hex,
      (tx) => tx.$executeRaw`
        UPDATE auth_session SET last_seen_at = now(), idle_expires_at = now() + interval '8 hours'
        WHERE id = ${session.id}::uuid`,
    );
    expect(touched).toBe(1);
  });

  it('with the key, erp_app revokes the session (logout)', async () => {
    const session = await addSession(owner, x, await addUser(x));
    const rows = await withSessionKey(
      app,
      session.hex,
      (tx) =>
        tx.$queryRaw<{ revoked: boolean }[]>`
        UPDATE auth_session SET revoked_at = now() WHERE id = ${session.id}::uuid
        RETURNING revoked_at IS NOT NULL AS revoked`,
    );
    expect(rows).toEqual([{ revoked: true }]);
  });

  it("with one session's key, erp_app cannot touch another session, even in the same organization", async () => {
    const user = await addUser(x);
    const mine = await addSession(owner, x, user);
    const other = await addSession(owner, x, user);
    const touched = await withSessionKey(
      app,
      mine.hex,
      (tx) => tx.$executeRaw`UPDATE auth_session SET revoked_at = now() WHERE id = ${other.id}::uuid`,
    );
    expect(touched).toBe(0);
  });

  it('the key does not reach the next transaction on the same pooled connection', async () => {
    const session = await addSession(owner, x, await addUser(x));
    expect(await withSessionKey(appOne, session.hex, sessionIds)).toEqual([{ id: session.id }]);
    await expect(appOne.$transaction((tx) => sessionIds(tx))).rejects.toThrow(/tenant scope not set/);
  });

  it('a key that is not hex is refused', async () => {
    await expect(withSessionKey(app, 'not-hex!', sessionIds)).rejects.toThrow(/invalid hexadecimal/);
  });

  it('with neither a key nor an organization, reading fails with "tenant scope not set"', async () => {
    await expect(app.$queryRaw`SELECT id FROM auth_session`).rejects.toThrow(/tenant scope not set/);
  });
});

describe('dry run: the organization path and isolation', () => {
  it("erp_app creates a session inside the found user's organization", async () => {
    const user = await addUser(x);
    const session = await addSession(app, x, user);
    expect(await inOrg(app, x, sessionIds)).toContainEqual({ id: session.id });
  });

  it("in organization X, erp_app sees and changes nothing of Y's sessions, even by id", async () => {
    const sessionY = await addSession(owner, y, await addUser(y));
    await inOrg(app, x, async (tx) => {
      expect(await tx.$queryRaw`SELECT id FROM auth_session WHERE id = ${sessionY.id}::uuid`).toEqual([]);
      expect(
        await tx.$executeRaw`UPDATE auth_session SET revoked_at = now() WHERE id = ${sessionY.id}::uuid`,
      ).toBe(0);
    });
  });

  it('erp_app cannot create a session in another organization than the one it set', async () => {
    const userY = await addUser(y);
    await expect(
      inOrg(
        app,
        x,
        (tx) => tx.$executeRaw`
          INSERT INTO auth_session (token_hash, user_id, organization_id, idle_expires_at, absolute_expires_at)
          VALUES (${freshToken().hash}, ${userY}::uuid, ${y.organizationId}::uuid, now() + interval '1 hour',
                  now() + interval '1 day')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('a session naming a user of another organization is refused (composite foreign key)', async () => {
    const userY = await addUser(y);
    await expect(addSession(owner, x, userY)).rejects.toThrow(/auth_session_user_id_organization_id_fkey/);
  });
});

describe('dry run: rights and constraints', () => {
  it('erp_app cannot DELETE or TRUNCATE', async () => {
    await expect(app.$executeRawUnsafe('DELETE FROM auth_session WHERE false')).rejects.toThrow(
      /permission denied/,
    );
    await expect(app.$executeRawUnsafe('TRUNCATE auth_session')).rejects.toThrow(/permission denied/);
  });

  it.each(['token_hash', 'user_id', 'organization_id', 'created_at', 'absolute_expires_at', 'user_agent'])(
    'erp_app cannot UPDATE %s (permission denied)',
    async (column) => {
      await expect(
        inOrg(app, x, (tx) =>
          tx.$executeRawUnsafe(`UPDATE auth_session SET ${column} = ${column} WHERE false`),
        ),
      ).rejects.toThrow(/permission denied/);
    },
  );

  it('TRUNCATE is refused for the superuser owner (trigger)', async () => {
    const attempt = owner.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('TRUNCATE auth_session');
      throw new Error('TRUNCATE ran: the trigger is missing (rolled back)');
    });
    await expect(attempt).rejects.toThrow(/TRUNCATE is refused on auth_session/);
  });

  it('a token hash that is not 32 bytes is refused', async () => {
    const user = await addUser(x);
    await expect(
      inOrg(
        owner,
        x,
        (tx) => tx.$executeRaw`
          INSERT INTO auth_session (token_hash, user_id, organization_id, idle_expires_at, absolute_expires_at)
          VALUES (${randomBytes(16)}, ${user}::uuid, ${x.organizationId}::uuid, now() + interval '1 hour',
                  now() + interval '1 day')`,
      ),
    ).rejects.toThrow(/auth_session_token_hash_length/);
  });

  it('an idle expiry after the absolute expiry is refused', async () => {
    const user = await addUser(x);
    await expect(addSession(owner, x, user, { idle: '2 days', absolute: '1 day' })).rejects.toThrow(
      /auth_session_expiry_order/,
    );
  });

  it('a token hash is unique', async () => {
    const user = await addUser(x);
    const token = freshToken();
    const insert = () =>
      inOrg(
        owner,
        x,
        (tx) => tx.$executeRaw`
          INSERT INTO auth_session (token_hash, user_id, organization_id, idle_expires_at, absolute_expires_at)
          VALUES (${token.hash}, ${user}::uuid, ${x.organizationId}::uuid, now() + interval '1 hour',
                  now() + interval '1 day')`,
      );
    await insert();
    await expect(insert()).rejects.toThrow(/auth_session_token_hash_key/);
  });
});

describe('the email CHECK on app_user (ADR 0050 section 6, Farhan #102)', () => {
  it.each(['no-at-sign.example.com', '@starts-with-at.example.com', '+8801712345678'])(
    'an email %j is refused',
    async (email) => {
      await expect(addUser(x, { email })).rejects.toThrow(/app_user_email_has_at/);
    },
  );

  it('an email with "@" after the first character is accepted', async () => {
    await expect(addUser(x, { email: `a-${randomBytes(4).toString('hex')}@example.com` })).resolves.toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it("a login key equal to one user's phone never matches another user's email", async () => {
    const phone = freshPhone();
    const withPhone = await addUser(x, { email: null, phone });
    // The other user can't store that phone as an email: the CHECK refuses it, in any organization.
    await expect(addUser(y, { email: phone })).rejects.toThrow(/app_user_email_has_at/);
    // Any email that is stored contains "@", which an E.164 phone never does, so the key finds exactly one row.
    await addUser(y, { email: `${phone}@example.com` });
    const found = await app.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.login_key', ${phone}, true)`;
      return tx.$queryRaw<{ id: string }[]>`SELECT id::text FROM app_user`;
    });
    expect(found).toEqual([{ id: withPhone }]);
  });
});

describe('the owner path, for an owner that is neither superuser nor BYPASSRLS', () => {
  let db: OwnerDatabase;
  let tree: Tree;
  let other: Tree;
  let user: string;
  let otherUser: string;

  beforeAll(async () => {
    db = await createOwnerDatabase(ownerUrl);
    tree = await createTree(db.client);
    other = await createTree(db.client);
    user = await addUser(tree, {}, db.client);
    otherUser = await addUser(other, {}, db.client);
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  }, 60_000);

  it('inserts and reads a session inside the organization it set, and sees no other organization', async () => {
    const mine = await addSession(db.client, tree, user);
    await addSession(db.client, other, otherUser);
    expect(await inOrg(db.client, tree, sessionIds)).toEqual([{ id: mine.id }]);
  });

  it('an insert into an organization outside the one it set is refused by its own policy', async () => {
    await expect(
      inOrg(
        db.client,
        tree,
        (tx) => tx.$executeRaw`
          INSERT INTO auth_session (token_hash, user_id, organization_id, idle_expires_at, absolute_expires_at)
          VALUES (${freshToken().hash}, ${otherUser}::uuid, ${other.organizationId}::uuid, now() + interval '1 hour',
                  now() + interval '1 day')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('the owner has no session path: with only a key set, reading fails with "tenant scope not set"', async () => {
    const session = await addSession(db.client, tree, user);
    await expect(withSessionKey(db.client, session.hex, sessionIds)).rejects.toThrow(/tenant scope not set/);
  });

  it('a DELETE removes 0 rows and the rows remain; a TRUNCATE is refused', async () => {
    const result = await inOrg(db.client, tree, async (tx) => ({
      deleted: await tx.$executeRawUnsafe('DELETE FROM auth_session'),
      left: (await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM auth_session`)[0]?.n,
    }));
    expect(result.deleted).toBe(0);
    expect(result.left).toBeGreaterThan(0);
    await expect(db.client.$executeRawUnsafe('TRUNCATE auth_session')).rejects.toThrow(
      /TRUNCATE is refused on auth_session/,
    );
  });
});
