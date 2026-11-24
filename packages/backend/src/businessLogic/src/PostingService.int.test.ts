import { randomBytes, randomUUID } from 'node:crypto';
import { AppError, type TenantScope } from '@erp/shared';
import { createDbClient } from '@erp/dal';
import { afterAll, describe, expect, it } from 'vitest';
import { ACCOUNT_ROLES, type AccountRole, type JournalDraft } from './contracts/provided/IPostingService.js';
import { createManagers, DenyAllRoleSource } from './index.js';
import { draft, postingContract } from './test/postingContract.js';

/**
 * PostingService against real Postgres (ADR 0013 part 2, item 2b), through the service createManagers builds: the
 * ADR 0012 posting contract (the suite FakePostingService passes too), then what only a database shows: lines on
 * the mapped accounts, the journal number from the series, a reversal that nets to zero, two parallel reversals
 * (one wins, the other 409, not 500), no reversal of a reversal, and another business's journal not found.
 * Every case runs in its own fresh business with its own chart, so cases never share journals.
 */
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
if (!appUrl || !ownerUrl)
  throw new Error('DATABASE_URL and MIGRATION_DATABASE_URL must be set (see .env.example).');

const { provided, tenantScope, close } = createManagers({
  databaseUrl: appUrl,
  version: 'test',
  dbPoolMax: 6,
  dbTxTimeoutMs: 15_000,
  roleSource: new DenyAllRoleSource(),
});
const owner = createDbClient(ownerUrl, { poolMax: 2, txTimeoutMs: 10_000 });

type Tx = Parameters<Parameters<typeof owner.$transaction>[0]>[0];

interface World {
  scope: TenantScope;
  businessId: string;
  branchId: string;
  /** The account each mapped role points at. */
  accounts: Map<AccountRole, string>;
}

const TYPE_OF: Record<AccountRole, string> = {
  cash: 'asset',
  bank: 'asset',
  mobile_money: 'asset',
  card_clearing: 'asset',
  receivable: 'asset',
  inventory: 'asset',
  customer_advance: 'liability',
  pass_through_payable: 'liability',
  vat_output_payable: 'liability',
  sales_revenue: 'income',
  service_revenue: 'income',
  cost_of_goods_sold: 'expense',
};

async function asOwner<T>(
  world: Pick<World, 'scope' | 'businessId' | 'branchId'>,
  fn: (tx: Tx) => Promise<T>,
) {
  return owner.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT set_config('app.organization_id', ${world.scope.organizationId}, true),
             set_config('app.business_ids', ${world.businessId}, true),
             set_config('app.branch_ids', ${world.branchId}, true)`;
    return fn(tx);
  });
}

/**
 * A fresh organization, business and branch, as the owner, with one account per role (all 12 unless some are left
 * unmapped) and a journal number series for the branch.
 */
async function newWorld(options: { unmappedRoles?: AccountRole[]; series?: boolean } = {}): Promise<World> {
  const [org, legal, businessId, branchId] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const scope = { organizationId: org, businessIds: [businessId], branchIds: [branchId], branchId };
  const world: World = { scope, businessId, branchId, accounts: new Map() };
  await asOwner(world, async (tx) => {
    await tx.$executeRaw`INSERT INTO organization (id, name) VALUES (${org}::uuid, 'Posting Test Org')`;
    await tx.$executeRaw`INSERT INTO legal_entity (id, organization_id, name)
      VALUES (${legal}::uuid, ${org}::uuid, 'Posting Test Legal')`;
    await tx.$executeRaw`INSERT INTO business (id, organization_id, legal_entity_id, name)
      VALUES (${businessId}::uuid, ${org}::uuid, ${legal}::uuid, 'Posting Test Business')`;
    await tx.$executeRaw`INSERT INTO branch (id, business_id, name, short_code)
      VALUES (${branchId}::uuid, ${businessId}::uuid, 'Posting Test Branch', 'PTB')`;
    if (options.series !== false) {
      await tx.$executeRaw`INSERT INTO number_series (business_id, branch_id, kind, prefix)
        VALUES (${businessId}::uuid, ${branchId}::uuid, 'journal', 'JV-PTB-')`;
    }
    const unmapped = new Set(options.unmappedRoles ?? []);
    for (const role of ACCOUNT_ROLES) {
      const [account] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO account (business_id, code, name, type)
        VALUES (${businessId}::uuid, ${`A-${randomBytes(4).toString('hex')}`}, ${`Account for ${role}`},
                ${TYPE_OF[role]})
        RETURNING id::text`;
      if (!account) throw new Error('no account');
      world.accounts.set(role, account.id);
      if (!unmapped.has(role)) {
        await tx.$executeRaw`INSERT INTO account_role (business_id, role, account_id)
          VALUES (${businessId}::uuid, ${role}, ${account.id}::uuid)`;
      }
    }
  });
  return world;
}

const inScope = <T>(world: World, fn: () => Promise<T>) => tenantScope.run(world.scope, fn);

async function journalCount(world: World): Promise<number> {
  const [row] = await asOwner(
    world,
    (tx) =>
      tx.$queryRaw<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM journal WHERE business_id = ${world.businessId}::uuid`,
  );
  return row?.n ?? 0;
}

async function linesOf(world: World, journalId: string) {
  return asOwner(
    world,
    (tx) => tx.$queryRaw<{ account_id: string; debit: string; credit: string }[]>`
      SELECT account_id::text, debit::text, credit::text FROM journal_line
       WHERE journal_id = ${journalId}::uuid ORDER BY line_no`,
  );
}

async function refusal(promise: Promise<unknown>): Promise<{ code: string; field: string | undefined }> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return { code: (error as AppError).code, field: (error as AppError).fields[0]?.code };
}

/** A draft for this world: the suite's sample with a fresh uuid source and the world's branch. */
const sample = (world: World, fields: Partial<JournalDraft> = {}): JournalDraft =>
  draft({ branchId: world.branchId, source: { type: 'sales_payment', id: randomUUID() }, ...fields });

afterAll(async () => {
  await Promise.all([close(), owner.$disconnect()]);
});

/*
 * The ADR 0012 contract suite, unchanged. Its fixed branch id and text source ids ("src-1") are mapped to a fresh
 * world's branch and to uuids; the same text id always maps to the same uuid, so "posted twice" stays a repeat.
 */
const CONTRACT_BRANCH = '01937000-0000-7000-8000-0000000000e0';

postingContract('PostingService (real Postgres)', async (options) => {
  const world = await newWorld(options ?? {});
  const sources = new Map<string, string>();
  const uuidFor = (id: string) => {
    const known = sources.get(id) ?? randomUUID();
    sources.set(id, known);
    return known;
  };
  return {
    service: {
      post: (d) =>
        inScope(world, () =>
          provided.posting.post({
            ...d,
            branchId: d.branchId === CONTRACT_BRANCH ? world.branchId : d.branchId,
            source: { type: d.source.type, id: uuidFor(d.source.id) },
          }),
        ),
      reverse: (journalId, reason) => inScope(world, () => provided.posting.reverse(journalId, reason)),
    },
    journalCount: () => journalCount(world),
  };
});

describe('PostingService writes what the draft says', () => {
  it('lines land on the mapped accounts with exact amounts, numbered from the journal series', async () => {
    const world = await newWorld();
    const posted = await inScope(world, () => provided.posting.post(sample(world)));
    expect(posted.number).toBe('JV-PTB-000001');
    expect(await linesOf(world, posted.journalId)).toEqual([
      { account_id: world.accounts.get('cash'), debit: '12500.00', credit: '0.00' },
      { account_id: world.accounts.get('receivable'), debit: '0.00', credit: '12500.00' },
    ]);
    const next = await inScope(world, () => provided.posting.post(sample(world)));
    expect(next.number).toBe('JV-PTB-000002');
  });

  it('all 12 decided roles post (the database CHECK and ACCOUNT_ROLES agree)', async () => {
    const world = await newWorld();
    expect([...ACCOUNT_ROLES].sort()).toEqual(
      [
        'bank',
        'card_clearing',
        'cash',
        'cost_of_goods_sold',
        'customer_advance',
        'inventory',
        'mobile_money',
        'pass_through_payable',
        'receivable',
        'sales_revenue',
        'service_revenue',
        'vat_output_payable',
      ].sort(),
    );
    const lines = ACCOUNT_ROLES.flatMap((role) => [
      { role, debit: '1.00', credit: '0.00' },
      { role, debit: '0.00', credit: '1.00' },
    ]);
    const posted = await inScope(world, () => provided.posting.post(sample(world, { lines })));
    expect(await linesOf(world, posted.journalId)).toHaveLength(24);
  });

  it('no journal number series for the branch is a clear 409, nothing written', async () => {
    const world = await newWorld({ series: false });
    expect(await refusal(inScope(world, () => provided.posting.post(sample(world))))).toEqual({
      code: 'CONFLICT',
      field: 'number_series.missing',
    });
    expect(await journalCount(world)).toBe(0);
  });

  it('an unmapped role names the role in its message (answer 3)', async () => {
    const world = await newWorld({ unmappedRoles: ['mobile_money'] });
    const lines = [
      { role: 'mobile_money' as const, debit: '500.00', credit: '0.00' },
      { role: 'receivable' as const, debit: '0.00', credit: '500.00' },
    ];
    const error = await inScope(world, () => provided.posting.post(sample(world, { lines }))).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).fields[0]).toMatchObject({ code: 'journal.role_unmapped' });
    expect((error as AppError).message).toMatch(/mobile_money/);
  });

  it('a date that is not YYYY-MM-DD is a consumer bug (500), nothing written', async () => {
    const world = await newWorld();
    expect(
      await refusal(inScope(world, () => provided.posting.post(sample(world, { date: '22/11/2026' })))),
    ).toEqual({ code: 'INTERNAL_ERROR', field: 'journal.bad_date' });
    expect(await journalCount(world)).toBe(0);
  });
});

describe('PostingService reversals (invariant 2; answer 1)', () => {
  it('a reversal mirrors the original line for line, so the two net to zero', async () => {
    const world = await newWorld();
    const posted = await inScope(world, () => provided.posting.post(sample(world)));
    const reversal = await inScope(world, () =>
      provided.posting.reverse(posted.journalId, 'Voided by owner'),
    );
    expect(await linesOf(world, reversal.journalId)).toEqual([
      { account_id: world.accounts.get('cash'), debit: '0.00', credit: '12500.00' },
      { account_id: world.accounts.get('receivable'), debit: '12500.00', credit: '0.00' },
    ]);
    const [row] = await asOwner(
      world,
      (tx) => tx.$queryRaw<{ source_type: string; source_id: string; reversal_of: string; memo: string }[]>`
        SELECT source_type, source_id::text, reversal_of::text, memo FROM journal WHERE id = ${reversal.journalId}::uuid`,
    );
    expect(row).toEqual({
      source_type: 'reversal',
      source_id: posted.journalId,
      reversal_of: posted.journalId,
      memo: 'Voided by owner',
    });
  });

  it('two reversals of one journal at the same time: one wins, the other is 409 journal.already_reversed, not 500', async () => {
    const world = await newWorld();
    const posted = await inScope(world, () => provided.posting.post(sample(world)));
    const results = await Promise.allSettled([
      inScope(world, () => provided.posting.reverse(posted.journalId, 'First')),
      inScope(world, () => provided.posting.reverse(posted.journalId, 'Second')),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(AppError);
    expect((lost.reason as AppError).code).toBe('CONFLICT');
    expect((lost.reason as AppError).fields[0]?.code).toBe('journal.already_reversed');
    expect(await journalCount(world)).toBe(2);
  });

  it('a reversal of a reversal is refused with 409 journal.reversal_of_reversal', async () => {
    const world = await newWorld();
    const posted = await inScope(world, () => provided.posting.post(sample(world)));
    const reversal = await inScope(world, () => provided.posting.reverse(posted.journalId, 'Voided'));
    expect(await refusal(inScope(world, () => provided.posting.reverse(reversal.journalId, 'Undo')))).toEqual(
      {
        code: 'CONFLICT',
        field: 'journal.reversal_of_reversal',
      },
    );
    expect(await journalCount(world)).toBe(2);
  });

  it("another business's journal is not found (404), and nothing is written in either business", async () => {
    const [x, y] = [await newWorld(), await newWorld()];
    const yJournal = await inScope(y, () => provided.posting.post(sample(y)));
    expect(
      (await refusal(inScope(x, () => provided.posting.reverse(yJournal.journalId, 'Guess')))).code,
    ).toBe('NOT_FOUND');
    expect([await journalCount(x), await journalCount(y)]).toEqual([0, 1]);
  });
});
