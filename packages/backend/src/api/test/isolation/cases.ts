/**
 * One entry per tenant-scoped route, keyed "METHOD /full/path". Each case describes how a user of
 * business X attacks business Y on that route. The runner that executes them against a real
 * database arrives with the tenancy module (Phase 1). Empty in Phase 0: no tenant route exists yet.
 */
export interface IsolationCase {
  /** What the attacker tries, in plain words, e.g. "read invoice of business Y by id". */
  attempts: string[];
}

export const ISOLATION_CASES: Record<string, IsolationCase> = {
  // Run by products.isolation.test.ts against real Postgres.
  'GET /v1/products': {
    attempts: [
      "list in business Y and find X's product: none",
      "name another organization's business, a business without a scope or a guessed id: the same 404",
    ],
  },
  'GET /v1/products/:id': {
    attempts: ["read X's product from Y: 404, the same as a guessed id"],
  },
  'POST /v1/products': {
    attempts: ['send businessId of Y in the body: 400; the row lands only in the scope business'],
  },
  'PATCH /v1/products/:id': {
    attempts: ["edit X's product from Y: 404, and X's product is unchanged"],
  },
  // Run by parties.isolation.test.ts against real Postgres (ADR 0056 section 4, ADR 0019 test 15).
  'GET /v1/parties': {
    attempts: ["list and search in business Y for X's party: never shown"],
  },
  'GET /v1/parties/:id': {
    attempts: ["read X's party from Y: 404, the same as a guessed id"],
  },
  // Run by dues.isolation.test.ts against real Postgres (ADR 0059 test 2).
  'GET /v1/parties/:id/dues': {
    attempts: ["read X's customer's dues from Y: 404, the same as a guessed id, and nothing of X shows"],
  },
  'POST /v1/parties': {
    attempts: [
      'send businessId, code or status in the body: 400, nothing created',
      "use X's phone in Y: no duplicate warning, so nothing of X leaks",
    ],
  },
  'PATCH /v1/parties/:id': {
    attempts: ["edit X's party from Y: 404, and X's party is unchanged"],
  },
  'POST /v1/parties/:id/deactivate': {
    attempts: ["deactivate X's party from Y: 404, and it stays active"],
  },
  // Run by payments.isolation.test.ts against real Postgres (ADR 0057, ADR 0026 test 9).
  'POST /v1/payments': {
    attempts: [
      "pay X's invoice or name X's customer from Y: 404, and X's due is unchanged",
      'a cashier of X1 names branch X2a: refused by tenantMiddleware',
    ],
  },
  // Run by invoices.isolation.test.ts against real Postgres (item 3b).
  // Run by invoices.read.isolation.test.ts against real Postgres (ADR 0059 test 5).
  'GET /v1/invoices': {
    attempts: ["list in Y, even naming X's customer: X's invoices never appear"],
  },
  'GET /v1/invoices/:id': {
    attempts: ["read X's invoice from Y: 404, the same as a guessed id"],
  },
  'POST /v1/invoices': {
    attempts: [
      "sell X's product from Y: 409 product unavailable, and X's stock is unchanged",
      "name X's customer on a sale in Y: 404 customer not found",
      'a cashier of X1 posts to another branch: refused by tenantMiddleware',
    ],
  },
};
