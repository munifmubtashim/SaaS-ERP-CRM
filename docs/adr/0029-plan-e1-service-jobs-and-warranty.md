# 0029: Plan for E1, service jobs and warranty

| Field               | Value                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                                    |
| Date                | 2026-11-21                                                                                                  |
| Deciders            | Farhan (owner), Munif                                                                                       |
| Spec / roadmap refs | spec SV-01 to SV-12, O-11; invariants 1, 2, 3, 4, 6; ADR 0001 row 7; ADR 0012, 0015, 0020, 0021, 0022, 0026 |

## Context

The plan lists E1, "service jobs and warranty", as an ADR first, and E2 to E7 as the builds: job card, statuses
and print; parts from stock and the service invoice; the warranty record and check; estimates; the free service
schedule and supplier warranty claims (E7, deferred after release 1). Moto Mart has a Service Center next to the
showroom (plan 1.5).

The feature plan reserved 0020 for this; that number went to the product plan (ADR 0020), so this is 0029. The
job statuses are fixed by ADR 0001 row 7 (accepted): **Received, In progress, Awaiting parts, Ready, Delivered.**

This plan touches stock, the ledger, tenant tables and migrations, so CLAUDE.md requires it before code. No code
is in this PR.

## Decision

### 1. Core and pack

- **Core:** a job is on a **serial unit** the business knows (`serial_unit_id`, ADR 0020) or on a **customer
  item** described in text (`item_description`, `item_serial`). Nothing in the core names a chassis, an engine, a
  number plate or an odometer.
- **Vehicle pack:** `vehicle_job_detail (job_id, plate_no, odometer_km)` and the warranty km rule (SV-05), in its
  own tables, as O-11 asks. A vehicle bought elsewhere (SV-06) becomes a pack unit record, not a core field.

### 2. Tables (Service, `service.prisma`)

All business-owned, branch-scoped, with the rules from #27 and #31: `uuid_v7()` ids, `created_by` the caller,
RLS forced with `branch_is_active` in `WITH CHECK`, `TO` and `FOR` on every policy, owner policies
`TO CURRENT_USER` (append-only tables: `SELECT` and `INSERT` only), no `DELETE` for any role, a
`BEFORE TRUNCATE` trigger on each.

| Table              | Key columns                                                                                                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `service_job`      | `number` (`service_job` series, ADR 0015), `party_id`, `serial_unit_id` or `item_description` (`CHECK` one of them), `complaint`, `status`, `technician_staff_id`, `promised_at`, `warranty_id` (nullable), `invoice_id` (nullable), `version` |
| `service_job_line` | `kind` (`labour` or `part`), `description`, `product_id` (parts), `qty`, `unit_price`, `line_total`, `under_warranty`, `issued_movement_id` (parts)                                                                                            |
| `service_estimate` | `job_id`, `total`, `sent_at`, `decision` (`approved`, `declined`), `decided_at`, `decided_via` (`in_person`, `phone`, `whatsapp`)                                                                                                              |
| `warranty`         | `serial_unit_id`, `party_id`, `starts_on`, `ends_on`, `source_invoice_id`; one per unit sale                                                                                                                                                   |

- **Statuses** (ADR 0001 row 7): `received → in_progress ⇄ awaiting_parts → ready → delivered`, and `cancelled`
  before `ready`. A trigger allows only these changes. A job with parts issued can't be cancelled until they're
  returned to stock.
- **Lines change only while the job is open.** After `ready`, lines are frozen; the invoice copies them.
- **Technician** is a `staff` row (ADR 0008), so technicians need no login.

### 3. Parts and money

- **Issuing a part (SV-03)** is a stock movement out, kind `service_issue` (a new ADR 0021 kind), through
  `IStockService.move`, at the moment it's issued. It can't take stock below zero (F-08). Its cost goes to a
  work-in-progress role: Dr `service_wip`, Cr `inventory`.
- **Returning an unused part** is the opposite movement and journal, never an edit.
- **The service invoice (SV-04)** is a Sales invoice (ADR 0022) with `source = service_job`, so numbering,
  payments (ADR 0026) and dues stay in one place. It posts Dr `receivable`, Cr `service_revenue` (labour) and
  `sales_revenue` (parts), and moves the job's part cost: Dr `cogs`, Cr `service_wip`. No stock moves at the
  invoice, because the parts already left at issue. Open question 1.
- **Under warranty (SV-05):** a warranty line is charged at zero to the customer; its part cost posts Dr
  `warranty_expense`, Cr `service_wip`. A supplier warranty claim (SV-09, E7) later turns that cost into a
  receivable from the supplier.
- **A known gap: a job done entirely under warranty.** Part cost leaves `service_wip` only through the invoice.
  A job whose every line is under warranty has nothing to charge, so without a step for it the cost stays in
  `service_wip` for good. Two options, not decided here (Munif's accounting rule, open question 5):
  - **a zero invoice** through the same service-invoice path: total ৳0.00, posting only Dr `warranty_expense`,
    Cr `service_wip`;
  - **its own journal** when the job is delivered (`source = service_job`), with no invoice.

### 4. Warranty

- **The record (E4):** created when a serial unit is **delivered** (status `delivered`, ADR 0020), with
  `ends_on` from a per-product warranty period (open question 2). The km limit is the pack's.
- **The check:** when a job is opened on a unit, the Manager finds its warranty; if today is inside it (and,
  with the pack, the odometer is under the limit), lines can be marked `under_warranty`.

### 5. Routes (all `scope: 'tenant'`, each with an isolation case)

New permission codes: `service.job.create`, `service.job.update`, `service.job.view`, `service.part.issue`,
`service.estimate.create`, `service.warranty.view`. Stock and money POSTs carry `{ idempotent: true }` and
`X-Branch-Id`. **The invoice route** (`POST /v1/service-jobs/:id/invoice`) needs `service.job.update`; **the
part-return route** needs `service.part.issue`, the same code as issuing.

Default roles, added to `permissions.ts` (#26) in part 1, provisional like every mapping (as #64 to #66 do):

| Code                      | Owner | Business Manager | Branch Manager | Accountant | Cashier |
| ------------------------- | ----- | ---------------- | -------------- | ---------- | ------- |
| `service.job.create`      | yes   | yes              | yes            | no         | yes     |
| `service.job.update`      | yes   | yes              | yes            | no         | yes     |
| `service.job.view`        | yes   | yes              | yes            | yes        | yes     |
| `service.part.issue`      | yes   | yes              | yes            | no         | no      |
| `service.estimate.create` | yes   | yes              | yes            | no         | yes     |
| `service.warranty.view`   | yes   | yes              | yes            | yes        | yes     |

The Cashier gets job codes because the service desk opens and updates jobs; issuing stock stays with managers.

`POST /v1/service-jobs` · `PATCH /v1/service-jobs/:id` (with `version`) · `POST /v1/service-jobs/:id/status` ·
`POST /v1/service-jobs/:id/parts` (issue) · `POST /v1/service-jobs/:id/parts/:lineId/return` ·
`POST /v1/service-jobs/:id/estimates`, `…/estimates/:eid/decision` · `POST /v1/service-jobs/:id/invoice` ·
`GET /v1/service-jobs` (by unit, phone or number, SV-01) · `GET /v1/serial-units/:id/warranty`.

## Tests to write first (run to see them fail)

businessLogic, with `FakeStockService`, `FakePostingService` and `FakeNumberSeries`:

1. Only ADR 0001's status changes are allowed; `ready → in_progress` and `delivered → anything` are refused.
2. Issuing a part calls one stock move out and posts Dr `service_wip`, Cr `inventory` at the cost returned.
3. Invoicing a job of ৳800.00 labour and a ৳1,200.00 part posts Dr `receivable` ৳2,000.00, Cr `service_revenue`
   ৳800.00, Cr `sales_revenue` ৳1,200.00, and moves the part's cost from `service_wip` to `cogs`.
4. A warranty line is ৳0.00 to the customer and posts its cost to `warranty_expense`.
5. A job with neither a unit nor an item description is refused.

Real Postgres:

6. Issuing more of a part than is on hand gives `stock.insufficient` and writes nothing.
7. Two technicians issuing the last unit of a part at once: one succeeds (invariant 6).
8. Lines can't change after `ready`; a job with issued parts can't be cancelled.
9. A delivered unit gets one warranty; a second for the same sale is refused.
10. The same `Idempotency-Key` twice on part issue or invoice gives one movement or one invoice.
11. Isolation: business Y gets 404 on X's jobs and warranties by id; a branch-2-only user can't open jobs in
    branch 1.
12. As the owner (no superuser, no `BYPASSRLS`), a `DELETE` removes 0 rows; `TRUNCATE` is refused. Tests check
    only their own fresh ids.
13. No core Service table or response has a plate, chassis, engine or odometer field (O-11).

## Migration steps (written here, applied in each PR, not now)

1. Merge `main`; tell Munif which Service tables are in flight, one migration per PR below.
2. Add the models to `service.prisma`; back-relations on `Branch`, `Party`, `Staff`, `SerialUnit`, `Product`,
   `Invoice` and `Journal`, each reviewed by its owner.
3. `npm run db:migrate:new -- <name>`; append RLS, owner policies, the status triggers, the `TRUNCATE` triggers
   and the `CHECK`s; read every statement.
4. `npm run db:migrate:check`, `db:migrate:deploy` on a throwaway Postgres, `test:integration`, `test:isolation`.

## Size and PR split

| Part | Plan row | Branch                    | Migration          | Contents                                               | Size (approx.) |
| ---- | -------- | ------------------------- | ------------------ | ------------------------------------------------------ | -------------- |
| 1    | E2       | `feat/service-job`        | `service_job`      | job card, statuses, print; tests 1, 5, 8, 11–13        | ~400           |
| 2    | E3       | `feat/service-parts`      | `service_job_line` | parts issue and return, invoice; tests 2, 3, 6, 7, 10  | ~400           |
| 3    | E4       | `feat/warranty`           | `warranty`         | warranty record and check, warranty cost; tests 4, 9   | ~300           |
| 4    | E6       | `feat/service-estimate`   | `service_estimate` | estimates and the customer's decision                  | ~250           |
| 5    | pack     | `feat/vehicle-job-detail` | `vehicle_job`      | plate, odometer, km rule (Vehicle pack, Munif reviews) | ~200           |

E7 (free service schedule, supplier warranty claims) is deferred after release 1 and gets its own plan.

## Blocked by

- ADR 0020 (#58), 0021 (#59), 0022 (#60), 0026 (A15), 0012 (#38), 0013 (#39), 0015 (#41), 0011 and 0014.
- A4 part 4 (`staff`) for technicians; A11 (`party`, #54).

## Consequences

- **Easier:** service money, stock and dues use the same invoice, payment and ledger paths as sales.
- **Harder:** a job's part cost sits in `service_wip` until it's invoiced (an all-warranty job: question 5); open
  jobs are a balance to watch.
- **Keep true:** no core field for vehicle data; parts leave stock only through movements.
- **Undo:** before go-live, drop each part's tables in a new migration.

## Open questions for Munif (and the owner where marked)

1. **The service invoice as a Sales invoice** with `source = service_job`, and parts costed through
   `service_wip` at issue? Needs the roles `service_wip`, `service_revenue`, `warranty_expense` in ADR 0012.
   ADR 0022's `postInvoice` moves stock for every product line, so a job's invoice needs a variant that moves
   none (the parts already left at issue) and posts the `service_wip` to `cogs` line instead. Recommended: yes,
   as a second posting rule class in Sales, not a flag on the sale path.
2. **(Owner)** Warranty periods: per product (for example 2 years), with a km limit from the pack? Recommended:
   a `warranty_months` field on the product (ADR 0020), 0 = none.
3. **Warranty start:** on delivery of the unit, not on the invoice date? Recommended: delivery.
4. **Estimate approval by the customer:** record how and when, with no staff approval rule? Recommended: yes;
   staff approval for discounts on jobs comes with approvals (ADR 0030, [#68](https://github.com/munifmubtashim/SaaS-ERP-CRM/pull/68)).
5. **A job done entirely under warranty** (section 3): clear its `service_wip` with a zero invoice through the
   service-invoice path, or with its own journal when the job is delivered? No recommendation here: it's an
   accounting rule for Munif.
