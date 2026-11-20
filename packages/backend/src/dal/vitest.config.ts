import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Integration tests read DATABASE_URL from the repo-root .env locally; CI sets it directly.
const rootEnv = fileURLToPath(new URL('../../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// Two projects: `unit` (no database, runs in `npm run check`) and `integration` (real Postgres).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/**/*.test.ts'],
          exclude: ['**/node_modules/**', 'test/**/*.int.test.ts'],
        },
      },
      { test: { name: 'integration', include: ['test/**/*.int.test.ts'], testTimeout: 20_000 } },
    ],
  },
});
