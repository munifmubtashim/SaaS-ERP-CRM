// Prisma 7 configuration. Prisma no longer reads .env by itself, so load the repo-root .env here.
// In CI the variables come from the workflow environment and no .env file exists; that is fine.
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// This file lives in packages/backend/src/dal; the repo root is four levels up.
loadEnv({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });

export default defineConfig({
  // A folder, not a file: one .prisma file per module (roadmap 2.2) so migrations rarely conflict.
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
    // TODO(both): seed command for synthetic demo data (never real customers): prisma/seeds/
  },
  datasource: {
    // Migrations run as the owner role. The app never uses this URL (see config/db.ts).
    url: env('MIGRATION_DATABASE_URL'),
  },
});
