# Open decisions, 21 Nov 2026

**For:** Munif and Farhan. Every question still open in the plan ADRs and PRs, in the order the plans will be
built. A plan can start only once Munif says "agreed" for its PR. Its **must** questions are the ones to
answer before that; the **can wait** ones can be answered during the build.

Each line gives the question, who decides, the recommendation, and the PR to answer it on.

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
