import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DAL_DIR } from './sqlFunctions.js';

/**
 * ADR 0021 test 12, with no database: only query/StockQuery.ts names stock_balance or stock_cost (or their Prisma
 * models) in TypeScript, so every write to the cache goes through its atomic, locked statements. SQL files in
 * dal/sql are exempt (Munif, 24 Nov): the migration source and later report views read the cache there.
 */
const STOCK_QUERY = 'query/StockQuery.ts';
const FORBIDDEN =
  /\bstock_balance\b|\bstock_cost\b|\bStockBalance\b|\bStockCost\b|\.stockBalance\s*\.|\.stockCost\s*\./;

function typeScriptFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return ['node_modules', 'test', 'migrations', 'generated', 'sql'].includes(entry.name)
        ? []
        : typeScriptFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('ADR 0021 test 12: only StockQuery names the stock cache in TypeScript', () => {
  it('no dal TypeScript file other than query/StockQuery.ts names stock_balance or stock_cost', () => {
    const offenders = typeScriptFiles(DAL_DIR)
      .map((path) => relative(DAL_DIR, path))
      .filter((file) => file !== STOCK_QUERY && FORBIDDEN.test(readFileSync(join(DAL_DIR, file), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('StockQuery itself does name them (the rule tests something)', () => {
    expect(FORBIDDEN.test(readFileSync(join(DAL_DIR, STOCK_QUERY), 'utf8'))).toBe(true);
  });
});
