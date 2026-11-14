import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Integration tests read DATABASE_URL from the repo-root .env locally; CI sets it directly.
const rootEnv = fileURLToPath(new URL('../../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  test: { include: ['test/**/*.int.test.ts'], testTimeout: 20_000 },
});
