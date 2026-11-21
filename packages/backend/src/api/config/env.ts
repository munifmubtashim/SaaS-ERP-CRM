import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    /** Application role (NOSUPERUSER, NOBYPASSRLS). Never the migration/owner URL. */
    DATABASE_URL: z.url(),
    /** Connections per api process; each tenant request holds one for its whole transaction (ADR 0005). */
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),
    /** Whole-transaction limit in Prisma; the erp_app role timeouts are the primary limit (ADR 0005). */
    DB_TX_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    APP_VERSION: z.string().default('0.0.0-dev'),
    /**
     * The erp_provisioner role (ADR 0008, ADR 0010): only ProvisioningQuery uses it, to create businesses and
     * branches. Required in production; elsewhere, when missing, provisioning answers 503 and all else runs.
     */
    PROVISIONING_DATABASE_URL: z.url().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.PROVISIONING_DATABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['PROVISIONING_DATABASE_URL'],
        message: 'required in production (ADR 0010)',
      });
    }
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
