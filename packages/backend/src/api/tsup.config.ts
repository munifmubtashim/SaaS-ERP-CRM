import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

/** npm dependencies of a workspace package (its own @erp/* links are bundled, not listed). */
function npmDependenciesOf(packageJson: string): string[] {
  const { dependencies = {} } = JSON.parse(readFileSync(new URL(packageJson, import.meta.url), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  return Object.keys(dependencies).filter((name) => !name.startsWith('@erp/'));
}

// Workspace packages export TypeScript source, so bundle them in; npm dependencies stay external,
// including those of the bundled workspaces (pg is CommonJS and cannot run inside the ESM bundle).
export default defineConfig({
  entry: ['server.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@erp\//],
  external: [
    ...npmDependenciesOf('../businessLogic/package.json'),
    ...npmDependenciesOf('../dal/package.json'),
    ...npmDependenciesOf('../../../shared/package.json'),
  ],
});
