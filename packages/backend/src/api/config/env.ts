import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  /** Application role (NOSUPERUSER, NOBYPASSRLS). Never the migration/owner URL. */
  DATABASE_URL: z.url(),
  APP_VERSION: z.string().default('0.0.0-dev'),
});

export type Env = z.infer<typeof envSchema>;

/** Parses process.env once at startup. Fails fast with every missing or bad variable listed. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment. Copy .env.example to .env and check:\n${problems}`);
  }
  return result.data;
}
