import { defineConfig } from 'tsup';

// Workspace packages export TypeScript source, so bundle them in; npm dependencies stay external.
export default defineConfig({
  entry: ['server.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@erp\//],
});
