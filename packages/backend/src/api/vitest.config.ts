import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Integration tests read DATABASE_URL from the repo-root .env locally; CI sets it directly.
const rootEnv = fileURLToPath(new URL('../../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['test/unit/**/*.test.ts'] } },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.int.test.ts'],
          testTimeout: 20_000,
          // One file at a time, like dal's integration tests: they share one database, and dal's TRUNCATE ... CASCADE
          // refusal tests lock every table that references organization. Unit tests stay parallel.
          fileParallelism: false,
        },
      },
      { test: { name: 'isolation', include: ['test/isolation/**/*.test.ts'] } },
    ],
  },
});
