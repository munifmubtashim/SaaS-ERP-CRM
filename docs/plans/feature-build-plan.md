# Feature build plan: Pages and Features to PRs

| Field  | Value                                                                                                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status | **Draft for review by Munif and Farhan.** Nothing here is agreed until both say so on the PR.                                                                                                                             |
| Date   | 2026-11-19; Moto Mart decisions added 2026-11-20 (section 1.5)                                                                                                                                                            |
| Inputs | Pages and Features (13 sections); Acceptance Specification v2 ("spec"); Roadmap Draft v2 ("roadmap"); ADRs 0001 to 0008; `docs/queue.md`; Moto Mart's answers and their current system (section 1.5)                      |
| Rule   | Spec sections 7 (Registration/BRTA), 18 (HR) and 19 (Deferred and points to confirm) are **cancelled**. Where the features file and the spec disagree, the spec wins (ADR 0001); every conflict is listed in section 1.4. |

How to read the tables: **M** = Munif, **F** = Farhan. "Pack" = the vehicle pack (spec O-11). Invariant codes
come from CLAUDE.md: **L** ledger is the truth / posted is permanent / source documents post (1, 2, 4),
**St** stock is a ledger (3), **Id** idempotency (5), **Cc** concurrency (6), **Co** costing (7), **Li**
pass-through money is a liability (8), **PL** period lock (9), **Ob** outbox (10), **Pm** permissions,
**NID** national ID rules. Every feature that adds a table also touches **tenancy and migrations**; that is
not repeated in each row. Any row with a code needs an agreed written plan (ADR) before code.

---

## 1. What exists today, and how the features map to it

### 1.1 What is in the repo (checked on `origin/main`, 3eb08c2, and the open PRs)

**On `main`:**

- **Every module is a stub in every layer.** Routes, Controller, Manager, Query, DTO, both contracts,
  shared types and schema, frontend service and feature folder exist for all 12 modules (Auth, Organization,
  Product, Inventory, Accounting, Vehicle, Report, Party, Sales, Purchase, Service, Crm), each with a
  `TODO(owner)` and no logic. No module router has a route.
- **No domain tables.** Every `prisma/schema/<module>.prisma` says "No models yet". The only migration is
  `20261114140748_baseline`, which is empty.
- **Working code:**
  - the Health slice end to end (the pattern to copy);
  - `dal/config/tenantScope.ts` (`runInTenantScope`, one transaction, `SET LOCAL` via `set_config(..., true)`), `BaseQuery` reading the scoped client, `UnscopedQuery` for Auth and Health only;
  - pool size and transaction timeout settings (#5);
  - `shared`: `tenant.schema.ts`, `party.schema.ts` (read shapes only, F1a), cursor `pagination.ts`, `AppError` and the error schema, `money.ts` (`moneySchema`, `formatMoneyBDT`; **no arithmetic yet**, it is a TODO), `date.ts` (`formatDateBD`), `permissions.ts` (**empty list**, TODO);
  - frontend: app shell, navigation, `HttpClient`, `Button`/`Card`/`StatusPill`, en/bn catalogues with the same-keys test.
- **Placeholders that let everything through:** `authMiddleware`, `tenantMiddleware`, `requireRole`. They
  are not safe for real data.
- **The isolation test list is empty** (`api/test/isolation/cases.ts`); the coverage test exists.

**In open PRs, not on `main`:**

| PR         | What                                                                                                                       | State                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| #19        | RLS functions `app_organization_id()`, `app_business_ids()`, `app_branch_ids()`; `app.branch_id`; the first real migration | CI green, waiting for Farhan |
| #8         | Tenant route wrapper; Controllers return `{status, body}`; read-only multi-business routes                                 | draft, merges after #19      |
| #9         | Module stubs take the wrappers                                                                                             | draft, merges after #8       |
| #16        | ADR 0007: the active business and branch come from `X-Business-Id` / `X-Branch-Id`                                         | in review                    |
| #14        | Mark ADRs 0005 and 0006 Accepted                                                                                           | in review                    |
| #10 to #13 | Login, switcher and owner dashboard: shared schemas and screens against mock services                                      | in review / drafts           |
| #17        | Demo hosting plan and Docker image                                                                                         | CI green, merges after #8    |
| #6         | `docs/queue.md`                                                                                                            | in review                    |

**Not in the repo at all:**

- `docs/reference/pages-and-features.md`. The prompt expects it; this plan was written from the copy pasted into the session. Commit it on its own first.
- No `legal_entity`, business, branch, user, role, audit, outbox, idempotency, approval, notification, attachment or export code or table.
- No decimal arithmetic for money.
- No Bangladesh phone helper: Party uses `z.e164()`.
- No worker. It is deferred (ADR 0003), so anything "scheduled", "SMS" or "email" has no runner yet.

### 1.2 Feature map, section by section

Owner per module (CLAUDE.md): M = Auth, Organization, Product, Inventory, Accounting, Vehicle, Report;
F = Party, Sales, Purchase, Service, Crm. "Platform" means shared code (both reviewers).

#### Features on every page

| Feature                                 | Spec        | Module(s) and owner                                                                     | Core / pack | Invariants                            |
| --------------------------------------- | ----------- | --------------------------------------------------------------------------------------- | ----------- | ------------------------------------- |
| Search by part, or across all           | C-07        | Platform: each module owns its search; a facade in api (section 2.3)                    | core        | Pm, NID                               |
| Filters (business, branch, dates, keys) | C-07, RP-05 | Platform: one shared list-query schema; each module adds its keys                       | core        | Pm (multi-business = read-only route) |
| Activity record and Activity Log page   | C-03, U-06  | Organization (M) owns the table and page; every module writes through one path          | core        | L (relation to posted rows), Pm, NID  |
| Business and branch switcher            | O-04        | Organization (M); #12, ADR 0007                                                         | core        | Pm                                    |
| Notifications                           | C-14        | Report (M) owns rules and inbox; modules emit events                                    | core        | Ob                                    |
| Export and print                        | C-06, C-15  | Platform (frontend export helper; print styles); document templates deferred (ADR 0003) | core        | Pm (hidden fields in exports)         |
| Share on WhatsApp                       | S-21, CR-09 | Platform (frontend): a link button, no API (release 1, section 1.5)                     | core        | Pm (no hidden field in the text)      |
| Attachments                             | C-16        | Platform (M): one `attachment` table and MinIO; first user: customer Documents tab      | core        | Pm, NID (documents)                   |
| Language and format                     | C-08, C-09  | Platform: `shared/src/utils`, frontend i18n                                             | core        | none                                  |
| Phone and tablet                        | C-18        | Frontend, per screen; phone layout is release 1                                         | core        | none                                  |

#### Owner Dashboard and Action Center

| Feature                                        | Spec         | Module(s) and owner                                                                        | Core / pack | Invariants                                   |
| ---------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------ | ----------- | -------------------------------------------- |
| Filters on every card                          | D-01         | Report (M)                                                                                 | core        | Pm (read-only multi-business)                |
| Financial Health, incl. cash forecast          | D-01, A-20   | Report (M) reads Accounting (M), Sales (F), Purchase (F); recurring expenses in Accounting | core        | L (figures must equal the ledger, C-05)      |
| Sales Performance, targets                     | D-08, RP-09  | Report (M) reads Sales (F); `kpi_target` in Report                                         | core        | none                                         |
| Inventory Health                               | D-01         | Report (M) reads Inventory (M)                                                             | core        | St (balances from movements)                 |
| Business and Branch Comparison                 | O-09         | Report (M)                                                                                 | core        | Pm, tenancy (group views `security_invoker`) |
| Customer Insights                              | App. A §5    | Report (M) reads Party (F), Sales (F)                                                      | core        | none                                         |
| Operations and Procurement, salary cost        | App. A §6    | Report (M) reads Purchase (F), Sales (F), Accounting (M)                                   | core        | Pm (salary hidden)                           |
| Action Center: items, assign, resolve, history | D-04, D-05   | Report (M) owns `action_item`; each module supplies its exception query                    | core        | Pm, Ob                                       |
| Drill-down to documents                        | D-02         | Report (M) links to each module's list with the same filter                                | core        | L (list total = figure)                      |
| Role views                                     | D-03         | Auth (M) permissions; Report (M) hides cards                                               | core        | Pm                                           |
| Last updated, loading/empty/error states       | D-06, D-07   | Frontend (M)                                                                               | core        | none                                         |
| Green/amber/red, dark mode, phone layout       | App. A, D-09 | Frontend (M)                                                                               | core        | none                                         |

#### Organization, Businesses and Branches

| Feature                                                  | Spec       | Module(s) and owner                                                          | Core / pack | Invariants                                                  |
| -------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------- |
| Setup: group, legal entity, business, branch; deactivate | O-01, O-03 | Organization (M); Moto Mart = one business, two branches (section 1.5, Q22)  | core        | tenancy (the tree itself), Pm                               |
| Separate books per business                              | O-02       | Accounting (M): chart, fiscal year and number series per business            | core        | L                                                           |
| Data isolation                                           | O-05       | Platform: RLS, route wrapper, isolation suite (M5)                           | core        | tenancy, Pm                                                 |
| Branch transfer of cash and stock                        | O-06, I-07 | Inventory (M) for stock; Accounting (M) for cash; Approvals (platform)       | core        | L, St, Cc                                                   |
| Inter-business transactions                              | O-07       | Accounting (M): due-to/due-from; Sales (F) or Inventory (M) for the document | core        | L, tenancy (two businesses in one write: see section 6, Q4) |
| Group view                                               | O-08       | Report (M)                                                                   | core        | tenancy (group views), Pm                                   |
| Branch comparison                                        | O-09       | Report (M)                                                                   | core        | none                                                        |
| New business template                                    | O-10       | Organization (M) with Accounting (M) chart template and Auth (M) roles       | core        | L (opening chart), Pm                                       |

#### Sales and POS

| Feature                                      | Spec                   | Module(s) and owner                                                                                                                        | Core / pack                                             | Invariants                           |
| -------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------ |
| Customer details; walk-in for parts only     | S-01                   | Sales (F) with Party (F); the "NID required" rule is set by the pack                                                                       | core rule + **pack** (NID required for a vehicle sale)  | NID                                  |
| Chassis selection; two cashiers, one unit    | S-02, F-02             | Sales (F) calls Inventory (M) `serial_unit` reservation; chassis/engine/colour labels from Vehicle (M)                                     | core (serial unit) + **pack** (chassis, engine, colour) | Cc, St                               |
| Split payment, due, down payment             | S-03, S-04, A-03       | Sales (F) posts through Accounting (M); several partial payments, each with a receipt number                                               | core                                                    | L, Id                                |
| Discount control with approval               | S-05                   | Sales (F) + Approvals (platform)                                                                                                           | core                                                    | Pm                                   |
| Invoice: VAT line, BIN, print, PDF, sharing  | S-06, S-07, S-21, A-11 | Sales (F); number series in Accounting (M); sharing = "Share on WhatsApp" link; VAT line in release 1 if VAT registered (Q15, ADR 0001 D1) | core                                                    | L (gapless numbers, void not delete) |
| Delivery now or later; delivery with balance | S-08, S-11             | Sales (F) + Inventory (M) unit status + Approvals                                                                                          | core                                                    | St, Pm                               |
| Booking advance deducted on invoice          | S-09, B-02             | Sales (F) + Accounting (M) posting rule                                                                                                    | core                                                    | L, Li                                |
| Reservation expiry and reminder              | S-10                   | Sales (F) + Inventory (M); optional expiry, none by default; old bookings listed in the Action Center                                      | core                                                    | Cc                                   |
| Credit control, credit limit, BIN            | S-12, S-15             | Sales (F) reads Party (F) and Accounting (M) balances; Approvals; limit optional, default none, release 1                                  | core                                                    | L (balance from ledger), Pm          |
| Instalment and bank financing                | S-14                   | Sales (F); release 1                                                                                                                       | core                                                    | L                                    |
| Returns and refunds, credit note             | S-13, A-04             | Sales (F) + Inventory (M) + Accounting (M)                                                                                                 | core                                                    | L, St, Id, Pm                        |
| Salesperson on every sale                    | S-16                   | Sales (F); staff records from Organization (M)                                                                                             | core                                                    | none                                 |
| Hold sale                                    | S-17                   | Sales (F)                                                                                                                                  | core                                                    | none (a held sale posts nothing)     |
| Barcode scanning                             | S-18                   | Sales (F) frontend; codes in Product (M)                                                                                                   | core                                                    | none                                 |
| Shift and cash drawer                        | S-19                   | Sales (F) + Accounting (M) day close                                                                                                       | core                                                    | L, PL                                |
| Offline: queue or clear error                | S-20                   | Frontend (F)                                                                                                                               | core                                                    | Id (a replayed sale must not double) |

#### Booking and Preorder

| Feature                                     | Spec | Module(s) and owner                                     | Core / pack | Invariants          |
| ------------------------------------------- | ---- | ------------------------------------------------------- | ----------- | ------------------- |
| Booking with advance; unit Reserved         | B-01 | Sales (F) + Inventory (M) reservation + Accounting (M)  | core        | Cc, L, Li, Id       |
| Advance as liability                        | B-02 | Accounting (M) posting rule                             | core        | Li, L               |
| Convert to sale                             | B-03 | Sales (F)                                               | core        | L, Cc               |
| Cancel, refund or forfeit                   | B-04 | Sales (F) + Accounting (M)                              | core        | L, Li, Id           |
| Booking list, old bookings in Action Center | B-05 | Sales (F); Report (M); older than N days (setting)      | core        | none                |
| Amend booking                               | B-06 | Sales (F) + Inventory (M) (swap reservation atomically) | core        | Cc                  |
| Preorder; allocate on receipt               | B-07 | Sales (F) + Purchase (F) + Inventory (M)                | core        | Cc                  |
| Waiting list                                | B-08 | Sales (F)                                               | core        | Cc (offer in order) |
| Quotation                                   | B-09 | Sales (F)                                               | core        | none                |

"Model and colour" in this section is core wording if it reads as **product and variant**. See 1.3.

#### Purchase and Suppliers

| Feature                                   | Spec              | Module(s) and owner                                                     | Core / pack                                        | Invariants                   |
| ----------------------------------------- | ----------------- | ----------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------- |
| Supplier page and statement               | I-02, PU-09       | Party (F) + Purchase (F); balance from Accounting (M)                   | core                                               | L                            |
| Purchase order with statuses and approval | PU-01, PU-08      | Purchase (F) + Approvals                                                | core                                               | Pm                           |
| Goods receipt, partial, over-receipt      | PU-02, I-01, A-02 | Purchase (F) calls Inventory (M) and Accounting (M)                     | core                                               | St, L, Id, Co                |
| Motorcycle receipt (per-unit identity)    | PU-03, F-03       | Purchase (F) + Inventory (M) `serial_unit`; Vehicle (M) chassis/engine  | core (serial) + **pack** (chassis, engine, colour) | St, Co, Cc (unique)          |
| Supplier bill, three-way match            | PU-04             | Purchase (F)                                                            | core                                               | L                            |
| Supplier payment, allocations, advances   | PU-05, A-22       | Purchase (F) + Accounting (M)                                           | core                                               | L, Id                        |
| Payables aging, due alerts                | PU-06, A-21       | Purchase (F); Report (M) Action Center; supplier payables are release 1 | core                                               | L (totals = control account) |
| Purchase return, debit note               | PU-07, A-05       | Purchase (F) + Inventory (M) + Accounting (M)                           | core                                               | L, St, Id                    |
| Reorder suggestion to draft PO            | PU-10, I-03       | Purchase (F) reads Inventory (M)                                        | core                                               | none                         |
| Price history and rise flag               | PU-11             | Purchase (F)                                                            | core                                               | none                         |
| Direct purchase                           | PU-12             | Purchase (F)                                                            | core                                               | St, L, Id                    |
| Landed cost                               | F-10              | Purchase (F) + Inventory (M) cost; phase 2, slow money review           | core                                               | Co, L                        |

#### Inventory

| Feature                                      | Spec             | Module(s) and owner                                    | Core / pack                       | Invariants           |
| -------------------------------------------- | ---------------- | ------------------------------------------------------ | --------------------------------- | -------------------- |
| Stock by location, bin                       | I-10             | Inventory (M)                                          | core (wording: see 1.3)           | St                   |
| Low stock alert, out of stock, draft PO      | I-03, PU-10      | Inventory (M); Purchase (F) for the draft; rule (Q19)  | core                              | St, Ob               |
| Single stock figure, no-stock sale refused   | F-01, F-07, F-08 | Inventory (M)                                          | core                              | St, Cc               |
| Unique chassis and engine numbers            | F-03             | Inventory (M) serial number; Vehicle (M) engine number | core (serial) + **pack** (engine) | Cc                   |
| Goods receipt                                | I-01             | Purchase (F) → Inventory (M)                           | core                              | St, L                |
| Transfers: approval, In transit, discrepancy | I-07, I-09, O-06 | Inventory (M) + Approvals                              | core                              | St, Cc, L            |
| Stock adjustment with reason                 | I-04             | Inventory (M) + Approvals                              | core                              | St, L, Pm            |
| Physical count                               | I-05             | Inventory (M)                                          | core                              | St, L, Pm            |
| Damaged stock                                | I-06             | Inventory (M)                                          | core                              | St                   |
| Movement history                             | I-08             | Inventory (M)                                          | core                              | St                   |
| Stock value                                  | I-11             | Inventory (M)                                          | core                              | Co, Pm (cost hidden) |
| Stock aging                                  | I-12             | Report (M) reads Inventory (M)                         | core                              | none                 |
| Parts and model fit                          | I-13             | Vehicle (M)                                            | **pack**                          | none                 |
| Opening data import                          | F-09             | Platform importer (M; roadmap Phase 1); plan in 1.5    | core                              | St, L, Id            |
| Export                                       | I-14             | Platform export                                        | core                              | Pm                   |

#### Products

| Feature                     | Spec             | Module(s) and owner                                            | Core / pack                                                         | Invariants                     |
| --------------------------- | ---------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------ |
| Unit history timeline       | P-01, F-04, F-05 | Inventory (M) serial unit; reads Purchase/Sales                | core                                                                | Pm (cost, margin hidden)       |
| Unit status flow            | F-06             | Inventory (M)                                                  | core                                                                | Cc, St                         |
| Models: add, edit, archive  | P-05             | Product (M) as **product**; "model" is a pack label            | core                                                                | none                           |
| Variants and specifications | P-06             | Product (M) variants; model year and engine cc are pack fields | core + **pack**                                                     | none                           |
| Brand                       | P-10             | Product (M); brand per model, release 1                        | core                                                                | none                           |
| Price history               | P-07             | Product (M)                                                    | core                                                                | none (invoices copy the price) |
| Images and documents        | P-08             | Attachments (platform)                                         | core                                                                | none                           |
| Barcode and QR code         | P-09             | Product (M)                                                    | core                                                                | none                           |
| Warranty start on delivery  | P-03             | Service (F), triggered by Sales (F) delivery                   | core (warranty on a serial unit) + **pack** (chassis, engine shown) | none                           |
| Service book                | P-04             | Service (F)                                                    | core                                                                | none                           |

#### Service and Warranty

| Feature                                   | Spec         | Module(s) and owner                                       | Core / pack                                                                                 | Invariants                 |
| ----------------------------------------- | ------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------- |
| Job card (by unit, plate or phone), print | SV-01, SV-12 | Service (F)                                               | core (job on a serial unit or a customer item) + **pack** (chassis, number plate, odometer) | none                       |
| Job status flow                           | SV-02        | Service (F); ADR 0001 row 7                               | core                                                                                        | none                       |
| Warranty check by date and km             | SV-05        | Service (F); km rule from Vehicle (M)                     | core (date) + **pack** (km)                                                                 | L (warranty cost recorded) |
| Parts used                                | SV-03        | Service (F) → Inventory (M)                               | core                                                                                        | St, Cc                     |
| Service invoice                           | SV-04        | Service (F) → Sales payments + Accounting (M)             | core                                                                                        | L, Id                      |
| Estimate and approval                     | SV-08        | Service (F)                                               | core                                                                                        | none                       |
| Free service schedule                     | SV-07        | Service (F)                                               | core (schedule on a unit)                                                                   | none                       |
| Vehicles bought elsewhere                 | SV-06        | Service (F) + Party (F); unit record via Vehicle (M)      | **pack**                                                                                    | none                       |
| Supplier warranty claim                   | SV-09        | Service (F) + Purchase (F)                                | core                                                                                        | L                          |
| Service reminder (date or km)             | SV-10        | Crm (F); automatic WhatsApp is phase 3 (needs the worker) | core (date) + **pack** (km)                                                                 | Ob                         |
| Technician report                         | SV-11        | Report (M) reads Service (F); staff from Organization (M) | core                                                                                        | none                       |

#### Customers and CRM

| Feature                          | Spec        | Module(s) and owner                                                           | Core / pack                               | Invariants                                 |
| -------------------------------- | ----------- | ----------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------ |
| Customer profile, Documents tab  | CR-01, C-16 | Party (F) reading Sales, Service, Accounting; documents need `attachment` (M) | core                                      | NID, Pm                                    |
| Duplicate check and merge        | CR-02       | Party (F); ADR 0006                                                           | core                                      | NID, L (merge never rewrites posted lines) |
| Dues list and aging              | CR-03, A-21 | Party (F) / Sales (F) from ledger (M)                                         | core                                      | L                                          |
| Collection and money receipt     | CR-04       | Sales (F) payments + Accounting (M)                                           | core                                      | L, Id                                      |
| Follow-up and promise to pay     | CR-05       | Crm (F); broken promises to Action Center (M)                                 | core                                      | none                                       |
| Customer statement               | CR-07       | Party (F) from ledger                                                         | core                                      | L                                          |
| Leads                            | CR-08       | Crm (F)                                                                       | core ("product of interest", not "model") | none                                       |
| Message templates and log        | CR-09       | Crm (F); WhatsApp, not SMS; automatic sending is phase 3 (worker)             | core                                      | Ob                                         |
| Segments and campaigns           | CR-10       | Crm (F); needs the worker; phase 3                                            | core                                      | Ob                                         |
| Feedback and complaints          | CR-11       | Crm (F)                                                                       | core                                      | none                                       |
| Guarantor and relations          | CR-12       | Party (F) `party_relation`; release 1                                         | core                                      | none                                       |
| Data protection (NID, documents) | CR-06       | Party (F) + Activity record (M)                                               | core                                      | NID, Pm                                    |

#### Accounting

| Feature                                 | Spec               | Module(s) and owner                                                                                                                                                    | Core / pack | Invariants                              |
| --------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------- |
| Automatic posting, configurable rules   | A-01 to A-05, A-14 | Accounting (M) posting service; every module calls it                                                                                                                  | core        | L, Id                                   |
| Customer and supplier ledgers, advances | A-06, A-07, A-22   | Accounting (M); shown by Party (F)                                                                                                                                     | core        | L, Li                                   |
| Expenses with receipt and approval      | A-08, A-23         | Accounting (M) + Approvals + Attachments                                                                                                                               | core        | L, Id, Pm                               |
| Recurring expenses                      | not in spec        | Accounting (M)                                                                                                                                                         | core        | none (does not post by itself; see 3.3) |
| Salaries (entered on Reports)           | A-08               | Accounting (M) owns the write; Report (M) hosts the form; any number of entries per month                                                                              | core        | L, Id, Pm (salary hidden), PL           |
| VAT, Mushak 6.3, worksheet, withholding | A-09, A-25, A-26   | Accounting (M); Sales (F) invoice format; if VAT registered (Q15): the A-09 summary in release 1, Mushak 6.3 and worksheet phase 2 (ADR 0001 D1)                       | core        | L                                       |
| Payment methods                         | S-03, A-19         | Accounting (M): Cash, Bank, bKash, Card, entered by hand; system receipt number on every payment; external transaction id for Bank, bKash, Card; no bank or bKash link | core        | L, Id                                   |
| Invoice numbers, voiding                | A-11               | Accounting (M) number series; Sales (F) voids                                                                                                                          | core        | L                                       |
| Chart of accounts                       | A-16               | Accounting (M)                                                                                                                                                         | core        | L                                       |
| Manual journal with approval            | A-17               | Accounting (M) + Approvals                                                                                                                                             | core        | L, Pm, Id                               |
| Posted entries permanent; reversal      | A-18               | Accounting (M)                                                                                                                                                         | core        | L                                       |
| Cash book and day close                 | A-19, S-19         | Accounting (M); queue task F6 (F) builds the screen                                                                                                                    | core        | L, PL                                   |
| Month-end and year-end close            | A-24, A-12         | Accounting (M)                                                                                                                                                         | core        | PL, L                                   |
| Financial statements                    | A-20, A-13         | Accounting (M)                                                                                                                                                         | core        | L                                       |
| Aging                                   | A-21               | Accounting (M)                                                                                                                                                         | core        | L                                       |
| Bank reconciliation                     | A-15               | Accounting (M)                                                                                                                                                         | core        | L                                       |
| Budgets                                 | A-27               | Accounting (M)                                                                                                                                                         | core        | none                                    |

#### Reports

| Feature                                | Spec        | Module(s) and owner                              | Core / pack | Invariants |
| -------------------------------------- | ----------- | ------------------------------------------------ | ----------- | ---------- |
| Standard reports                       | RP-01       | Report (M) over each module's data               | core        | L, Pm      |
| Salary entry form                      | A-08        | UI in Report (M); API in Accounting (M). See 3.4 | core        | L, Pm      |
| Forecast                               | App. A §1   | Report (M). See 3.3                              | core        | none       |
| Daily closing report                   | RP-03       | Report (M) reads Accounting day close            | core        | L          |
| Filters and previous-period comparison | RP-05       | Report (M)                                       | core        | none       |
| Saved views                            | RP-07       | Report (M) `saved_view` (user-owned)             | core        | Pm         |
| Scheduled reports                      | RP-06       | Report (M); needs the worker                     | core        | Ob         |
| Unusual activity flags                 | RP-08       | Report (M)                                       | core        | none       |
| Target report                          | RP-09       | Report (M)                                       | core        | none       |
| Reports agree with the ledger          | RP-02, C-05 | Report (M); nightly check C-13                   | core        | L          |
| Hidden figures                         | RP-04, U-03 | Platform hidden-field rule (section 2.5)         | core        | Pm         |
| Export                                 | C-06        | Platform; CSV that opens in Excel (release 1)    | core        | Pm         |

#### Users and Roles

| Feature                                                | Spec       | Module(s) and owner                                      | Core / pack | Invariants  |
| ------------------------------------------------------ | ---------- | -------------------------------------------------------- | ----------- | ----------- |
| Users: invite, edit, deactivate                        | U-01       | Auth (M)                                                 | core        | Pm          |
| Roles at group, business or branch scope; custom roles | U-02, C-01 | Auth (M)                                                 | core        | Pm, tenancy |
| Hidden fields                                          | U-03       | Platform (M)                                             | core        | Pm          |
| Approval rule: no self-approval                        | U-05       | Approvals (platform)                                     | core        | Pm          |
| Login security                                         | U-04       | Auth (M)                                                 | core        | Pm          |
| Two-factor, required for Owner and Accountant          | U-07       | Auth (M); phase 3 (Q18)                                  | core        | Pm          |
| Sessions                                               | U-08       | Auth (M)                                                 | core        | Pm          |
| Login history and new-device alert                     | U-09       | Auth (M); the alert needs the worker or an in-app notice | core        | Pm, Ob      |
| Permission change log                                  | U-06       | Activity record (M)                                      | core        | Pm          |
| Staff without login, job title                         | U-10       | Organization (M) `staff` record with `designation`       | core        | none        |

### 1.3 Motorcycle wording that must not leak into the core

| Features file says                                                                                | In the core it is                                                              | The vehicle pack adds                                       |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Title "Yamaha Multi-Business ERP"                                                                 | no brand in code (ADR 0001 row 17)                                             | nothing                                                     |
| "A motorcycle sale needs ... national ID"                                                         | a product flag "sale needs an identified customer"; NID optional on Party      | sets the flag on vehicle products and makes NID required    |
| "Chassis selection", "only available chassis numbers"                                             | **serial unit** selection (`serial_unit.serial_no`)                            | labels serial as "chassis", shows engine and colour         |
| "Unique chassis and engine numbers"                                                               | unique `serial_no` per business                                                | `vehicle_unit.engine_no`, also unique per business          |
| "Motorcycle receipt"                                                                              | receipt of serial-tracked items, one row per unit                              | chassis/engine/colour columns and import mapping            |
| "Showroom" and "warehouse"                                                                        | **locations** with a type: `sales_floor`, `storage` (plus system types)        | nothing; "Showroom" is just a location name                 |
| "Models", "model year"                                                                            | **products** and **variants**                                                  | `vehicle_model` (brand, cc, model year) linked to a product |
| "Motorcycles at each unit's own cost"                                                             | serial-tracked items at unit cost (invariant 7)                                | nothing                                                     |
| "Parts and model fit"                                                                             | nothing                                                                        | `model_fit` (part product ↔ vehicle model)                  |
| Job card "by chassis, number plate", odometer, warranty "by kilometres", reminder "by kilometres" | job card on a serial unit or a customer's item; warranty and reminders by date | number plate, odometer reading, km limits                   |
| Leads "model of interest"                                                                         | product of interest                                                            | nothing                                                     |
| "Vehicles bought elsewhere"                                                                       | a customer item not sold by us (`serial_unit` with source `external`)          | the vehicle form                                            |

### 1.4 Conflicts between the features file and the spec (the spec wins unless we record otherwise)

Each needs a line in ADR 0001 ("Decision") before the affected PR.

| #   | Features file                                                                                                          | Spec                                                                                                                                                                                                     | Effect / recommendation                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Unit status flow ends at **Delivered**                                                                                 | F-06 (Critical) ends at **Registered**; P-01 timeline "through registration"; P-02 (Critical) BRTA tracking; S-08 "flags registration as pending"; D-05 "overdue registration"; go-live test 20.1 step 6 | **Proposed, to agree with Farhan.** Spec F-06 ends at Registered. Not decided until the owner answers Q2; no unit status code is written before then.                                                                                                   |
| C2  | Salary entry per staff member on the Reports page                                                                      | H-02 (salary posting) is in cancelled section 18; A-08 (Critical) still needs salaries as expenses; Appendix A §6 "headcount and payroll cost"                                                           | Build salary as an **Accounting expense** per staff record (U-10), not HR. "Headcount" = count of active staff records. No employee master beyond U-10.                                                                                                 |
| C3  | Conditional items listed as plain features: landed cost (F-10), Mushak 6.3 (A-25, A-26), multi-brand (P-10)            | Conditional; section 19.2 (cancelled) was how they became Critical                                                                                                                                       | **Answered by Moto Mart (section 1.5):** landed cost and Mushak 6.3 are phase 2; brand per model is release 1. Instalments, credit limit and guarantor are release 1 and no longer conditional. Record the answers in ADR 0001.                         |
| C4  | Pass-through charges are not mentioned                                                                                 | A-10 (Conditional), invariant 8 in CLAUDE.md                                                                                                                                                             | Moto Mart's current system shows registration as an item and a "processing fee" line on a bike sale (1.5). Any amount passed through to a third party is a liability, never revenue (invariant 8), whatever happens to section 7. What the fee is: Q17. |
| C5  | Branch transfer of cash: "both confirm"                                                                                | O-06: both sides **post to accounts**                                                                                                                                                                    | Transfers post due-to/due-from journals on send and receive.                                                                                                                                                                                            |
| C6  | Booking cancel: "refund or forfeit follows the set policy"                                                             | B-04: "is **posted to accounts**"                                                                                                                                                                        | Forfeit posts advance → other income; refund posts advance → cash.                                                                                                                                                                                      |
| C7  | Roles: Owner, Business Manager, Branch Manager, Accountant, Cashier                                                    | Same (C-01, D-03); but `docs/queue.md` M3 says **three** seeded roles (Owner, Manager, Cashier)                                                                                                          | The queue is narrower than both. **Recommend:** seed all five in M3; it is the same code.                                                                                                                                                               |
| C8  | Dashboard: no "customer lifetime value", no currency filter                                                            | Appendix A §5 has lifetime value; interface standards have a Currency filter                                                                                                                             | Small. Lifetime value = total invoiced per customer; the currency filter shows BDT only (ADR 0001 row 16).                                                                                                                                              |
| C9  | Activity record covers "delete"                                                                                        | C-11: financial documents are never deleted                                                                                                                                                              | Not a conflict: "delete" applies to master data only (a draft, a contact). Financial documents are voided.                                                                                                                                              |
| C10 | Features file omits C-04 backup, C-13 nightly integrity check, C-17 performance, C-19 owner data export, C-20 training | All Critical or Important in spec section 13                                                                                                                                                             | They still apply. C-13 and C-04 are in this plan; C-19 and C-20 are late items.                                                                                                                                                                         |
| C11 | Recurring expenses (amount and due day)                                                                                | Not in the spec (roadmap 5.8 has `recurring_entry`)                                                                                                                                                      | An addition, not a conflict. Kept small: a forecast input, no automatic posting.                                                                                                                                                                        |

### 1.5 Moto Mart decisions and findings (20 Nov)

Every line below is **confirmed by Munif, to confirm with the owner**, unless it says otherwise. Each needs a
line in ADR 0001 before the PR it affects (A1).

**Release phases.** These are Moto Mart's releases. They are not the build phases A to F (section 4.2) and not
the roadmap's phases. Not everything goes in release 1.

| Release   | What goes in                                                                                                                                                                                                                                                                                                                                                                                                  | Spec                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Release 1 | Instalments or bank loan; optional credit limit (default: no limit); guarantor; brand per model; cash and partial payments; stock by location; dues; supplier payables; locked invoices with the activity record; phone layout; "Share on WhatsApp" button; CSV export; if VAT registered (Q15): the invoice VAT line and the VAT summary; if Registered: P-02, the S-08 flag, D-05, go-live test 20.1 step 6 | S-14, S-15, CR-12, P-10, S-03, S-04, I-10, CR-03, PU-06, A-11, C-03, C-18, S-21, C-06; S-06, A-09 if registered; P-02, S-08, D-05 if Registered |
| Phase 2   | Landed cost, which needs the slow money review (invariant 7, costing); Mushak 6.3 with the VAT worksheet, after the accountant confirms VAT registration and rounding                                                                                                                                                                                                                                         | F-10, A-25, A-26                                                                                                                                |
| Phase 3   | A second business pack (which business first: Q21); automatic WhatsApp messages; two-factor sign-in                                                                                                                                                                                                                                                                                                           | O-11, CR-09, CR-10, SV-10, U-07                                                                                                                 |

**Conflict to settle (VAT).** The owner asked for Mushak 6.3, but the sale screenshot and the product list from
their current system show no tax. Mushak 6.3 applies only if the business is VAT registered (A-25). Until the
accountant answers Q15, nothing is built for VAT beyond what A8 already has. **If the business is VAT
registered, the VAT line on the invoice (S-06) and the VAT summary (A-09) are release 1**, and the C10
invoice work includes them; if not, neither is built. Only Mushak 6.3 and the VAT worksheet stay phase 2.
Recorded as deviation D1 in ADR 0001.

**Answers that change designs.**

1. **Salaries are not fixed.** Any number of entries per staff member per month, any amount, any date. The
   unique on `(staff_id, month)` is removed. The forecast uses each staff member's average over the last 3
   months (sections 3.3, 3.4).
2. **Reservations have no day limit.** Expiry is optional and off by default. The Action Center lists bookings
   older than a number of days set per business: a reminder only, never an automatic release (section 3.5).
3. **Messages go by WhatsApp, not SMS.**
   - Release 1: a "Share on WhatsApp" link button that opens WhatsApp with the text filled in. No API.
   - Automatic WhatsApp messages are phase 3. Check the Meta Business API rules and costs first (Q24).
4. **Payments are entered by hand.**
   - No automatic bank or bKash integration.
   - Methods are Cash, Bank, bKash and Card.
   - Every payment gets a **receipt number generated by the system**.
   - Bank, bKash and Card also require the **external transaction id**, typed in. Cash does not.
   - VAT per line is the working default, as built in A8. **Still to be confirmed by the accountant (Q16).**
5. **Reports export as CSV that opens in Excel.** Three defaults stay as recommended: a warehouse per branch
   (Q3), rent as a reminder (Q6), and day close per shift, then per branch (Q14).

**Findings from Moto Mart's current system.** It is a vendor-hosted product, not ERPNext; its name is to
confirm (Q23).

- **Two locations:** a bike showroom and a Service Center.
  - Recommended: two branches of one business, so customers are shared.
  - Open: do they keep separate books per location (Q22)?
- **Registration on a bike sale** appears as an item and a "processing fee" line.
  - Any amount passed through to someone else is a liability, never revenue (invariant 8, C4).
  - Open for the owner: what is the fee and where does it go (Q17)?
- **Staff have no logins, and they have job titles, not permission roles.** A staff record carries a
  `designation`, separate from the five roles. ADR 0008 already has the column.
- **Bike sales are paid in several partial payments,** each with a reference number. Here: a system receipt
  number on each, plus the external transaction id for Bank, bKash and Card.
- **A paid invoice can be edited later by a shared login** in their current system. This becomes a test case
  for locked invoices (C10): a posted or paid invoice refuses every edit, whoever asks.
- **Customer records hold many details and documents.**
  - The customer profile gets a **Documents** tab.
  - It needs the `attachment` table (section 2.10: restricted flag, every view logged), owned by Munif.
  - Farhan builds the tab after B14 merges, not in A10 (F1b).
  - Real customer data stays out of the repo and out of fixtures.
- **Migration from their system:**
  1. start **read-only** on the imported data;
  2. then a **parallel run** (spec 20.3; ADR 0001 row 9);
  3. merge duplicate supplier records **before** import;
  4. opening balances need a count on a fixed day.

---

## 2. Cross-cutting foundations (design once, before any module uses them)

Each item ends with the ADR to write. Numbers continue after 0007; renumber if another ADR lands first.

### 2.1 Tenancy schema, roles and the `erp_app` role

- **Already decided:** ADR 0005 (one transaction per request, `SET LOCAL` through `set_config(..., true)`), #19 (RLS functions), #8 (wrapper), ADR 0007 (active business per request).
- **Still to design:** the tables of the tree and of access.
  - `organization`, `legal_entity`, `business`, `branch`, plus `location` and `bin` (section 3.1), `number_series`.
  - Users and access: `app_user`, `role`, `permission`, `role_permission`, `user_scope (user, role, business_id?, branch_id?)`. No `membership` table: one organization per user (ADR 0008).
  - No tenant RLS on `app_user`, `role`, `role_permission`, `user_scope`: read unscoped by `AuthQuery`; admin screens filter on `organization_id`, proved by isolation tests (trade-off in ADR 0008 section 2). `staff` keeps RLS.
  - `staff` (U-10: people with or without a login), with a `designation` (job title) that is separate from the five roles (section 1.5).
  - RLS on the tree and on `staff`:
    - organization-level rows on `organization_id = (SELECT app_organization_id())`;
    - business rows on `business_id = ANY ((SELECT app_business_ids())::uuid[])`;
    - branch rows add `branch_id = ANY ((SELECT app_branch_ids())::uuid[])`.
  - The five spec roles seeded per organization, with permission codes in `shared/src/utils/permissions.ts`.
  - Group-wide roles are Owner only. No role sees another organization.
- **`erp_app`:** created by `docker/postgres/init/01-app-role.sh` (exists), never owner, never BYPASSRLS. Each migration revokes `DELETE` from `erp_app` (the role script grants `DELETE` by default).
- **ADR 0008 "Organization and access schema"** (M). Touches tenancy, permissions, migrations.

### 2.2 Activity record (audit)

- **One append-only table, `audit_event`:**
  - Columns: `id`, `organization_id`, `business_id` (nullable for organization-level events such as a role change), `branch_id`, `actor_user_id`, `action` (`create`, `edit`, `delete`, `void`, `approve`, `reject`, `status_change`, `view_sensitive`, `denied`), `entity_type`, `entity_id`, `before` JSONB, `after` JSONB, `reason`, `request_id`, `ip`, `occurred_at`.
  - A trigger refuses every `UPDATE` and `DELETE`.
  - Later: partition by month (roadmap 5.1).
- **One write path.**
  - A businessLogic class `ActivityRecorder` (behind `IActivityRecorder`, wired in `createManagers`) calls one dal `AuditQuery.append()`.
  - Managers call it in the **same request transaction** as the change, so the change and its record commit or roll back together.
  - Denied actions use ADR 0005's second short transaction.
  - **Not database triggers on every table:** triggers cannot see the reason, the approval or the business meaning, and they would copy the NID ciphertext and salary values into a log that everyone with "view log" can read.
- **Relation to the ledger and stock movements.**
  - Posted journals and stock movements are already immutable and carry who, when and the source document.
  - The audit record stores **one event per posting** (`journal.posted`, `stock.moved`) with the ids and a short summary, **not** a copy of the lines.
  - A reversal is its own event pointing at the original.
  - The Activity Log page joins to the journal or movement for detail.
- **What else goes here:**
  - **Permission change log (U-06):** events on `role`, `role_permission`, `user_scope`. No separate table.
  - **Login history (U-09)** stays in Auth's `login_attempt` and `session` tables. Login is public and runs outside any tenant scope (ADR 0005), so it cannot write a tenant-scoped audit row. The Activity Log page shows both.
  - **NID views (CR-06)** write `view_sensitive` events.
- **Redaction:** `before` and `after` pass through the same sensitive-field rule as the API (2.5). Salary and cost values in an event are shown only to roles that may see them. The NID is never written, only "NID changed".
- **ADR 0009 "Activity record"** (M). Touches permissions, tenancy, migrations; the ledger relation must be agreed.

### 2.3 Search by part

- **Per module:** every list route accepts `search` (`GET /v1/parties?search=`, as `partyListQuerySchema` already has), searching that module's own columns (name, Bangla name, phone, code, document number).
- **Across parts:**
  - `GET /v1/search?q=&parts=parties,sales,inventory`, on a `SearchController` in api that calls each requested module's Manager through a small `ISearchable { search(q, limit) }` contract (api → businessLogic only).
  - It runs as **one read-only tenant scope**, so RLS limits rows to the caller's businesses and branches.
  - Parts the caller has no `<module>.*.view` permission for are skipped, not errors.
  - It returns at most N hits per part with the document type, number, label and a link.
- **Database:**
  - `pg_trgm` GIN indexes on the searched text columns.
  - Bangla text needs a test that trigram matching works on Bangla input before we rely on it.
  - Phone search normalises to E.164 first.
- **Never searchable:** hidden fields (cost, salary) and the NID. An exact NID lookup is a separate, permission-checked route on `nid_hash` that writes a `view_sensitive` event (ADR 0006).
- **ADR 0010 "Search"** (F: Party is the first user). Touches permissions, NID.

### 2.4 Notifications and the Action Center

- **Outbox:** every module writes domain events (`invoice.posted`, `stock.low`, `discount.approved`, `day.closed_with_variance`) to `outbox_event` in the same transaction (invariant 10). Nothing relays them until the worker exists (ADR 0003).
- **Without the worker:**
  - **In-app notifications** are rows in `notification (user_id, type, payload, read_at)`, written in the same transaction by a `Notifier` behind an interface, for event-driven alerts (void, large discount, cash variance).
  - WhatsApp (not SMS, section 1.5) and email wait for the relay. Until then, a "Share on WhatsApp" link button sends by hand.
- **Action Center items are of two kinds.**
  - **Derived:** low stock, overdue dues, bills due, sold not delivered, aged stock, transfer mismatch, bookings older than the business's setting (and near-expiry ones when an expiry is set), broken promises, VAT due.
    - Each module exposes a read query for its exception list.
    - Nothing is stored until someone acts, so the list is always current and needs no worker.
  - **Workflow state** (D-04: assign, due date, resolve, history).
    - The first action on an item creates `action_item (kind, source_type, source_id, business_id, branch_id, assignee, due_date, status)`, unique on `(kind, source_id)`.
    - It gets an append-only `action_item_event` history.
    - Pending approvals come from `approval_request` (2.6).
- **ADR 0011 "Outbox, notifications and the Action Center"** (M). Touches the outbox invariant.

### 2.5 Hidden fields (cost, profit, salary)

- **One rule, one place.**
  - Shared Zod response schemas tag sensitive fields with metadata (for example `.meta({ sensitive: 'cost' })`; confirm the Zod 4 metadata API with Context7 when writing the ADR).
  - A registry maps each tag to a permission: `product.cost.view`, `report.profit.view`, `accounting.salary.view` (the codes ADR 0008 defines).
- **Where it runs:**
  - The api route wrapper (#8) passes every response body through `redactSensitive(body, schema, permissions)` before sending.
  - Exports are built from the same API responses, so they get the same redaction.
  - Screens show what the API sends, and hide a column when the field is absent.
- **Reports** that compute profit still run the query, but the response drops the field.
  - A report whose _only_ purpose is a hidden figure needs the permission to open at all.
- **Tests:**
  - one generic test per tagged field: without the permission, the field is absent in JSON and in export;
  - a lint or test that every schema with a `cost`, `profit`, `margin` or `salary` key carries the tag.
- **ADR 0012 "Permissions and hidden fields"** (M). Touches permissions.

### 2.6 Approval rules

- **Tables:**
  - `approval_rule (business_id, kind, threshold, approver_permission)`;
  - `approval_request (business_id, branch_id, kind, subject_type, subject_id, amount, reason, requested_by, status, decided_by, decided_at, rule_snapshot)`.
  - A database check refuses `decided_by = requested_by` (U-05), and the Manager checks the same rule first.
- **Kinds:** `discount`, `purchase_order`, `expense`, `delivery_with_balance`, `credit_over_limit`, `overdue_credit_sale`, `stock_adjustment`, `transfer`, `manual_journal`, `return`.
  - Each kind is a class behind `IApprovalPolicy` (open/closed: a new kind is a new class, not a `switch` branch).
- **Two modes, same table:**
  - **Pending:** the document waits in a status until approved.
  - **Counter override:** at the POS, a manager signs in on the cashier's screen and approves on the spot. This is still a separate user, so self-approval is impossible.
  - Build pending first.
- **ADR 0013 "Approvals"** (F drafts it; Sales discount is the first user). Touches permissions.

### 2.7 Idempotency-Key

- **Table:** `idempotency_key (business_id, key, route, request_hash, status_code, response_body, created_at)`, unique on `(business_id, key)`.
- **Same transaction:** it is written inside the request transaction (ADR 0005 Q6), so a rollback removes it and a retry runs again cleanly.
- **Two identical requests at once:** the second insert waits on the unique index. When the first commits, the second sees the conflict and returns the stored response (ADR 0005 Q7).
- **Errors:**
  - same key with a different body → `IDEMPOTENCY_KEY_REUSED`, 422;
  - a missing key on a route marked `{ idempotent: true }` → 400.
- **Who applies it:** the route wrapper. Every route whose permission code is marked as money or stock must carry the option, and a test checks it.
- **Clean-up:** old keys are deleted by the worker later; the table is small until then.
- **ADR 0014 "Idempotency"** (F; needed before F3). Touches idempotency, migrations.

### 2.8 Calls between modules inside businessLogic

The layer rules cover api → businessLogic → dal, but not **Sales calling Accounting and Inventory**, which
every posting needs. Proposal:

- Each module that offers a service to others publishes a small interface in its own folder, for example:
  - `IPostingService.post(journalDraft)` (Accounting);
  - `IStockService.move(movements)` and `IUnitReservation.reserve(unitId, ref, until)` (Inventory);
  - `IApprovalService.require(kind, subject, amount)`.
- `createManagers` builds those services and injects them into consumers.
- All of it runs in the **same** request transaction, because the scope is ambient (ADR 0005), so an invoice, its journal and its movements commit together (invariant 4).
- A consumer never imports another module's Query.
- **ADR 0015 "Module contracts: posting and stock services"** (M with F; published before Sales and Purchase code, as roadmap Phase 2 asks: "Munif publishes the stock engine interface").

### 2.9 Language, money, dates, phone

- **Money:** decimal arithmetic in `shared/src/utils/money.ts`, using BigInt paisa (no float, no new dependency) with property tests: add, subtract, multiply by a quantity, percentage, allocate with remainder, compare.
  - Needed before the journal engine (M4).
- **Phone:** `bdPhoneSchema` normalising `01XXXXXXXXX` and `+8801XXXXXXXXX` to E.164, rejecting non-Bangladesh mobile prefixes (C-09).
- **Dates:** `formatDateTimeBD` (in #10). Add a business-date helper ("today in Asia/Dhaka"), because day close, aging and the period lock all depend on the Dhaka date, not the UTC date.
- **i18n:** the en/bn same-keys test exists. Add a test that `formatMoneyBDT` and dates render in Bangla digits when the locale is `bn`.
- **ADR:** none needed (small, test-covered utilities). One shared PR each.

### 2.10 Export, print and attachments

- **Export:**
  - CSV that opens in Excel (decided, section 1.5) and PDF of **lists** are made in the browser from the API response, which is already redacted.
  - A size cap uses ADR 0005's over-limit error. Larger exports wait for the worker.
- **Print:** documents (invoice, money receipt, job card) use print stylesheets with the business logo and details. Per-business templates (C-15) are deferred with document templates (ADR 0003).
- **Attachments:**
  - Table: `attachment (business_id, subject_type, subject_id, object_key, mime, size, sha256, uploaded_by, restricted)`.
  - Upload and download use short-lived presigned MinIO URLs.
  - `restricted` documents (NID copies) need a permission, and every download writes a `view_sensitive` event.
  - First user: the customer profile's **Documents** tab (section 1.5). Munif owns the table and routes; Farhan owns the Party screens (A10, F1b).
- **ADR 0016 "Attachments and exports"** (M). Touches permissions, NID.

---

## 3. Features that need a design decision

### 3.1 Stock by location

- **Tables:**
  - `location (business_id, branch_id, name, type)`, where `type` is one of `sales_floor`, `storage`, `in_transit`, `damaged`, `quarantine`;
  - `bin (location_id, code)`.
  - "Showroom" and "Warehouse" are ordinary names on `sales_floor` and `storage` locations.
  - Each branch gets one `in_transit` and one `damaged` location automatically.
- **Truth:** `stock_movement (product_id, variant_id?, serial_unit_id?, location_id, bin_id?, qty_delta, unit_cost, source_type, source_id, reason, created_by, occurred_at)`.
  - It is append-only (trigger).
  - **On hand per location = `sum(qty_delta)` grouped by product and location** (invariant 3).
- **Cache:** `stock_balance (product, location, bin, on_hand, reserved)`.
  - It is updated in the same transaction by an atomic conditional `UPDATE ... SET on_hand = on_hand + $d WHERE ... AND on_hand + $d >= 0`. Zero rows means "not enough stock", which blocks negative stock (F-08, ADR 0001 row 13).
  - The nightly integrity check (C-13) compares it with the movements, and it can be rebuilt from them.
- **The three columns on screen:**
  - **Showroom** = sum over `sales_floor` locations;
  - **Warehouse** = sum over `storage` locations;
  - **Total** = all sellable types.
  - `damaged`, `quarantine` and `in_transit` are shown separately and are **not sellable** (I-06).
- **Transfer (I-07):**
  1. Request.
  2. Approve (2.6).
  3. **Send:** movements out of the source location and into the sending branch's `in_transit` location, in one transaction. Status **In transit**; the In transit figure is that location's balance.
  4. **Receive:** movements out of `in_transit` and into the destination with the received quantity.
  5. **Any difference** moves to a `discrepancy` reason and raises a "transfer mismatch" Action Center item.
  6. **Between branches**, both sides also post due-to/due-from journals (C5).
- **Serial units:** one movement of ±1 with `serial_unit_id`, and `serial_unit.location_id` updated in the same transaction.
- Invariants: St, Cc, L (transfers between branches).

### 3.2 Low stock alert

- **Setting:** `reorder_rule (business_id, branch_id, product_id, reorder_level, reorder_qty, set_by, set_at)`, per branch. A location-level rule can come later if asked.
- **The status of each item:**
  - **Available** = sellable on hand − reserved.
  - **Low** when `0 < available ≤ reorder_level`.
  - **Out of stock** when `available ≤ 0`, listed separately and not counted as Low.
- **"Basis for Low" on screen:** "Available 3 = on hand 5 − reserved 2. Reorder level 4, set by Rahim on 12/11/2026. Suggested order: 10."
- **Alert:**
  - When a movement takes available from above the level to at or below it, the Inventory service writes `stock.low` to the outbox and an in-app notification in the same transaction.
  - The Action Center list is the derived query (2.4), so it is right even when no event fired (for example after a level change).
- **Draft purchase order in one step:**
  - `POST /v1/purchase-orders/from-reorder` with the product ids, owned by Purchase (F).
  - It reads suggestions through Inventory's `IReorderSource` (2.8) and creates a **Draft** order.
  - Nothing is approved or sent automatically.
- Invariants: St, Ob.

### 3.3 Cash forecast

- **Read-only, in Report (M).** It posts nothing.
- **Per business and branch, for the next 1 to 3 months, in weekly buckets:**
  - **Opening:** today's cash, bank and bKash balances from the ledger.
  - **Plus expected collections:** open invoice dues by due date; a promise-to-pay date (CR-05) replaces the due date when one exists.
  - **Minus supplier bills due**, by due date.
  - **Minus recurring expenses:** `recurring_expense (business_id, branch_id, account_id, label, amount, due_day, starts_on, ends_on, active)` in Accounting (M).
  - **Minus salaries:** for each active staff member, the average monthly total of their salary entries over the last 3 months (3.4), on a due day set in the recurring settings. Salaries are not fixed (section 1.5), so one entry is not a guide.
- **A recurring expense never posts by itself** (there is no worker, and an unattended posting would break "a person posts"). On its due day it appears in the Action Center as "Rent due"; paying it is a normal expense entry.
- **Each line on screen opens its source:** the invoices, bills or settings behind it.
- Overdue dues are shown as a separate "uncertain" line, not mixed into expected cash.
- Invariants: none written; it must read posted balances only (L).

### 3.4 Salary entry on the Reports page

- **Who owns what:**
  - **Report (M) owns only the screen:** a form on the Reports page.
  - **Accounting (M) owns the write:** `POST /v1/accounting/salary-entries`, with `SalaryEntry` in `accounting.schema.ts`.
  - The Report module stays read-only, so no layer or module boundary is crossed.
- **The entry:** `salary_entry (business_id, branch_id, staff_id, entry_date, amount, paid_from_account_id | accrued, journal_id, created_by)`.
  - Salaries are not fixed (section 1.5): **any number of entries per staff member per month**, any amount, any date. There is **no unique on `(staff_id, month)`**; the month is the month of `entry_date`.
  - A correction is a reversal plus a new entry, never an edit.
- **Posting** (in one transaction):
  - debit Salaries expense, credit Cash/Bank;
  - or credit Salaries payable when accrued, cleared later by a payment.
- **Rules:**
  - Idempotency-Key required.
  - The period lock blocks an `entry_date` in a period that is already closed (invariant 9).
- **Permissions:**
  - `accounting.salary.create` to enter;
  - `accounting.salary.view` to see amounts, in reports, exports and the activity record (2.5).
  - Without it, profit reports still show net profit but not the salary line (spec RP-04 lists salary, not net profit, as hidden).
- Invariants: L, Id, PL, Pm.

### 3.5 Reservation, booking and advance

- **Who owns what:**
  - **Inventory (M)** owns `serial_unit (business_id, branch_id, product_id, serial_no, location_id, status, reserved_ref, reserved_until, cost, supplier_party_id, receipt_ref, version)`.
    - Statuses: `in_stock`, `reserved`, `sold_not_delivered`, `delivered`, plus `returned` if C1 and ADR 0001 row 6 keep it.
  - **Vehicle pack (M)** adds `vehicle_unit (serial_unit_id, engine_no, colour, model_year)`.
  - **Sales (F)** owns `booking`, `invoice` and `payment`.
- **Reserving, so that two cashiers cannot take one unit (F-02, invariant 6):**
  ```sql
  UPDATE serial_unit
     SET status = 'reserved', reserved_ref = $booking, reserved_until = $until, version = version + 1
   WHERE id = $unit AND business_id = ANY (...)
     AND (status = 'in_stock' OR (status = 'reserved' AND reserved_until < now()))
  RETURNING id;
  ```
  Zero rows means the other cashier won. Sales returns `UNIT_NOT_AVAILABLE` (409) with "This unit was just reserved or sold. Pick another."
- **Selling:** the same single `UPDATE`, allowing `status = 'reserved' AND reserved_ref = $this_booking`.
  - **No read-then-write anywhere.**
  - A test runs two sales in parallel transactions on one unit and expects exactly one success.
- **Expiry (S-10) is optional, and off by default** (section 1.5: no day limit).
  - `reserved_until` is null unless someone sets an expiry. A null never lapses: `reserved_until < now()` is not true for a null, so the `UPDATE` above needs no change.
  - When an expiry is set, it is lazy. A reservation past `reserved_until` counts as available in the availability query and in the conditional `UPDATE` above, and the booking shows **Lapsed** when read. Near-expiry bookings (within 24 h) appear in the Action Center.
  - **Old bookings:** the Action Center lists bookings older than a number of days set per business. It is a reminder only; nothing is released automatically.
  - The worker can tidy statuses later.
- **Money (B-02, invariant 8), each posted through `IPostingService`:**

  | Event              | Debit             | Credit                            |
  | ------------------ | ----------------- | --------------------------------- |
  | Advance received   | Cash/Bank         | **Customer advances** (liability) |
  | Applied on invoice | Customer advances | Receivable                        |
  | Refund on cancel   | Customer advances | Cash/Bank                         |
  | Forfeit            | Customer advances | Other income                      |
  - Never Revenue at booking.
  - Each money POST takes an Idempotency-Key.

- **Booking by product and variant only** (no specific unit): no unit is reserved. B-07 and B-08 allocate on receipt, in queue order, again by the conditional `UPDATE`.
- **Amend (B-06):** release and reserve in one transaction. If the new reservation fails, the old one stays.
- Invariants: Cc, L, Li, Id, St.

---

## 4. Build order

### 4.1 Dependencies

1. **Merge the open stack first:** #19 → #8 → #9 (tenancy); #14, #16 (ADRs); #10 → #11, #12, #13 (UI on mocks).
2. **Organization and Auth before everything:** the tenancy tables, users, roles, scopes, the real `authMiddleware` and `tenantMiddleware`, and the isolation runner (M2, M3, M5).
3. **Platform foundations before the first module that needs them:**
   - activity record before any edit route;
   - idempotency before any money or stock POST;
   - hidden fields before any cost or salary field;
   - approvals before discounts, POs, expenses and adjustments;
   - module contracts (2.8) before Sales and Purchase.
4. **Party** after Organization (its tables point at `business`).
5. **Accounting core** (accounts, journal, lines, triggers, number series, period lock) before any document that posts.
6. **Product, then Inventory** (locations, movements, serial units) **before Sales and Purchase.**
7. **Sales payments and dues** (F3, F5) after Accounting core; **day close** after payments.
8. **Purchase** after Inventory and Accounting.
9. **Service** after Inventory and Sales payments.
10. **Crm** after Party (leads and follow-ups need no stock).
11. **Report and the Action Center** after the modules they read; the dashboard runs on mocks until then (#13).
12. **Vehicle pack** after Inventory's `serial_unit` (it extends it).
13. **Moto Mart's release phases (section 1.5)** set what ships, not the order above. Release 1 items come first within each phase below. Landed cost, Mushak 6.3 and the VAT worksheet (phase 2) and automatic WhatsApp, two-factor and a second business pack (phase 3) wait until release 1 is live.

### 4.2 Phases

| Phase | Goal                                                                                                                                   | Roughly matches        |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| A     | Interview slice by 29 Nov: tenancy, login, parties, dues, payments posting a journal, day close, dashboard (the `docs/queue.md` tasks) | roadmap Phase 1 (thin) |
| B     | Foundations finished: activity record, hidden fields, approvals, idempotency, search, outbox, attachments, money utility               | roadmap Phase 1        |
| C     | Catalogue, inventory, POS sales and payments, booking                                                                                  | roadmap Phase 2        |
| D     | Purchasing and full accounting                                                                                                         | roadmap Phase 3        |
| E     | Service and warranty; vehicle pack screens                                                                                             | roadmap Phase 4        |
| F     | CRM, reports, dashboard on real data, Action Center workflow                                                                           | roadmap Phase 5        |

---

## 5. PRs per phase

Rules: one task, one PR, under about 400 changed lines. **Shared code** (`shared`, `main.prisma` and
migrations, `app.ts`, every `index.ts`, the app shell) goes in its own small PR, merged first, reviewed by
both. Branches are `feat/<slug>` off your own `dev-<name>`. "Tests first" lists the tests that are written
and seen failing before the code.

### Phase A: interview slice (now to 29 Nov)

| #    | Title                                                                               | Owner                 | Branch                      | Files and layers                                                                                                                                                                                                                                                                       | Tests first                                                                                                                                                                                                                                                  | ADR                |
| ---- | ----------------------------------------------------------------------------------- | --------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| A0   | `docs(repo): pages and features reference`                                          | M                     | `feat/pages-features-ref`   | `docs/reference/pages-and-features.md` only                                                                                                                                                                                                                                            | none                                                                                                                                                                                                                                                         | no                 |
| A1   | `docs(adr): 0001 rows for the features file conflicts`                              | M                     | `feat/adr-0001-features`    | ADR 0001 (C1 to C11 and the Moto Mart decisions in 1.5)                                                                                                                                                                                                                                | none                                                                                                                                                                                                                                                         | is an ADR edit     |
| A2   | `docs(adr): 0008 organization and access schema`                                    | M                     | `feat/adr-0008-org-access`  | ADR only                                                                                                                                                                                                                                                                               | none                                                                                                                                                                                                                                                         | **yes**            |
| A3   | `feat(organization): organization, legal entity, business, branch tables with RLS`  | M                     | `feat/org-tables`           | `organization.prisma`, migration, `sql/rls/organization.sql`, `OrganizationQuery`, DTOs, int tests                                                                                                                                                                                     | RLS: business X cannot read Y; FORCE RLS on; `erp_app` cannot DELETE; `erp_app` cannot INSERT a business or branch (provisioning only); deactivated branch refuses a write                                                                                   | 0008               |
| A4   | `feat(auth): users, roles, scopes tables; five seeded roles`                        | M                     | `feat/auth-tables`          | `auth.prisma`, migration, seed, `permissions.ts` (shared PR first, A4a)                                                                                                                                                                                                                | a user sees only own scopes; admin Queries return nothing of another organization; seeded roles have the agreed codes                                                                                                                                        | 0008               |
| A5   | `feat(auth): login with argon2id, session cookie, real authMiddleware`              | M                     | `feat/auth-login`           | api middleware, `AuthController/Manager/Query`, `auth.schema.ts`                                                                                                                                                                                                                       | wrong password counts a `login_attempt`; lockout after N; cookie flags; 401 shape                                                                                                                                                                            | 0008               |
| A6   | `feat(organization): tenantMiddleware reads X-Business-Id against user scopes`      | M                     | `feat/tenant-middleware`    | `tenantMiddleware.ts`, `AuthQuery`, route kinds from ADR 0007                                                                                                                                                                                                                          | forged business id → same 403 as unknown id; branch outside scope refused                                                                                                                                                                                    | 0007               |
| A7   | `test(api): isolation runner executes ISOLATION_CASES against Postgres`             | M                     | `feat/isolation-runner`     | `api/test/isolation/*`                                                                                                                                                                                                                                                                 | the runner fails a route with no case; a deliberate leak fails                                                                                                                                                                                               | no                 |
| A8   | `feat(shared): money arithmetic in paisa with property tests`                       | M                     | `feat/money-math`           | `shared/src/utils/money.ts` (+ test)                                                                                                                                                                                                                                                   | add/sub/mul/allocate never lose a paisa; round-trip string ↔ paisa                                                                                                                                                                                           | no                 |
| A9   | `docs(adr): 0014 idempotency`                                                       | F                     | `feat/adr-0014-idempotency` | ADR only                                                                                                                                                                                                                                                                               | none                                                                                                                                                                                                                                                         | **yes**            |
| A10  | `feat(party): F1b customer list and profile screens on mock data`                   | F                     | `feat/party-screens`        | `features/party`, `partyService` mock, i18n                                                                                                                                                                                                                                            | list renders states; Bangla names; no NID in list                                                                                                                                                                                                            | 0006               |
| A10a | `feat(dal): BaseDTO reads Prisma Decimal as money and quantity strings`             | F (review: M)         | `feat/dto-decimal-strings`  | `dal/dto/BaseDTO.ts` (+ unit test). Money with `toFixed(2)`, quantity with `toFixed(3)`; no DTO calls `Decimal.toString()`, because `Decimal('12500.00').toString()` is `"12500"`, which `parseMoney` refuses. Shared code: its own small PR, merged before A11 (`party.credit_limit`) | `"12500.00"` and `"0.00"` read from a Decimal round-trip through `parseMoney`                                                                                                                                                                                | no                 |
| A11  | `feat(party): party tables with RLS, create, edit, duplicate phone warning` (F2)    | F                     | `feat/party-tables`         | `party.prisma`, migration, Party Query/Manager/Controller/routes, isolation cases                                                                                                                                                                                                      | composite FK refuses a cross-business link; duplicate phone warns; NID never in list JSON                                                                                                                                                                    | 0006               |
| A12  | `docs(adr): 0015 module contracts: posting and stock services`                      | M (+F)                | `feat/adr-0015-contracts`   | ADR only                                                                                                                                                                                                                                                                               | none                                                                                                                                                                                                                                                         | **yes**            |
| A13  | `feat(accounting): accounts, journals, lines; balanced and immutable triggers` (M4) | M                     | `feat/journal-engine`       | `accounting.prisma`, migration, `sql/triggers/journal.sql`, `AccountingQuery`, `PostingService`                                                                                                                                                                                        | unbalanced journal fails at commit; UPDATE/DELETE of posted journal fails; reversal points at original; 2 parallel posts                                                                                                                                     | 0015               |
| A14  | `feat(platform): idempotency_key table and wrapper option`                          | F                     | `feat/idempotency`          | migration, dal Query, wrapper option `{ idempotent: true }` (shared PR)                                                                                                                                                                                                                | same key twice returns first response; parallel same key → one row; different body → 422                                                                                                                                                                     | 0014               |
| A14a | `feat(accounting): number_series with gapless receipt numbers`                      | M                     | `feat/number-series`        | `accounting.prisma`, migration, `NumberSeriesQuery`, a numbering service other modules call (split out of accounting core, 4.1 item 5)                                                                                                                                                 | two parallel payments get two consecutive numbers (row lock, invariant 6); a rolled-back payment leaves no gap; business X never uses Y's series                                                                                                             | add to 0015 or own |
| A15  | `feat(sales): dues and record a payment with Idempotency-Key` (F3), after A14a      | F                     | `feat/dues-payment`         | Sales payment tables, routes, isolation cases                                                                                                                                                                                                                                          | payment with same key twice = one payment; branch-scoped write needs `X-Branch-Id`; several partial payments on one due, each with its own system receipt number; Bank, bKash and Card refused without an external transaction id; Cash accepted without one | 0014, 0015         |
| A16  | `feat(sales): payments post a balanced journal` (F5)                                | F                     | `feat/payment-posting`      | Sales Manager calls `IPostingService`                                                                                                                                                                                                                                                  | payment and journal commit together; failure in posting rolls back the payment                                                                                                                                                                               | 0015               |
| A17  | `feat(accounting): daily closing: expected vs counted, variance reason, lock` (F6)  | F (screen) + M (lock) | `feat/day-close`            | Accounting day-close table and lock; Sales screen                                                                                                                                                                                                                                      | variance needs reason; posting into a closed day fails                                                                                                                                                                                                       | add to 0015 or own |
| A18  | `feat(report): owner dashboard on real dues and collections` (M6)                   | M                     | `feat/dashboard-real`       | Report Query (read-only multi-business route), swap mock service                                                                                                                                                                                                                       | totals equal the ledger; owner of org A sees nothing of org B                                                                                                                                                                                                | no                 |
| A19  | `feat(platform): sample data script` (F4)                                           | F                     | `feat/sample-data`          | `dal/prisma/seeds/*`                                                                                                                                                                                                                                                                   | seed runs twice without duplicates; no real names                                                                                                                                                                                                            | no                 |

The slice does not need the full activity record, approvals or hidden fields. If it ships before Phase B,
the demo must say so (section 7).

### Phase B: foundations finished

| #   | Title                                                                          | Owner | Branch                      | Files and layers                                                             | Tests first                                                                              | ADR     |
| --- | ------------------------------------------------------------------------------ | ----- | --------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------- |
| B1  | `docs(adr): 0009 activity record`                                              | M     | `feat/adr-0009-activity`    | ADR                                                                          | none                                                                                     | **yes** |
| B2  | `feat(organization): audit_event table, ActivityRecorder, append-only trigger` | M     | `feat/audit-event`          | migration, `AuditQuery`, businessLogic recorder (shared `index.ts` PR first) | UPDATE/DELETE refused; event rolls back with its change; denied action survives rollback | 0009    |
| B3  | `feat(organization): Activity Log page with filters`                           | M     | `feat/activity-log-ui`      | route, frontend page                                                         | filters by user/page/action/date; salary values hidden without permission                | 0009    |
| B4  | `docs(adr): 0012 permissions and hidden fields`                                | M     | `feat/adr-0012-hidden`      | ADR                                                                          | none                                                                                     | **yes** |
| B5  | `feat(shared): sensitive-field tags and redaction in the route wrapper`        | M     | `feat/redaction`            | shared registry, wrapper                                                     | tagged field absent without permission; untagged `cost` key fails the lint test          | 0012    |
| B6  | `feat(auth): requireRole checks permission codes for the active scope`         | M     | `feat/require-role`         | `roleMiddleware.ts`                                                          | branch manager of branch 1 refused on branch 2 by URL (spec 20.2 test 6)                 | 0012    |
| B7  | `docs(adr): 0013 approvals`                                                    | F     | `feat/adr-0013-approvals`   | ADR                                                                          | none                                                                                     | **yes** |
| B8  | `feat(platform): approval_rule, approval_request, self-approval check`         | F     | `feat/approvals`            | migration, Query, `ApprovalService`, routes                                  | creator cannot approve (DB and Manager); rule snapshot kept                              | 0013    |
| B9  | `docs(adr): 0010 search`                                                       | F     | `feat/adr-0010-search`      | ADR                                                                          | none                                                                                     | **yes** |
| B10 | `feat(party): list search with pg_trgm; GET /v1/search facade`                 | F     | `feat/search`               | migration (index), Party Query, api SearchController                         | Bangla name found; other business never returned; NID never matched                      | 0010    |
| B11 | `docs(adr): 0011 outbox, notifications, Action Center`                         | M     | `feat/adr-0011-outbox`      | ADR                                                                          | none                                                                                     | **yes** |
| B12 | `feat(platform): outbox_event and notification tables, Notifier`               | M     | `feat/outbox`               | migration, dal, businessLogic                                                | event rolls back with its change; notification visible only to its user                  | 0011    |
| B13 | `docs(adr): 0016 attachments and exports`                                      | M     | `feat/adr-0016-attachments` | ADR                                                                          | none                                                                                     | **yes** |
| B14 | `feat(platform): attachment table and presigned MinIO upload`                  | M     | `feat/attachments`          | migration, Query, routes                                                     | restricted download logs a `view_sensitive` event; other business's key refused          | 0016    |
| B15 | `feat(shared): Bangladesh phone schema and business-date helper`               | F     | `feat/bd-phone-date`        | `shared/src/utils`                                                           | `01712...` → `+8801712...`; non-BD rejected; 23:30 UTC is next day in Dhaka              | no      |
| B16 | `feat(frontend): list export to CSV and print stylesheet`                      | F     | `feat/export-print`         | frontend helpers                                                             | export has the same columns as the API response (redacted)                               | 0016    |

### Phase C: catalogue, inventory, sales, booking

| #   | Title                                                                                                          | Owner | ADR        | Tests first (key ones)                                                                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------- | ----- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `docs(adr): 0017 product and inventory schema`                                                                 | M     | **yes**    | none                                                                                                                                                                                                                                                                                                                  |
| C2  | `feat(product): products, variants, brands, categories, price history`                                         | M     | 0017       | archived product cannot be sold; old invoice keeps its price                                                                                                                                                                                                                                                          |
| C3  | `feat(inventory): locations, bins, stock_movement, stock_balance`                                              | M     | 0017       | on hand = sum of movements; negative refused; parallel decrements never oversell                                                                                                                                                                                                                                      |
| C4  | `feat(inventory): serial_unit with conditional reserve and sell`                                               | M     | 0017       | two parallel reservations → one wins (F-02); duplicate serial names the holder (F-03)                                                                                                                                                                                                                                 |
| C5  | `feat(vehicle): vehicle_unit (engine, colour) and labels`                                                      | M     | 0017       | duplicate engine number refused; core screens show no chassis field when pack off (O-11)                                                                                                                                                                                                                              |
| C6  | `feat(inventory): transfers with approval and In transit`                                                      | M     | 0017, 0013 | mismatch raises an item; both sides post                                                                                                                                                                                                                                                                              |
| C7  | `feat(inventory): adjustments and physical count`                                                              | M     | 0017, 0013 | reason required; variance applied only on approval                                                                                                                                                                                                                                                                    |
| C8  | `feat(inventory): reorder rules, Low and Out of stock, basis shown`                                            | M     | 0017       | Low vs Out separate; crossing writes `stock.low` once                                                                                                                                                                                                                                                                 |
| C9  | `docs(adr): 0018 sales documents and posting rules`                                                            | F     | **yes**    | none                                                                                                                                                                                                                                                                                                                  |
| C10 | `feat(sales): invoice with lines, VAT line, gapless number, posting`                                           | F     | 0018       | invoice + journal + movements in one transaction; number gap impossible on rollback; a posted or paid invoice refuses every edit, even from the login that made it (Moto Mart's shared-login case); if VAT registered (Q15), the VAT line (S-06) is part of this PR, per line through A8's `computeVat` (ADR 0001 D1) |
| C11 | `feat(sales): split payment, due, down payment`                                                                | F     | 0018       | split posts each part; Idempotency-Key; several partial payments, each with a system receipt number; external transaction id required for Bank, bKash, Card, not for Cash                                                                                                                                             |
| C12 | `feat(sales): discount approval and delivery-with-balance approval`                                            | F     | 0018, 0013 | over-limit discount waits; approver logged                                                                                                                                                                                                                                                                            |
| C13 | `feat(sales): POS screen (search, cart, hold, barcode)`                                                        | F     | 0018       | held sale posts nothing; scan adds item                                                                                                                                                                                                                                                                               |
| C14 | `feat(sales): returns, credit notes, voids`                                                                    | F     | 0018       | return reverses revenue, COGS and stock; void never deletes                                                                                                                                                                                                                                                           |
| C15 | `feat(sales): booking with advance as liability, convert, cancel`                                              | F     | 0018       | advance credits liability; forfeit to other income; no expiry by default; a lapsed unit (expiry set) is sellable                                                                                                                                                                                                      |
| C16 | `feat(sales): booking amendment, quotation, preorder, waiting list` (**deferred**: after release 1, section 9) | F     | 0018       | amendment swaps the reservation atomically; allocation on receipt in queue order                                                                                                                                                                                                                                      |
| C17 | `feat(party): customer credit limit, optional, default none (S-15)`, after A11                                 | F     | 0006, 0013 | no limit set = no check; a credit sale over the limit is blocked or waits for approval (`credit_over_limit`); balance read from the ledger                                                                                                                                                                            |
| C18 | `feat(party): guarantor and relations (CR-12, party_relation)`, after A11                                      | F     | 0006       | a relation to a party of another business is refused (composite key); a guarantor is shown on the credit sale                                                                                                                                                                                                         |
| C19 | `docs(adr): 0021 instalments and bank financing`                                                               | F     | **yes**    | none                                                                                                                                                                                                                                                                                                                  |
| C20 | `feat(sales): instalments and bank loan references with a due calendar (S-14)`, after C11                      | F     | 0021, 0018 | instalments sum exactly to the financed balance (A8 `allocate`); each instalment payment posts through `IPostingService`; Idempotency-Key                                                                                                                                                                             |

### Phase D: purchasing and accounting

| #   | Title                                                                                                                          | Owner | ADR        |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ----- | ---------- |
| D1  | `docs(adr): 0019 purchase documents`                                                                                           | F     | **yes**    |
| D2  | `feat(purchase): purchase order with statuses and approval`                                                                    | F     | 0019, 0013 |
| D3  | `feat(purchase): goods receipt, partial, serial units, payable`                                                                | F     | 0019       |
| D4  | `feat(purchase): supplier bill with three-way match`                                                                           | F     | 0019       |
| D5  | `feat(purchase): supplier payments, advances, aging`                                                                           | F     | 0019       |
| D6  | `feat(purchase): purchase returns, direct purchase, reorder to draft PO`                                                       | F     | 0019       |
| D7  | `feat(accounting): chart of accounts screens, manual journal with approval`                                                    | M     | 0015, 0013 |
| D8  | `feat(accounting): expenses with receipt, recurring expenses`                                                                  | M     | 0015       |
| D9  | `feat(accounting): salary entries (API) and the Reports form`                                                                  | M     | 0015, 0012 |
| D10 | `feat(accounting): trial balance, P&L, balance sheet, GL, day book`                                                            | M     | no         |
| D11 | `feat(accounting): period close and lock; nightly integrity check script`                                                      | M     | 0015       |
| D12 | `feat(accounting): VAT summary and register data` (VAT summary in **release 1** if VAT registered, Q15; register data phase 2) | M     | 0015       |

D9 tests first: several entries for one staff member in one month are all kept; an entry dated in a closed
period is refused. **Landed cost (F-10) is Moto Mart phase 2** (section 1.5) and has no PR here yet. It comes
after D3 and gets the slow money review (invariant 7, costing).

### Phase E: service and warranty

| #   | Title                                                                                                       | Owner | ADR        |
| --- | ----------------------------------------------------------------------------------------------------------- | ----- | ---------- |
| E1  | `docs(adr): 0020 service jobs and warranty`                                                                 | F     | **yes**    |
| E2  | `feat(service): job card, statuses, print`                                                                  | F     | 0020       |
| E3  | `feat(service): parts issued from stock; service invoice`                                                   | F     | 0020, 0018 |
| E4  | `feat(service): warranty record on delivery; warranty check; warranty cost`                                 | F     | 0020       |
| E5  | `feat(vehicle): plate, odometer, km warranty and reminders`                                                 | M     | 0020       |
| E6  | `feat(service): estimates and approval`                                                                     | F     | 0020       |
| E7  | `feat(service): free service schedule, supplier warranty claims` (**deferred**: after release 1, section 9) | F     | 0020       |

### Phase F: CRM, reports, Action Center

| #   | Title                                                                                   | Owner | ADR  |
| --- | --------------------------------------------------------------------------------------- | ----- | ---- |
| F1  | `feat(crm): follow-ups and promise to pay; broken promises`                             | F     | no   |
| F2  | `feat(crm): leads, feedback, complaints`                                                | F     | no   |
| F3  | `feat(report): Action Center items: assign, due date, resolve, history`                 | M     | 0011 |
| F4  | `feat(report): standard report pack with previous-period comparison`                    | M     | no   |
| F5  | `feat(report): cash forecast`                                                           | M     | no   |
| F6  | `feat(report): saved views and targets`                                                 | M     | no   |
| F7  | `feat(organization): group view and branch comparison (security_invoker views)`         | M     | 0008 |
| F8  | `feat(auth): two-factor, sessions list, login history page` (two-factor is **phase 3**) | M     | 0008 |

---

## 6. Migration sequence

One migration per PR. Before creating one: merge `main`, tell the other developer, and say which tables.

| Order | Migration (name)                                              | Owner | Needs before it | Collision risk                                                                                                                  |
| ----- | ------------------------------------------------------------- | ----- | --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `rls_scope_functions` (#19)                                   | M     | none            | none (in review)                                                                                                                |
| 2     | `organization_tree`                                           | M     | 1               | **Party (F) waits for this**: `party.business_id` points at `business`                                                          |
| 3     | `auth_access`                                                 | M     | 2               | low                                                                                                                             |
| 4     | `party` (F2)                                                  | F     | 2               | **Collides with 3 if made the same day.** Order: 2, 3 first, then 4; or 4 right after 2 if Farhan is blocked, and 3 regenerates |
| 5     | `accounting_core`                                             | M     | 2               | with 6 (both on `main` the same week)                                                                                           |
| 5a    | `number_series` (A14a)                                        | M     | 2               | with 5: same developer, order only; must be on `main` before 7                                                                  |
| 6     | `idempotency_key`                                             | F     | 2               | with 5: **5 first** (F3 needs both, posting is the riskier review)                                                              |
| 7     | `sales_payment` (F3)                                          | F     | 4, 5, 5a, 6     | none if 4 to 6 are merged                                                                                                       |
| 8     | `day_close`                                                   | M     | 5               | with 7: either order; neither references the other                                                                              |
| 9     | `audit_event`, `outbox_event`, `notification`                 | M     | 2               | low                                                                                                                             |
| 10    | `approval`                                                    | F     | 2, 3            | low                                                                                                                             |
| 11    | `attachment`, search indexes                                  | M / F | 2, 4            | two developers, two migrations: **attachment first**, indexes after                                                             |
| 12    | `product`, then `inventory`, then `vehicle`                   | M     | 2               | Sales and Purchase wait for these                                                                                               |
| 13    | `sales_documents`, `booking`                                  | F     | 5, 12           | with 14: **13 first**                                                                                                           |
| 14    | `purchase_documents`                                          | F     | 5, 12           | same developer: no collision, just order                                                                                        |
| 15    | `accounting_extras` (expenses, recurring, salary, close, VAT) | M     | 5               | with 13/14 if the same week: **13/14 first** (they are on the critical path)                                                    |
| 16    | `service`                                                     | F     | 12, 13          | with `vehicle` extras (M): **vehicle first**                                                                                    |
| 17    | `crm`, `report`                                               | F / M | 4 / most        | low                                                                                                                             |

**A Prisma detail that causes cross-owner edits.**

- A Prisma relation needs a field on **both** models.
- So `party.business_id → business` adds a back-relation field to `organization.prisma`, Munif's file.
- Every module that points at `business`, `party`, `staff`, `serial_unit` or `journal` does the same to another owner's file (`staff`: from `party.assigned_to`, ADR 0008).
- **Options:**
  1. Accept these one-line back-relation edits, reviewed by the file's owner.
  2. Declare plain `business_id` columns with no Prisma relation and add the foreign keys in raw SQL.
- **Recommendation:** (1). With (2), check first whether `prisma migrate dev` / `db:migrate:check` treats the SQL-only foreign keys as drift. Decide it in ADR 0008.

---

## 7. Two weeks in parallel (19 Nov to 3 Dec)

The interview slice is due **29 Nov**, so week 1 is the slice. Week 2 starts Phase B.

**Munif**

| When            | Work                                                                                    | Blocks Farhan?                      |
| --------------- | --------------------------------------------------------------------------------------- | ----------------------------------- |
| 19 to 20 Nov    | Answer reviews on #19, #8, #9; A0, A1; write A2 (ADR 0008)                              | A2 unblocks F2                      |
| 21 to 24 Nov    | A3 (organization tree), A8 (money math), A12 (ADR 0015, with Farhan's input on posting) | **A3 unblocks A11**                 |
| 24 to 26 Nov    | A4, A5, A6 (auth and tenant middleware), A13 (journal engine), A14a (number series)     | A13 unblocks A16; A14a unblocks A15 |
| 26 to 28 Nov    | A7 (isolation runner), A18 (dashboard on real data), demo deploy (#17)                  | no                                  |
| 30 Nov to 3 Dec | B1, B2 (activity record), B4, B5 (hidden fields)                                        | no                                  |

**Farhan**

| When            | Work                                                                             | Waits on Munif?                                                             |
| --------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 19 to 21 Nov    | Review #19, #8; A9 (ADR 0014); A10 (customer screens on mocks)                   | no                                                                          |
| 21 to 24 Nov    | A14 (idempotency); review A2, A3                                                 | no (A14 needs only `business`, but can be written against migration 2's PR) |
| 24 to 26 Nov    | A11 (party tables, F2) once A3 is merged; A19 (sample data)                      | A3                                                                          |
| 26 to 28 Nov    | A15 (payments), A16 (posting) once A13 and A14a are merged; A17 day close screen | A13, A14a                                                                   |
| 29 Nov          | F7: README, screenshots, demo walkthrough                                        | no                                                                          |
| 30 Nov to 3 Dec | B7, B8 (approvals), B9, B10 (search), B15                                        | no                                                                          |

**If A3 or A13 slips**, Farhan keeps going on code that needs no table: the Party Manager and Controller
against an in-memory fake of `IPartyQuery`, the payment screen on mocks, and ADRs 0013 and 0010. Nothing
should wait more than a day.

**The customer Documents tab (section 1.5)** needs attachments (B13, B14, Munif), which are not in these two
weeks. Farhan builds the tab after B14 merges, not in A10.

**What the slice will not have** (say it in the demo): approvals, the full activity record, hidden-field
redaction, attachments, WhatsApp and email messages.

---

## 8. Open questions (with a recommended answer)

| #   | Question                                                                                                                                                                                | For                  | Recommendation                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | With section 19 cancelled, who decides the Conditional items (instalments, credit limits, landed cost, Mushak 6.3, guarantor, multi-brand, bKash auto-confirm, a second business type)? | Moto Mart, via Munif | **Answered (20 Nov, section 1.5):** release 1, phase 2 or phase 3 for each; no bKash auto-confirm. Still open: which second business (Q21).                                                                                                        |
| Q2  | Is F-06 "Registered" and everything else about registration (C1) gone with section 7?                                                                                                   | Munif, Farhan        | **Proposed, to agree with Farhan.** Spec F-06 ends at Registered. Not decided until the owner answers Q2; no unit status code is written before then.                                                                                              |
| Q3  | Does a branch keep its own showroom and warehouse, or is the warehouse shared by branches?                                                                                              | Moto Mart            | **Answered (20 Nov): the default stays.** Per branch (a location belongs to one branch). A shared warehouse is its own branch with a `storage` location.                                                                                           |
| Q4  | Inter-business sale (O-07) writes to two businesses. ADR 0005 allows one business per write.                                                                                            | Munif, Farhan        | Two documents, each in its own request and transaction, linked by a reference; a mismatch list finds the half-done ones. Later, the worker.                                                                                                        |
| Q5  | Salary: monthly fixed amount per person only, or also allowances, deductions, advances?                                                                                                 | Moto Mart            | **Answered (20 Nov):** not fixed. Any number of entries per person per month, any amount and date (3.4). Allowances and deductions stay HR (cancelled).                                                                                            |
| Q6  | Do recurring expenses need automatic posting?                                                                                                                                           | Moto Mart            | **Answered (20 Nov): the default stays.** No. A reminder on the due day (rent reminders); a person posts it.                                                                                                                                       |
| Q7  | Reservation period (S-10): one setting per business, or per product?                                                                                                                    | Moto Mart            | **Answered (20 Nov):** no day limit. Expiry is optional, none by default; old bookings are listed in the Action Center (3.5).                                                                                                                      |
| Q8  | Booking cancel and forfeit policy: full, partial, or never?                                                                                                                             | Moto Mart            | **Still open.** A percentage setting per business, default 0 %, reason always required.                                                                                                                                                            |
| Q9  | Seed three roles (queue M3) or the spec's five?                                                                                                                                         | Munif, Farhan        | Five (C7).                                                                                                                                                                                                                                         |
| Q10 | Do SMS and email (notifications, invoice sharing, reminders, campaigns) need to work at go-live?                                                                                        | Moto Mart            | **Answered (20 Nov):** WhatsApp, not SMS. Release 1 is a "Share on WhatsApp" link button, no API; automatic WhatsApp is phase 3 (Q24).                                                                                                             |
| Q11 | Back-relation fields across schema files (section 6)                                                                                                                                    | Munif, Farhan        | Accept them, reviewed by the file's owner.                                                                                                                                                                                                         |
| Q12 | Is Excel needed, or does CSV that Excel opens do?                                                                                                                                       | Moto Mart            | **Answered (20 Nov):** CSV that opens in Excel.                                                                                                                                                                                                    |
| Q13 | Low-stock level per branch or per location?                                                                                                                                             | Moto Mart            | Per branch. The rule itself is open (Q19).                                                                                                                                                                                                         |
| Q14 | Who closes the day: one close per branch, or one per cashier shift?                                                                                                                     | Moto Mart            | **Answered (20 Nov): the default stays.** Shift close per cashier (S-19), day close per branch (A-19); the day closes after all shifts.                                                                                                            |
| Q15 | Is the business VAT registered? (The owner asked for Mushak 6.3; the sale screenshot and product list show no tax.)                                                                     | Owner, accountant    | Build no VAT beyond A8 until answered. If registered, the VAT summary (A-09) and the invoice VAT line (S-06) are release 1 and part of C10, and Mushak 6.3 is phase 2; if not, none of them is built (ADR 0001 D1).                                |
| Q16 | VAT rounding: per line or per invoice?                                                                                                                                                  | Accountant, Farhan   | Per line (option A), as built in A8 (`computeVat`). Per invoice (option B) is written down there if the accountant asks for it.                                                                                                                    |
| Q17 | Registration and the "processing fee" on a bike sale: what is the fee, and where does the money go (BRTA, an agent, the showroom)?                                                      | Owner                | Treat every amount passed through to a third party as a liability (invariant 8). Only a fee the showroom keeps is revenue.                                                                                                                         |
| Q18 | Two-factor sign-in: who needs it, and when? The spec (U-07) makes it mandatory for Owner and Accountant.                                                                                | Owner, Munif         | Phase 3, as decided; record the difference from U-07 in ADR 0001 (row 14).                                                                                                                                                                         |
| Q19 | The low-stock rule: the owner said "80 and 20", which is unclear.                                                                                                                       | Owner                | Ask for one worked example. Until then, a reorder level per product and branch (3.2).                                                                                                                                                              |
| Q20 | Interest on late payments: charged or not?                                                                                                                                              | Owner, accountant    | None in release 1. If wanted, a separate charge that posts as income; never a change to the posted invoice.                                                                                                                                        |
| Q21 | Which second business type comes first (phase 3)?                                                                                                                                       | Owner                | Ask before phase 3 is planned; it decides the second pack.                                                                                                                                                                                         |
| Q22 | Separate books per location (showroom and Service Center)?                                                                                                                              | Owner, accountant    | No: two branches of one business, so customers and books are shared. Separate books would mean two businesses, and customers would not be shared (ADR 0006).                                                                                       |
| Q23 | What is the vendor system's name?                                                                                                                                                       | Owner                | Needed for the import mapping (F-09) and its export formats.                                                                                                                                                                                       |
| Q24 | Meta WhatsApp Business API: rules (templates, opt-in) and cost per message?                                                                                                             | Munif                | Check before automatic WhatsApp is planned (phase 3). The release 1 link button needs none of it.                                                                                                                                                  |
| Q25 | Are the prices shown to customers (bikes and parts) VAT-inclusive, or is VAT added on top? Raised by Farhan on #20.                                                                     | Owner, accountant    | Only matters if Q15 says the business is VAT registered. If inclusive, Sales needs the reverse calculation gross × rate / (100 % + rate), with the same rounding rule (half away from zero), as a new function next to `computeVat` in `money.ts`. |

---

## 9. Too big for the first release: what to cut or defer

The features file is the whole roadmap (56 weeks for two people), not a first release. Direct recommendations:

**Cut from release 1 (build after go-live):**

- **Scheduled reports, segments and campaigns, automatic WhatsApp messages and their templates and logs, new-device alerts, service reminders.** All need the worker; automatic WhatsApp is Moto Mart phase 3 (section 1.5). Release 1 has the "Share on WhatsApp" link button instead.
- **Offline POS queue (S-20).** Ship the "clear error, nothing lost" half: Idempotency-Key plus a retry button. The queue (a PWA) is Phase 5 in the roadmap.
- **Budgets (A-27), bank reconciliation (A-15), month-end checklist (A-24).** Important, not Critical. Period lock (A-12) and day close stay.
- **Landed cost (F-10), Mushak 6.3 and the VAT worksheet (A-25, A-26):** Moto Mart phase 2 (section 1.5). VAT waits for the accountant (Q15, Q16). The VAT summary (A-09) and the invoice VAT line (S-06) are **not** deferred: if the business is VAT registered (Q15), they are release 1 (ADR 0001 D1); if not, neither is built. Instalments (S-14), credit limit (S-15) and guarantor (CR-12) are **not** deferred: they are release 1.
- **Waiting list (B-08), preorder (B-07), quotation (B-09), booking amendment (B-06):** Important. Booking with advance, convert and cancel (B-01 to B-05) are Critical and stay.
- **Inter-business transactions (O-07), group view (O-08), new business template (O-10):** Important, and only matter with a second business on the system. One business with two branches first.
- **Two-factor (U-07):** Moto Mart phase 3 (Q18). **Session list (U-08):** Important. Login security (U-04) stays Critical.
- **Unusual activity flags (RP-08), saved views (RP-07), target and commission (RP-09, D-08):** after the standard pack.
- **Technician report (SV-11), supplier warranty claims (SV-09), free service schedule (SV-07):** after the job card works.
- **Cross-module search:** per-module search (`search`) is enough for release 1; the "all parts" facade is cheap later.

**Simplify:**

- **Action Center:** release 1 = derived lists with drill-down, plus assign and resolve on the four most used kinds (pending approval, overdue customer payment, low stock, sold not delivered). The other kinds read-only.
- **Dashboard:** Appendix A phases 1 to 3 only, from live queries. No `report_snapshot` until volume needs it (the worker writes it).
- **Export:** CSV that opens in Excel, and browser print to PDF.
- **Attachments:** customers first (the profile's Documents tab), then units and expenses.

**Keep, even though it is work:** everything that protects money and stock. That means the ledger and stock
invariants, isolation tests, idempotency, approvals for discount, delivery-with-balance and adjustments, the
activity record, hidden fields, the period lock and the nightly integrity check. These are the spec's
Critical rows, and they are what the interviews and Moto Mart will judge.

---

## 10. The first three PRs to start (Munif)

1. **A2 `docs(adr): 0008 organization and access schema`.** The tables of the tenant tree and of access, RLS per table, the five roles, staff without login, and the back-relation decision (section 6). Without it neither M2 nor Farhan's F2 can start, and the CLAUDE.md lifecycle requires an agreed plan for tenancy, permissions and migrations.
2. **A3 `feat(organization): organization, legal entity, business, branch tables with RLS`.** The first tenant tables, on top of #19's functions. It unblocks Party (F2), the switcher on real data (#12), and every later module.
3. **A8 `feat(shared): money arithmetic in paisa with property tests`.** Small, shared, and needed before the journal engine (A13) and Farhan's payments (A15). It can be written now, in parallel with the ADR review.

A0 and A1 are housekeeping. Make them alongside, but do not let them hold up the three above.

Farhan's first three: **A9** (ADR 0014 idempotency), **A10** (customer screens on mocks), then **A11**
(party tables) as soon as A3 merges.
