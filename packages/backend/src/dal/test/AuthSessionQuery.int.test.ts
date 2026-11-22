import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { AuthQuery } from '../query/AuthQuery.js';
import { createTree, newIds, setScope, type Tree } from './support/orgTree.js';

/**
 * ADR 0018 part 1, the database half: AuthQuery's session methods as erp_app, through the session path
 * (app.session_key) and the organization path (ADR 0050 section 6). Tests 1 (the hash, not the token, is stored),
 * 6 (revoke), 7 (expiry; activity moves idle, never absolute) and 8 (revoke every session of a user).
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const owner: DbClient = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 10_000 });
const app: DbClient = createDbClient(appUrl, { poolMax: 1, txTimeoutMs: 10_000 });
const auth = new AuthQuery(app);
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$dGVzdHNhbHQ$dGVzdGhhc2g'; // not a real password's hash
/** A whole second an hour from now: created_at (the database clock) must not be after any expiry (CHECK). */
const NOW = new Date(Math.floor(Date.now() / 1000) * 1000 + 3_600_000);
const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

let x: Tree;
let y: Tree;

beforeAll(async () => {
  x = await createTree(owner);
  y = await createTree(owner);
});

afterAll(async () => {
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

async function addUser(tree: Tree): Promise<{ id: string; organizationId: string }> {
  const [id] = (await newIds(owner, 1)) as [string];
  await owner.$transaction(async (tx) => {
    await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId]);
    await tx.$executeRaw`
      INSERT INTO app_user (id, organization_id, email, password_hash, display_name)
      VALUES (${id}::uuid, ${tree.organizationId}::uuid, ${`sq-${id}@example.com`}, ${HASH}, 'Session Query')`;
  });
  return { id, organizationId: tree.organizationId };
}

/** A new token and its hash; the Query only ever sees the hash. */
function newToken(): { token: string; hash: Buffer } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: createHash('sha256').update(token).digest() };
}

async function newSession(
  user: { id: string; organizationId: string },
  idle = hours(8),
  absolute = hours(168),
) {
  const { token, hash } = newToken();
  const id = await auth.createSession({
    userId: user.id,
    organizationId: user.organizationId,
    tokenHash: hash,
    idleExpiresAt: idle,
    absoluteExpiresAt: absolute,
    userAgent: 'Vitest',
  });
  return { id, token, hash };
}

/** Reads a session row as the owner (outside erp_app's rules), for assertions only. */
async function stored(tree: Tree, id: string) {
  const rows = await owner.$transaction(async (tx) => {
    await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId]);
    return tx.$queryRaw<
      { hash: string; idle: Date; absolute: Date; revoked: Date | null; agent: string | null }[]
    >`
      SELECT encode(token_hash, 'hex') AS hash, idle_expires_at AS idle, absolute_expires_at AS absolute,
             revoked_at AS revoked, user_agent AS agent
      FROM auth_session WHERE id = ${id}::uuid`;
  });
  return rows[0];
}

describe('createSession and findActiveSession', () => {
  it('1. stores the SHA-256 of the token, never the token', async () => {
    const user = await addUser(x);
    const session = await newSession(user);
    const row = await stored(x, session.id);
    expect(row?.hash).toBe(session.hash.toString('hex'));
    expect(JSON.stringify(row)).not.toContain(session.token);
    expect(row?.agent).toBe('Vitest');
  });

  it('finds an active session by its token hash, with its user and organization', async () => {
    const user = await addUser(x);
    const session = await newSession(user);
    expect(await auth.findActiveSession(session.hash, NOW)).toEqual({
      sessionId: session.id,
      userId: user.id,
      organizationId: x.organizationId,
      lastSeenAt: expect.any(Date),
      idleExpiresAt: hours(8),
      absoluteExpiresAt: hours(168),
    });
  });

  it('an unknown token hash finds nothing', async () => {
    expect(await auth.findActiveSession(newToken().hash, NOW)).toBeNull();
  });

  it('7. a session past its idle expiry, or past its absolute expiry, is not active', async () => {
    const user = await addUser(x);
    const idle = await newSession(user, hours(1), hours(168));
    expect(await auth.findActiveSession(idle.hash, hours(1))).toBeNull();
    const absolute = await newSession(user, hours(8), hours(9));
    expect(await auth.findActiveSession(absolute.hash, hours(9))).toBeNull();
    expect(await auth.findActiveSession(absolute.hash, hours(2))).not.toBeNull();
  });

  it('a session whose user is deactivated is not active', async () => {
    const user = await addUser(x);
    const session = await newSession(user);
    await owner.$transaction(async (tx) => {
      await setScope(tx, x.organizationId, [x.businessId], [x.branchId]);
      await tx.$executeRaw`UPDATE app_user SET is_active = false WHERE id = ${user.id}::uuid`;
    });
    expect(await auth.findActiveSession(session.hash, NOW)).toBeNull();
  });

  it('a session cannot be created in another organization than its user', async () => {
    const userY = await addUser(y);
    await expect(
      auth.createSession({
        userId: userY.id,
        organizationId: x.organizationId,
        tokenHash: newToken().hash,
        idleExpiresAt: hours(8),
        absoluteExpiresAt: hours(168),
        userAgent: null,
      }),
    ).rejects.toThrow(/auth_session_user_id_organization_id_fkey/);
  });

  it('the session key does not outlive the lookup: the next transaction on the connection reads nothing', async () => {
    const session = await newSession(await addUser(x));
    expect(await auth.findActiveSession(session.hash, NOW)).not.toBeNull();
    await expect(app.$queryRaw`SELECT id FROM auth_session`).rejects.toThrow(/tenant scope not set/);
  });
});

describe('touchSession (7: activity moves idle, never absolute)', () => {
  it('moves last_seen_at and idle_expires_at, and leaves absolute_expires_at alone', async () => {
    const session = await newSession(await addUser(x), hours(8), hours(168));
    await auth.touchSession(session.hash, hours(6), hours(14));
    const row = await stored(x, session.id);
    expect(row?.idle).toEqual(hours(14));
    expect(row?.absolute).toEqual(hours(168));
    expect((await auth.findActiveSession(session.hash, hours(10)))?.lastSeenAt).toEqual(hours(6));
  });

  it('does not touch a revoked session', async () => {
    const session = await newSession(await addUser(x));
    await auth.revokeSession(session.hash, NOW);
    await auth.touchSession(session.hash, hours(1), hours(9));
    expect((await stored(x, session.id))?.idle).toEqual(hours(8));
  });
});

describe('revoking (6 and 8)', () => {
  it('6. revokeSession ends one session; a second revoke reports false', async () => {
    const user = await addUser(x);
    const session = await newSession(user);
    const other = await newSession(user);
    expect(await auth.revokeSession(session.hash, NOW)).toBe(true);
    expect(await auth.findActiveSession(session.hash, NOW)).toBeNull();
    expect(await auth.findActiveSession(other.hash, NOW)).not.toBeNull();
    expect(await auth.revokeSession(session.hash, NOW)).toBe(false);
  });

  it("8. revokeAllSessions ends every session of that user, and nobody else's", async () => {
    const user = await addUser(x);
    const otherUser = await addUser(x);
    const [a, b] = [await newSession(user), await newSession(user)];
    const kept = await newSession(otherUser);
    expect(await auth.revokeAllSessions(user, NOW)).toBe(2);
    expect(await auth.findActiveSession(a.hash, NOW)).toBeNull();
    expect(await auth.findActiveSession(b.hash, NOW)).toBeNull();
    expect(await auth.findActiveSession(kept.hash, NOW)).not.toBeNull();
  });

  it("8. revokeAllSessions in X's organization cannot reach a user of Y", async () => {
    const userY = await addUser(y);
    const sessionY = await newSession(userY);
    expect(await auth.revokeAllSessions({ id: userY.id, organizationId: x.organizationId }, NOW)).toBe(0);
    expect(await auth.findActiveSession(sessionY.hash, NOW)).not.toBeNull();
  });
});
