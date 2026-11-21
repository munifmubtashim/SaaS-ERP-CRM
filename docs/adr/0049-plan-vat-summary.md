# 0049: Plan for VAT accounts and the monthly VAT summary (D12), if the business is VAT registered

| Field               | Value                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Status              | Proposed (conditional: built only if Q15 is "yes")                                                                                 |
| Date                | 2026-11-21                                                                                                                         |
| Deciders            | Munif, Farhan; the owner's accountant for Q15, Q16 and Q25                                                                         |
| Owner               | Munif (Accounting). The invoice VAT line is Farhan's (Sales, ADR 0022); purchase VAT is Farhan's (ADR 0028)                        |
| Spec / roadmap refs | spec A-09, A-25, A-26, S-06; ADR 0001 D1; CLAUDE.md invariants 1, 8, 9; ADR 0012, 0013, 0022, 0028, 0035, 0046; plan Q15, Q16, Q25 |

## Context

- **A-09:** VAT payable and receivable are tracked separately, and a monthly VAT summary is available.
- **Q15 is still open:** the owner asked for Mushak 6.3, but their sale screenshot and product list show no tax.
  Plan section 1.5: **if the business is VAT registered, the invoice VAT line (S-06) and this summary are release
  1; if not, neither is built.** Mushak 6.3, the VAT worksheet (A-25) and withholding (A-26) are phase 2 either way.
- Decided on #88 (Munif, 21 Nov): the standard report pack has no VAT report in release 1. This plan is that
  report's conditional replacement, built only if Q15 says yes.

No code is in this PR, and **nothing in it is built until Q15 is answered "yes"**.

## Decision

### 1. A switch per business

- `business.vat_registered` (boolean, default false) and the existing `business.bin` (ADR 0009): a VAT-registered
  business must have a BIN (`CHECK (NOT vat_registered OR bin IS NOT NULL)`).
- Only the Owner changes it (`organization.business.vat.manage`), with an activity event. Turning it on applies to
  documents dated from that day; turning it off never changes posted documents.
- When it's off: no VAT line on invoices, no VAT accounts used, and the summary isn't offered.

### 2. Accounts (ADR 0012 role list, ADR 0013 posting)

| Role         | Type      | Posted by                                                             |
| ------------ | --------- | --------------------------------------------------------------------- |
| `vat_output` | liability | a sale's VAT: Cr `vat_output` (Sales, ADR 0022); a return reverses it |
| `vat_input`  | asset     | a purchase's reclaimable VAT: Dr `vat_input` (Purchase, ADR 0028)     |

- **Separate accounts, never netted in a journal** (A-09). The month's settlement is its own journal (below).
- VAT per line or per invoice is **Q16** (A8's `computeVat` is per line today); prices VAT-inclusive or added on top
  is **Q25**. Both shape Sales' posting, not this summary.

### 3. The monthly summary (A-09)

`VatSummaryReport implements IReport` (ADR 0046), key `vat_summary`, permission `accounting.vat.view`:

| Line                     | From                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Output VAT, by rate      | `vat_output` credits less debits in the month, grouped by the rate on the source line |
| Input VAT, by rate       | `vat_input` debits less credits in the month                                          |
| **Net** = output − input | payable when positive; a credit to carry forward when negative                        |
| Carried forward in       | last month's negative net, if any                                                     |
| Paid                     | settlement journals dated in the month                                                |

- **Month = Dhaka business dates**, the same rule as ADR 0046. A locked month (ADR 0035) can't gain VAT postings.
- Every figure comes from posted journals (invariant 1), and the test compares each line with the account
  balances.

### 4. Settlement

`POST /v1/accounting/vat-settlements` (Owner, Accountant): for a locked month, posts Dr `vat_output`, Cr
`vat_input` (the offset), and Dr `vat_output`, Cr `bank` for the amount paid, as one balanced journal with
`Idempotency-Key`. A month can be settled once; a correction is a reversal (invariant 2).

## Invariants touched

1 (figures from the ledger), 2 (settlements reversed, never edited), 4 (one journal per settlement), 5
(idempotent settlement), 8 (VAT collected is a liability, never revenue), 9 (no VAT posting into a locked month).

## Tests to write first

1. With `vat_registered` off, a sale posts no VAT line and the summary route answers `404`.
2. A sale of ৳115.00 including 15 % VAT (if Q25 says inclusive) posts ৳100.00 revenue and ৳15.00 `vat_output`; a
   purchase with ৳30.00 VAT posts ৳30.00 `vat_input`.
3. The summary's output, input and net equal the two accounts' movements for the month; a document dated 23:30 on
   the last day in Dhaka is in that month.
4. A negative net carries forward into next month's summary.
5. A settlement of a locked month posts one balanced journal; a second settlement for that month is refused; a
   repeated `POST` with the same key returns the first result.
6. `vat_registered` can't be turned on without a BIN; only the Owner can change it.
7. Isolation: business Y gets no VAT figures of X.

## Dependencies

- **Q15 answered "yes"** (owner and accountant). Q16 and Q25 answered before Sales' VAT line is built.
- ADR 0013 (#39), 0022 (#60, Farhan), 0028 (#66, Farhan), 0035 (#74), 0046 (#88).

## Size and PR split

| Part | Contents                                                                  | Size |
| ---- | ------------------------------------------------------------------------- | ---- |
| 1    | the switch, the two roles, the summary report; tests 1, 3, 4, 6, 7        | ~300 |
| 2    | settlement; test 5                                                        | ~200 |
| —    | Sales and Purchase VAT postings (test 2) in Farhan's invoice and bill PRs | –    |

## Consequences

- **Easier:** if the business is VAT registered, the monthly figure the accountant files comes straight from the
  ledger.
- **Harder:** nothing, if Q15 is "no": this plan is then closed unbuilt.
- **Undo:** turn the switch off; posted VAT stays in the ledger as it was.

## Open questions

**Decided by Munif, 21 Nov:** nothing in this plan is built unless Q15 is answered "yes". Q15, Q16, Q25 and the VAT
rates are on the **owner visit list** (the decisions sheet, #57), to ask the owner and their accountant together.

1. **Owner and accountant (Q15):** is the business VAT registered?
2. **Accountant (Q16):** VAT rounding per line or per invoice? Recommended: per line, as A8 already computes.
3. **Owner and accountant (Q25):** are prices shown to customers VAT-inclusive?
4. **Accountant:** which VAT rates apply to motorcycles and parts? Recommended: a rate per product, set by the
   Owner from the answer; no rate is hard-coded.
