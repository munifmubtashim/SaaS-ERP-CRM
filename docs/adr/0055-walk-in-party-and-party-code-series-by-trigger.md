# 0055: The walk-in party and the party code series, created by a trigger on business

| Field               | Value                                                                       |
| ------------------- | --------------------------------------------------------------------------- |
| Status              | Proposed                                                                    |
| Date                | 2026-11-25                                                                  |
| Deciders            | Farhan (owner), Munif (reviews: amends ADR 0010 and 0019 question 2)        |
| Spec / roadmap refs | ADR 0006 section 6, 0008, 0010, 0015, 0019 (questions 1 and 2), #54; F2, F6 |

## Context

Every business needs two Party rows before anyone can sell or add a customer:

- **The walk-in party** (ADR 0006 section 6, ADR 0019): the counter sale's customer. The POS catalog returns its id
  and `POST /v1/invoices` posts to it.
- **The business-wide `party_code` series** (ADR 0015, ADR 0019 question 1): `POST /v1/parties` takes the next
  `C-000001` from it. `INumberSeries.next('party_code', null)` answers `number_series.missing` without the row.

ADR 0010 and #54 planned both as a step after the business is created: the provisioning route commits the business
as `erp_provisioner`, then calls Party's interface in a new scope as `erp_app`. That route doesn't exist yet
(`OrganizationRoutes` is a stub), the demo seed creates its business directly, and today only the test worlds
insert a walk-in party or a series row. So a business created any other way has neither.

## Decision

### 1. One trigger, in Party's migration `party_provisioning`

- `AFTER INSERT ON business FOR EACH ROW` runs `party_provision_business()`, which inserts:
  - the walk-in party: code `WALK-IN`, name `Walk-in customer`, kind `person`, customer only, phone
    `+8801000000000`, `is_walk_in = true`, `created_by` `NULL` (allowed for the walk-in only, by the existing
    `CHECK`); `INSERT … ON CONFLICT DO NOTHING` on `party_one_walk_in_per_business`;
  - the `party_code` series: `branch_id` `NULL`, prefix `C-`, width 6, `next_value` 1;
    `ON CONFLICT DO NOTHING` on the business-wide unique `(business_id, branch_id, kind) NULLS NOT DISTINCT`.
- **Why the placeholder phone is safe:** `+88010…` is not a Bangladesh mobile (`01[3-9]`), so `toE164` refuses
  every input that would become it, and the duplicate-phone check can never match a real customer to the walk-in.
- The function is `SECURITY DEFINER`, owned by the migration owner (not superuser, not `BYPASSRLS`), with
  `SET search_path = pg_catalog, public`. A trigger function can't be called directly, and `EXECUTE` is revoked from
  `PUBLIC` all the same.
- **RLS stays forced.** The owner's policies on `party` and `number_series` check `app_business_ids()`. The function
  saves `app.business_ids`, sets it to the new business with `set_config(…, true)` for its two inserts, and restores
  the saved value before it returns, so the caller's scope after the insert is what it was before.
- `erp_provisioner` gets no grant on `party` or `number_series` (ADR 0008 test 17 still holds): the rows are written
  by the function's owner, in the provisioner's transaction.
- **Same transaction as the business:** a business never exists without its walk-in party and its `party_code`
  series, so ADR 0010's two-transaction gap and its `409` retry path aren't needed for these rows.
- **Backfill:** the migration runs the same function body once for every existing business, with the same
  `ON CONFLICT DO NOTHING`.

### 2. What changes elsewhere

- **ADR 0010:** the walk-in step after provisioning is no longer needed. Party's `ensureWalkIn()` stays as a read.
- **ADR 0019 question 2:** answered by this trigger, not by the provisioning route. Question 1: the series row is
  created here.
- **Test worlds** (`dal/test/support/isolationWorld.ts`, `dal/test/support/party.ts`, Munif's files): a walk-in
  party now exists for every new business, so they read it instead of inserting a second one. The change is the
  fewest lines that do that, in its own commit, listed in the PR description for Munif.

### 3. Tests to write first (real Postgres)

1. A business inserted as `erp_provisioner` has exactly one walk-in party (code `WALK-IN`, `created_by` null) and one
   `party_code` series (`C-`, width 6, `next_value` 1), read back as `erp_app` in that business's scope.
2. The caller's `app.business_ids` is exactly what it was after the insert, in both cases: **set** (its value
   is unchanged) and **unset or empty** (it is still empty, so `app_business_ids()` still refuses, and no scope
   leaks into the rest of the transaction).
3. Business Y's scope sees neither row of business X.
4. A second walk-in party for the same business is still refused by the index.
5. `erp_provisioner` still can't `SELECT` or `INSERT` on `party` or `number_series` directly.
6. The function is `SECURITY DEFINER`, its owner is the migration owner, and `PUBLIC` can't execute it.
7. The source file (`dal/sql/triggers/party_provisioning.sql`) and the migration define the same function and
   trigger.
8. `INumberSeries.next('party_code', null)` for a new business gives `C-000001`, then `C-000002`.

### 4. Order of work

| Part | Branch                | Contents                                                     | Base                    |
| ---- | --------------------- | ------------------------------------------------------------ | ----------------------- |
| 1    | `feat/party-walk-in`  | this ADR, migration `party_provisioning`, tests 1–8, worlds  | `feat/party-ledger`     |
| 2    | `feat/party-routes`   | ADR 0019 part 4: the five party routes, isolation cases      | part 1 + #194 merged in |

## Consequences

- **Easier:** every business, however it is created (provisioning route, seed, test), can sell and add customers
  at once; Sales never handles "no walk-in yet".
- **Harder:** Party's rows are written from a trigger on Organization's table. The trigger lives in Party's
  migration and source file, and Organization's code never names Party.
- **Keep true:** the function restores the caller's scope; no role gains a grant; RLS stays forced.
- **Undo:** a new migration drops the trigger and the function. The rows already created stay.
