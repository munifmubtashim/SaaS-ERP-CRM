import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The ADR 0012 amendment (Munif, 24 Nov): StockService.move() returns the cost each movement used, a hidden figure
 * (plan 2.5). It feeds the sale's cost-of-goods journal line inside businessLogic and never goes into an API
 * response. Until a route needs stock through a Manager, no api source may reach the stock service at all.
 */
const API_DIR = fileURLToPath(new URL('../../', import.meta.url));
const REACHES_STOCK = /\bIStockService\b|\bStockService\b|provided\.stock\b|\.move\(\s*\[/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return ['node_modules', 'test', 'dist'].includes(entry.name) ? [] : sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe("move()'s costs never reach an API response", () => {
  it('no api source file names the stock service or calls move()', () => {
    const offenders = sourceFiles(API_DIR).filter((file) => REACHES_STOCK.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the rule looks at real files (the api source is not empty)', () => {
    expect(sourceFiles(API_DIR).length).toBeGreaterThan(10);
  });
});
