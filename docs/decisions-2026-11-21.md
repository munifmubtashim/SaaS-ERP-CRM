# Open decisions, 21 Nov 2026

**For:** Munif and Farhan. Every question still open in the plan ADRs and PRs, in the order the plans will be
built. A plan can start only once Munif says "agreed" for its PR. Its **must** questions are the ones to
answer before that; the **can wait** ones can be answered during the build.

Each line gives the question, who decides, the recommendation, and the PR to answer it on.

**Agreed by Farhan on 21 Nov (approved, then the final commit cleared the approvals, so each needs re-approval):**
#27 ADR 0008 amendment (head `91f9ed3`), #31 ADR 0009 Accepted (head `c11c309`), #32 ADR 0010 Accepted (head
`d401a51`). Their open questions above are settled.

## 1. #31 ADR 0009: organization tables (A3b) — next to build

| #      | Question                                                                                                   | Who    | Recommendation                                                                                | When                        |
| ------ | ---------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------- | --------------------------- |
| 0009-2 | Revoke `INSERT` on `organization` and `legal_entity` from `erp_app` too?                                   | Farhan | Yes: they are seeded by the owner, so least privilege                                         | **must**                    |
| 0009-3 | `version` on `business` and `branch` now?                                                                  | Farhan | Add it now: one column each, and CLAUDE.md asks for it where edited                           | **must**                    |
| 0015-2 | A short code on `branch` (`UTT`) for receipt prefixes? Raised by ADR 0015, but it's a column in A3b part 1 | Munif  | Add `short_code` (unique per business) to `branch` in part 1, so no later migration is needed | **must**                    |
| 0009-5 | Farhan's A11 migration right after part 1, before part 2?                                                  | Farhan | Yes: part 2 changes only grants and policies                                                  | can wait                    |
| 0009-6 | Integration tests insert and delete fixtures as the migration owner?                                       | Farhan | Yes, since `erp_app` can't; only in test helpers                                              | **must** (shapes the tests) |
| 0009-4 | Is a `lower(email)` expression index drift for `db:migrate:check`? (A4)                                    | both   | Test it in A4 part 3; fall back to a plain index on a lower-cased column                      | can wait (A4)               |

## 2. #32 ADR 0010: provisioning path (A3c)

| #      | Question                                                                      | Who    | Recommendation                                          | When     |
| ------ | ----------------------------------------------------------------------------- | ------ | ------------------------------------------------------- | -------- |
| 0010-1 | A factory function next to `ProvisioningQuery` builds its client: acceptable? | Farhan | Yes: a function, not a `new` inside a class             | **must** |
| 0010-2 | `PROVISIONING_DATABASE_URL` required or optional?                             | Munif  | Required, with a README line                            | **must** |
| 0010-3 | A deny-all role source until A5?                                              | Munif  | Yes: every provisioning call refused until login exists | **must** |
| 0010-4 | Tenant-scoped business and branch reads in A3c?                               | Farhan | No, they go with A6                                     | can wait |

## 3. #27 ADR 0008 amendment

No open questions: it records five decisions already taken (provisioner sees one organization, nullable
`created_by` on the tree tables, owner seeding, `uuid_v7()` defaults, the `@@unique` fix). It needs Farhan's
review only.

## 4. #45 ADR 0018: sessions and login (A4, A5)

| #      | Question                                                                                 | Who    | Recommendation                               | When                        |
| ------ | ---------------------------------------------------------------------------------------- | ------ | -------------------------------------------- | --------------------------- |
| 0018-3 | Login by phone needs `app_user.phone` unique across the system. Add that, or email only? | Munif  | Unique phone too: shop staff log in by phone | **must** (A4 part 3 column) |
| 0018-2 | `@node-rs/argon2` or `argon2`?                                                           | Farhan | `@node-rs/argon2`: prebuilt, no build step   | **must** (A5)               |
| 0018-1 | Idle 8 hours, absolute 7 days?                                                           | both   | Yes, both as settings                        | can wait                    |
| 0018-4 | After a lock: the same message, or "too many attempts"?                                  | both   | Same message: reveals nothing                | can wait                    |
| 0018-5 | Store the client IP on sessions?                                                         | both   | Not until the session list (U-08)            | can wait                    |

## 5. #37 ADR 0011 and #40 ADR 0014: idempotency (owner Farhan)

| #      | Question                                                                                    | Who    | Recommendation                           | When     |
| ------ | ------------------------------------------------------------------------------------------- | ------ | ---------------------------------------- | -------- |
| 0011-1 | A reused key: `409 CONFLICT` with a field code, or a new `IDEMPOTENCY_KEY_REUSED` with 422? | Farhan | 409 with a field code: no new error code | **must** |
| 0011-2 | How to mark money and stock permission codes for the route check?                           | Farhan | A separate list next to `PERMISSIONS`    | **must** |
| 0011-3 | Should replays expire?                                                                      | Farhan | Replay while the row exists              | can wait |
| 0011-4 | Keys per user, given shared till logins?                                                    | Farhan | Per user                                 | can wait |
| 0014-1 | The guard as a non-module class built by `createManagers`?                                  | Farhan | Yes                                      | **must** |
| 0014-2 | `platform.prisma` for cross-module tables?                                                  | Farhan | Yes                                      | **must** |
| 0014-3 | Reuse #8's `tenantTestKit.ts` for the parallel test?                                        | Farhan | Yes                                      | can wait |

## 6. #38 ADR 0012: module contracts

| #      | Question                                                                                              | Who    | Recommendation                          | When     |
| ------ | ----------------------------------------------------------------------------------------------------- | ------ | --------------------------------------- | -------- |
| 0012-1 | The provider publishes the contract (an exception to "the consumer owns it", written into CLAUDE.md)? | Farhan | Yes, for contracts between modules only | **must** |
| 0012-2 | Any account role missing for Sales?                                                                   | Farhan | Add during A16 if needed                | can wait |
| 0012-3 | A key on `post`, or route-level idempotency only?                                                     | both   | Route level only                        | can wait |
| 0012-4 | An unbalanced draft: 500 or 400?                                                                      | both   | 500: it's a bug in the caller           | can wait |

## 7. #39 ADR 0013: journal engine

| #      | Question                                                    | Who        | Recommendation                                  | When     |
| ------ | ----------------------------------------------------------- | ---------- | ----------------------------------------------- | -------- |
| 0013-3 | Journal `number` required from the start?                   | both       | Required, so build A14a (#41) before A13 part 2 | **must** |
| 0013-1 | `party_id` on lines: plain uuid now, foreign key after A11? | Farhan     | Yes                                             | **must** |
| 0013-2 | The default chart: an Owner setup action, or provisioning?  | Munif      | The setup action: provisioning stays narrow     | **must** |
| 0013-4 | The default chart's accounts and Bangla names               | accountant | Draft in the PR, confirm later                  | can wait |

## 8. #41 ADR 0015: number series (A14a)

| #      | Question                               | Who        | Recommendation          | When             |
| ------ | -------------------------------------- | ---------- | ----------------------- | ---------------- |
| 0015-1 | A series per branch or per business?   | both       | Per branch              | **must**         |
| 0015-2 | See section 1 (branch short code)      | Munif      | —                       | **must**, in A3b |
| 0015-3 | Restart numbers each fiscal year?      | accountant | No restart in release 1 | can wait         |
| 0015-4 | Series kinds beyond `receipt` for A15? | Farhan     | Answer in A15           | can wait         |

## 9. #43 ADR 0016: payment posting (owner Farhan)

| #      | Question                                                              | Who    | Recommendation                                  | When     |
| ------ | --------------------------------------------------------------------- | ------ | ----------------------------------------------- | -------- |
| 0016-1 | Does A15's `sales_payment` include `journal_id` and the void columns? | Farhan | Yes, so A16 needs no migration                  | **must** |
| 0016-2 | One journal per partial payment?                                      | Farhan | Yes                                             | **must** |
| 0016-3 | Card to `card_clearing` or to `bank`?                                 | Farhan | `card_clearing`                                 | can wait |
| 0016-4 | Void needs an approval?                                               | Farhan | Owner or Accountant role is enough in release 1 | can wait |

## 10. Not in the build order yet

- **#44 ADR 0017, day close:**
  - shift close in release 1? (Farhan);
  - reopening a closed day (both; recommended: never in release 1);
  - opening float (Munif);
  - cash over/short accounts (accountant).
- **PR-level questions:**
  - #34: product row fields; a reserved quantity on the stock row.
  - #35: a Products sidebar item.
  - #36: the branch filter after #12.
  - #48: how many bikes the demo sells; how obviously fake the names are.
  - #49: who owns the demo script; whether the race in step 8 is live.
- **Waiting on Farhan's fixes:** six points on #52 and four on #42, from Munif's review. They need fixes, not
  decisions.
- **Owner and accountant** (feature plan section 8): Q2, Q8, Q15, Q16, Q17, Q19 to Q25. None blocks the plans
  above.

## 11. Plans drafted later on 21 Nov (Munif's modules)

"Blocks building" means the question must be answered before that plan's first PR starts.

### #58 ADR 0020: products and bike units

| #      | Question                                             | Who    | Recommendation                                        | Blocks building? |
| ------ | ---------------------------------------------------- | ------ | ----------------------------------------------------- | ---------------- |
| 0020-1 | Brand and category as text, or tables?               | Munif  | Text now; tables when a screen manages them           | yes              |
| 0020-2 | `serial_no` unique per business or per organization? | both   | Per business                                          | yes              |
| 0020-3 | Must a bike sale name a customer?                    | Farhan | Yes, for serial units                                 | no (ADR 0022)    |
| 0020-4 | Does the status flow end at `registered` (plan Q2)?  | both   | Not until Q2 is answered                              | no               |
| 0020-5 | Where is "Vehicle pack on" stored?                   | Munif  | A `packs` text array on `business` (touches ADR 0009) | yes              |

### #59 ADR 0021: stock ledger

| #      | Question                                       | Who    | Recommendation                                                                                               | Blocks building? |
| ------ | ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ | ---------------- |
| 0021-1 | Stock by location                              | Munif  | **Decided by Munif, 21 Nov:** locations now; ADR 0021 amended (#59); average cost per branch in `stock_cost` | yes              |
| 0021-2 | Average cost rounded to paisa at each receipt? | both   | Yes                                                                                                          | yes              |
| 0021-3 | `sale_return` in release 1?                    | Farhan | Wait with returns (C14)                                                                                      | no               |

### #60 ADR 0022: sale posting (owner Farhan)

| #      | Question                                                | Who    | Recommendation              | Blocks building? |
| ------ | ------------------------------------------------------- | ------ | --------------------------- | ---------------- |
| 0022-1 | Revenue net of discount, or gross plus a discount line? | Farhan | Net                         | yes              |
| 0022-2 | Payments at the sale always through ADR 0016's path?    | Farhan | Yes                         | yes              |
| 0022-3 | Named customer for a serial unit?                       | Farhan | Yes                         | yes              |
| 0022-4 | "Sold, not delivered" in the demo?                      | Farhan | Deliver at once in the demo | no               |
| 0022-5 | Refuse pass-through lines until plan Q17?               | Farhan | Yes                         | no               |

### #61 ADR 0023: dashboard on real figures

| #      | Question                                                      | Who    | Recommendation                          | Blocks building? |
| ------ | ------------------------------------------------------------- | ------ | --------------------------------------- | ---------------- |
| 0023-1 | Live queries (feature plan) or `report_snapshot` (CLAUDE.md)? | both   | Live, and amend CLAUDE.md in its own PR | yes              |
| 0023-2 | Business Manager sees it for own businesses?                  | Munif  | Yes                                     | no               |
| 0023-3 | Do collections today include advances?                        | Farhan | Yes                                     | yes              |

### #71 ADR 0032: activity record

| #      | Question                                    | Who    | Recommendation                                                                     | Blocks building? |
| ------ | ------------------------------------------- | ------ | ---------------------------------------------------------------------------------- | ---------------- |
| 0032-1 | Who may open the Activity Log?              | Munif  | **Decided by Munif, 21 Nov:** Owner, Business Manager (own businesses), Accountant | no (part 2)      |
| 0032-2 | Partition by month now?                     | both   | **Decided by Munif, 21 Nov:** no partitioning now                                  | no               |
| 0032-3 | Viewing a full NID writes `view_sensitive`? | Farhan | Yes                                                                                | no               |

### #72 ADR 0033: permissions and hidden fields

| #      | Question                                          | Who    | Recommendation                                                               | Blocks building? |
| ------ | ------------------------------------------------- | ------ | ---------------------------------------------------------------------------- | ---------------- |
| 0033-1 | Every tenant route declares a permission?         | both   | **Decided by Munif, 21 Nov:** yes, a test fails any tenant route without one | yes              |
| 0033-2 | Hidden field absent or `null`?                    | both   | **Decided by Munif, 21 Nov:** absent, not `null`                             | yes              |
| 0033-3 | Role mapping fixed from #26 in release 1?         | Munif  | **Decided by Munif, 21 Nov:** yes, fixed from #26 for release 1              | no               |
| 0033-4 | Party's per-kind codes need more than this check? | Farhan | No                                                                           | no               |

### #73 ADR 0034: stock by location

| #      | Question                                       | Who              | Recommendation                                                                                                                     | Blocks building? |
| ------ | ---------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 0034-1 | Bins in release 1?                             | Munif, Moto Mart | **Decided by Munif, 21 Nov:** locations only, no bins                                                                              | no               |
| 0034-2 | Which location does a POS sale take from?      | Munif            | **Decided by Munif, 21 Nov:** the default `sales_floor` location per branch; not changeable per line in release 1 (a later change) | yes              |
| 0034-3 | Amend ADR 0021 (#59) to include `location_id`? | Munif            | **Decided by Munif, 21 Nov:** amended now (#59, `0c1989b`)                                                                         | yes              |

### #74 ADR 0035: month lock and integrity check

| #      | Question                                        | Who   | Recommendation                                            | Blocks building? |
| ------ | ----------------------------------------------- | ----- | --------------------------------------------------------- | ---------------- |
| 0035-1 | Reopen a locked month in release 1?             | Munif | Never                                                     | yes              |
| 0035-2 | Require every day closed before the month lock? | Munif | Yes                                                       | yes              |
| 0035-3 | Who runs the integrity check, how often?        | Munif | Nightly, a scheduled job on the server set up by a person | no (part 2)      |

### #75 ADR 0036: chart of accounts and manual journals

| #      | Question                                                      | Who   | Recommendation                             | Blocks building? |
| ------ | ------------------------------------------------------------- | ----- | ------------------------------------------ | ---------------- |
| 0036-1 | Every manual journal needs approval, or only above an amount? | Munif | Every one in release 1                     | yes (part 2)     |
| 0036-2 | Who approves manual journals?                                 | Munif | Owner and Accountant                       | yes (part 2)     |
| 0036-3 | Who may edit the role → account mapping?                      | Munif | Owner and Accountant, each change recorded | no               |

### #76 ADR 0037: expenses and recurring expenses

| #      | Question                                      | Who          | Recommendation                        | Blocks building? |
| ------ | --------------------------------------------- | ------------ | ------------------------------------- | ---------------- |
| 0037-1 | Expense approval limit?                       | Munif, owner | Per-business rule; default ৳10,000.00 | yes              |
| 0037-2 | Payee as free text with an optional supplier? | Munif        | Yes                                   | yes              |
| 0037-3 | Receipt required once attachments exist?      | Munif        | Above the approval limit only         | no               |

### #77 ADR 0038: salary entries

| #      | Question                                 | Who   | Recommendation                                                                           | Blocks building? |
| ------ | ---------------------------------------- | ----- | ---------------------------------------------------------------------------------------- | ---------------- |
| 0038-1 | Allow "accrued" salaries in release 1?   | Munif | **Decided by Munif, 21 Nov:** no accruals in release 1; cash and bank only               | yes              |
| 0038-2 | Who may enter salaries?                  | Munif | **Decided by Munif, 21 Nov:** Owner and Accountant                                       | yes              |
| 0038-3 | Salary as its own table, not an expense? | Munif | **Decided by Munif, 21 Nov:** own table; the Activity Log records who viewed salary data | yes              |

### #78 ADR 0039: financial statements

| #      | Question                                                     | Who        | Recommendation                                                                                             | Blocks building? |
| ------ | ------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------- | ---------------- |
| 0039-1 | Equity section = capital + retained profit + current profit? | accountant | **Decided by Munif, 21 Nov:** simple capital plus retained earnings; flagged for the owner's accountant    | no (part 2)      |
| 0039-2 | P&L by branch in release 1?                                  | Munif      | **Decided by Munif, 21 Nov:** yes, a column option                                                         | no               |
| 0039-3 | Which roles see the statements?                              | Munif      | **Decided by Munif, 21 Nov:** Owner and Accountant all statements; Business Manager the trial balance only | yes              |

### #79 ADR 0040: stock adjustments and counts

| #      | Question                                                       | Who        | Recommendation                                                 | Blocks building? |
| ------ | -------------------------------------------------------------- | ---------- | -------------------------------------------------------------- | ---------------- |
| 0040-1 | Every adjustment needs approval?                               | Munif      | **Decided by Munif, 21 Nov:** yes, every adjustment            | yes              |
| 0040-2 | One `inventory_loss` role for losses and gains, or per reason? | accountant | **Decided by Munif, 21 Nov:** one account for losses and gains | yes              |
| 0040-3 | A count per location, or a whole branch at once?               | Munif      | **Decided by Munif, 21 Nov:** one location at a time           | no (part 2)      |
