# 0032: Plan for the activity record (B1 to B3)

| Field               | Value                                                                    |
| ------------------- | ------------------------------------------------------------------------ |
| Status              | Proposed                                                                 |
| Date                | 2026-11-21                                                               |
| Deciders            | Munif, Farhan                                                            |
| Owner               | Munif (Organization; plan rows B1, B2, B3)                               |
| Spec / roadmap refs | spec C-11, U-06, CR-06; ADR 0005, 0008 (#27), 0033; plan 2.2, 4.1 item 3 |

## Context

Plan 4.1 says the activity record comes **before any edit route**, and plan 2.2 sets its design. The feature plan
reserved ADR 0009 for it, and that number is now ADR 0009, the A3b plan; this is the activity record's plan. It's
a tenancy and migration change, so CLAUDE.md requires an agreed plan. No code is in this PR.

## Decision

**Scope:**

- one append-only table;
- one write path, used by Managers in the same transaction as the change;
- the Activity Log page (B3).

### Table `audit_event` (Organization, migration `audit_event`)

| Column                     | Notes                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `organization_id`          | always set                                                                                 |
| `business_id`              | nullable: `NULL` for organization-level events (a role change)                             |
| `branch_id`                | nullable                                                                                   |
| `actor_user_id`            | the caller                                                                                 |
| `action`                   | `create`, `edit`, `void`, `approve`, `reject`, `status_change`, `view_sensitive`, `denied` |
| `entity_type`, `entity_id` | what changed                                                                               |
| `summary`                  | text, short                                                                                |
| `before`, `after`          | jsonb, nullable; never the NID ("NID changed" only), and redacted on read (ADR 0033)       |
| `occurred_at`              | timestamptz                                                                                |

The table rules proposed on #27 and #31 apply:

- RLS forced: `organization_id = (SELECT app_organization_id())` and
  `(business_id IS NULL OR business_id = ANY ((SELECT app_business_ids())::uuid[]))`.
- `erp_app`: `SELECT`, `INSERT` only.
- Owner policies `FOR SELECT` and `FOR INSERT` only (append-only).
- A trigger refuses `UPDATE` and `DELETE` for every role, plus the `BEFORE TRUNCATE` trigger.

### One write path

- **`IActivityRecorder.record(event)`:** businessLogic, wired in `createManagers`. Managers call it in the
  **same transaction** as the change, so both commit or both roll back.
- **Denied actions** (a `403`) are recorded in ADR 0005's second short transaction, so the record survives the
  request's rollback.
- **Postings:** one event per posting (`journal.posted`, `stock.moved`) with ids and a summary, never a copy of
  the lines (plan 2.2).
- **Login history** stays in the Auth tables (ADR 0018); login runs outside a tenant scope.

### The Activity Log page (B3)

- `GET /v1/activity`, a tenant route with filters: user, page, action and date range; cursor pages.
- It needs `organization.activity.view`, held by Owner, Business Manager (own businesses) and Accountant (decided by
  Munif, 21 Nov). `before`/`after` pass through ADR 0033's redaction.
- **Frontend:** `features/organization/ActivityLogPage` (Organization is Munif's module).

## Invariants touched

Tenancy (RLS, the second transaction for denied actions), append-only records (like invariant 2), hidden fields.

## Tests to write first

1. A change and its event commit together; a change that rolls back leaves no event.
2. A denied action's event survives the request's rollback.
3. `UPDATE` and `DELETE` on an event:
   - `erp_app` gets `permission denied`;
   - the owner changes 0 rows, and the rows are unchanged;
   - a role that bypasses RLS hits the trigger.

   `TRUNCATE` is refused for every role.

4. Business Y can't read X's events; an organization-level event is visible only inside its organization.
5. An NID change writes "NID changed", never the number; cost and salary in `before`/`after` are absent for a role
   without the permission (ADR 0033).
6. A journal posting writes one event with ids, not lines.
7. The Activity Log filters by user, page, action and date, and pages with a cursor.
8. One isolation case for `GET /v1/activity`.

## Dependencies

- A3b part 1 (#31) and A4 (users and roles).
- #8 (the route wrapper and ADR 0005's second transaction).
- ADR 0033 (redaction), and #26 (permission codes; `organization.activity.view` is added by this plan's PR).

## Size and PR split

| Part | Contents                                                            | Size |
| ---- | ------------------------------------------------------------------- | ---- |
| 1    | migration, triggers, `AuditQuery`, `ActivityRecorder`, tests 1 to 6 | ~400 |
| 2    | the route, the page, tests 7 and 8                                  | ~350 |

## Consequences

- **Easier:** every later module records "who did what" with one call.
- **Harder:** the table only grows; month partitions come later (roadmap 5.1).
- **Undo:** before go-live, a new migration drops the table.

## Open questions (with recommended answers)

1. ~~**Munif:** who may open the Activity Log?~~ **Decided by Munif, 21 Nov:** Owner, Business Manager (own
   businesses) and Accountant. `organization.activity.view` is mapped to those three roles.
2. ~~**Both:** partition by month now?~~ **Decided by Munif, 21 Nov:** no partitioning now.
3. **Farhan:** should viewing a full NID (CR-06) write `view_sensitive` here, as plan 2.2 says? Recommended: yes.
