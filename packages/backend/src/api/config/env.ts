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
    /** Session lifetimes (ADR 0018 section 3): idle, extended by activity; absolute, never extended. */
    SESSION_IDLE_HOURS: z.coerce.number().int().positive().default(8),
    SESSION_ABSOLUTE_DAYS: z.coerce.number().int().positive().default(7),
    /**
     * The session cookie (ADR 0018 section 2): true is `__Host-erp_sid` with Secure (production, always); false is
     * `erp_sid` without Secure, for http://localhost in development only.
     */
    SESSION_COOKIE_SECURE: z.stringbool().default(true),
    /**
     * The app's origin (scheme, host, port): every non-GET request must carry it in Origin (ADR 0018 section 2).
     * Required in production; elsewhere the Vite dev server, http://localhost:5173.
     */
    APP_ORIGIN: z.url().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.PROVISIONING_DATABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['PROVISIONING_DATABASE_URL'],
        message: 'required in production (ADR 0010)',
      });
    }
    if (env.NODE_ENV === 'production' && !env.SESSION_COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_COOKIE_SECURE'],
        message: 'must be true in production: the cookie is always __Host- and Secure (ADR 0018)',
      });
    }
    if (env.NODE_ENV === 'production' && !env.APP_ORIGIN) {
      ctx.addIssue({ code: 'custom', path: ['APP_ORIGIN'], message: 'required in production (ADR 0018)' });
    }
    if (env.SESSION_IDLE_HOURS > env.SESSION_ABSOLUTE_DAYS * 24) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_IDLE_HOURS'],
        message: 'must not be longer than SESSION_ABSOLUTE_DAYS',
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
