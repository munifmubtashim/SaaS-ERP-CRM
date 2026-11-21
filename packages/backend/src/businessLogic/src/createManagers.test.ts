import { describe, expect, it } from 'vitest';
import { createManagers, DenyAllRoleSource, type ManagerConfig } from './index.js';

/**
 * ADR 0010 part 2 (Munif, 20 Nov, answer 3): createManagers needs a role source and throws at start-up without
 * one; it never defaults to "allowed". No database connection is opened by construction, so no database is needed.
 */
const base: Omit<ManagerConfig, 'roleSource'> = {
  databaseUrl: 'postgresql://erp_app:x@localhost:5433/erp',
  version: 'test',
  dbPoolMax: 1,
  dbTxTimeoutMs: 1_000,
};

describe('createManagers and the role source', () => {
  it('throws at start-up when no role source is supplied', () => {
    expect(() => createManagers({ ...base } as ManagerConfig)).toThrow(/role source/);
  });

  it('builds the Managers with an explicit role source, and closes cleanly', async () => {
    const { managers, close } = createManagers({ ...base, roleSource: new DenyAllRoleSource() });
    expect(managers.organization).toBeDefined();
    await close();
  });
});
