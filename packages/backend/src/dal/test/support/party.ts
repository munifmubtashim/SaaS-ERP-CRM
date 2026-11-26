import { randomBytes, randomUUID } from 'node:crypto';
import type { DbClient } from '../../config/db.js';
import { setScope, type Tree } from './orgTree.js';

/**
 * A party in `tree`'s business, inserted as the migration owner (ADR 0019): a customer by default, or the
 * business's one walk-in party. Every value is invented; phones follow the repo's fake sequential pattern.
 */
export async function addParty(
  owner: DbClient,
  tree: Tree,
  options: { walkIn?: boolean } = {},
): Promise<string> {
  return owner.$transaction(async (tx) => {
    await setScope(tx, tree.organizationId, [tree.businessId], [tree.branchId]);
    // ADR 0055: the business's trigger already made its one walk-in party; read it instead of adding a second.
    if (options.walkIn) {
      const [walkIn] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id::text FROM party WHERE business_id = ${tree.businessId}::uuid AND is_walk_in`;
      if (!walkIn) throw new Error('no walk-in party');
      return walkIn.id;
    }
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO party (business_id, code, name, kind, is_customer, is_supplier, phone_e164, is_walk_in, created_by)
      VALUES (${tree.businessId}::uuid, ${`CU-${randomBytes(4).toString('hex')}`},
              ${options.walkIn ? 'Walk-in customer' : 'Sample Customer'}, 'person', true, false, '+8801700000001',
              ${options.walkIn ?? false}, ${options.walkIn ? null : randomUUID()}::uuid)
      RETURNING id::text`;
    if (!row) throw new Error('no party');
    return row.id;
  });
}
