import { afterAll, describe, expect, it } from 'vitest';
import { createDbClient, type DbClient } from '../config/db.js';
import { runInTenantScope } from '../config/tenantScope.js';
import { BaseDTO, type BaseRow } from '../dto/BaseDTO.js';
import { BaseQuery } from '../query/BaseQuery.js';

/**
 * Shared dal base classes: BaseQuery.requireOneBusiness (a write that belongs to exactly one business refuses a
 * scope with several) and BaseRow.createdBy, which is NULL for seeded rows (#27). Used by NumberSeriesQuery (#121)
 * and ProductQuery (#124).
 */
const appUrl = process.env.DATABASE_URL;
if (!appUrl) throw new Error('DATABASE_URL must be set (see .env.example).');

const app: DbClient = createDbClient(appUrl, { poolMax: 2, txTimeoutMs: 10_000 });
const ORG = '0196f000-0000-7000-8000-00000000000a';
const BIZ_A = '0196f000-0000-7000-8000-0000000000a1';
const BIZ_B = '0196f000-0000-7000-8000-0000000000b1';
const BRANCH = '0196f000-0000-7000-8000-0000000001a1';

/** A Query that only asks for one business; test-only. */
class OneBusinessProbe extends BaseQuery {
  check(): Promise<void> {
    return this.requireOneBusiness('A probe');
  }
}

/** A DTO over BaseRow alone; test-only. */
class ProbeDTO extends BaseDTO {
  private constructor(row: BaseRow) {
    super(row);
  }
  static fromRow(row: BaseRow): ProbeDTO {
    return new ProbeDTO(row);
  }
}

const probe = new OneBusinessProbe();
const inScope = (businessIds: string[]) =>
  runInTenantScope(app, { organizationId: ORG, businessIds, branchIds: [BRANCH] }, () => probe.check(), {
    // Here the scope runner itself refuses several businesses unless the route is read-only (#8); a read-only
    // scope reaching a one-business write is exactly what the helper guards.
    readOnly: businessIds.length > 1,
  });

afterAll(async () => {
  await app.$disconnect();
});

describe('BaseQuery.requireOneBusiness', () => {
  it('passes in a scope with exactly one business', async () => {
    await expect(inScope([BIZ_A])).resolves.toBeUndefined();
  });

  it('refuses a scope with several businesses, naming what needed one', async () => {
    await expect(inScope([BIZ_A, BIZ_B])).rejects.toThrow(
      'A probe belongs to exactly one business; the scope has several.',
    );
  });
});

describe('BaseRow.createdBy', () => {
  it('may be null: a seeded row has no creator (#27)', () => {
    const now = new Date();
    const dto = ProbeDTO.fromRow({
      id: BIZ_A,
      businessId: BIZ_A,
      branchId: null,
      createdAt: now,
      updatedAt: now,
      createdBy: null,
      version: 1,
    });
    expect(dto.createdBy).toBeNull();
  });
});
