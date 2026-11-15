import type { z } from 'zod';
import type { authContextSchema, tenantScopeSchema } from '../schemas/tenant.schema.js';

export type AuthContext = z.infer<typeof authContextSchema>;
export type TenantScope = z.infer<typeof tenantScopeSchema>;
