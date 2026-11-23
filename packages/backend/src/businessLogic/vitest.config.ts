import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Integration tests read DATABASE_URL and MIGRATION_DATABASE_URL from the repo-root .env locally; CI sets them.
const rootEnv = fileURLToPath(new URL('../../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// Two projects: `unit` (fakes, no database, runs in `npm run check`) and `integration` (real Postgres).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['**/node_modules/**', 'src/**/*.int.test.ts'],
        },
      },
      { test: { name: 'integration', include: ['src/**/*.int.test.ts'], testTimeout: 30_000 } },
    ],
  },
});
