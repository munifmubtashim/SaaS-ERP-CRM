import type { DemoBranch } from './types.ts';

/** One organization, two businesses, four branches (plan: demo schema). Place names only, no addresses. */
export const DEMO_BRANCHES: readonly DemoBranch[] = [
  { code: 'MIR', name: 'Mirpur-10', business: 'Demo Motors' },
  { code: 'UTT', name: 'Uttara', business: 'Demo Motors' },
  { code: 'AGR', name: 'Agrabad', business: 'Demo Motors' },
  { code: 'NGJ', name: 'Narayanganj', business: 'Demo Parts' },
];
