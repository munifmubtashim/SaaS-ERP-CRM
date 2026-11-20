# 0012: Module contracts: posting and stock services

| Field               | Value                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                    |
| Date                | 2026-11-21                                                                                  |
| Deciders            | Munif, Farhan                                                                               |
| Owner               | Munif, with Farhan's input on posting (plan row A12)                                        |
| Spec / roadmap refs | CLAUDE.md invariants 1 to 4, 6 to 8; spec A-01 to A-05, F-08; ADR 0004, 0005; plan 2.8, A12 |

## Context

**The gap.** CLAUDE.md's layer rules cover one direction, api → businessLogic → dal. They don't say how one
module's rules use another's, and every money document needs that:

- a payment (Sales, Farhan) posts a journal (Accounting, Munif);
- an invoice posts a journal and moves stock (Inventory, Munif);
- a goods receipt (Purchase, Farhan) moves stock and posts a journal.

**Invariant 4** says a source document posts its journal and stock movements in **one** transaction. ADR 0005
already makes the transaction ambient: every Query in a request uses the same transaction client, so calls
between Managers stay inside it without passing a client around.

**This ADR** fixes the contracts before Sales and Purchase code is written (roadmap Phase 2: "Munif publishes
the stock engine interface"). The tables behind them are planned in ADR 0013 (journals), 0015 (number series)
and a later Inventory ADR (stock movements). No code is in this PR.

**The numbering moved.** The plan reserved 0015 for this ADR; it is 0012 (the next free number).

## Decision

### 1. Where contracts live, and who builds them

- **The provider publishes the contract** in its own businessLogic folder:
  `businessLogic/src/contracts/provided/<IName>.ts`. This differs from CLAUDE.md's "the consuming layer owns
  the contract" rule, which is about layers. Here many consumers share one provider in the same layer, so one
  published interface beats one copy per consumer. Open question 1.
- **The provider implements it** in a class next to its Manager (`PostingService.ts`, `StockService.ts`).
- **`createManagers` builds each service once** and passes it to the Managers that need it, typed as the
  interface. A consumer never imports another module's Query, Manager or class, only the interface.
- **No transaction handling in services.** They run in the caller's ambient transaction (ADR 0005). Called
  outside a scope, `currentClient()` throws, so a misuse fails loudly.

### 2. `IPostingService` (Accounting)

```ts
interface IPostingService {
  /** Posts one balanced journal for a source document. Returns its id; the caller stores it (invariant 4). */
  post(draft: JournalDraft): Promise<{ journalId: string; number: string }>;
  /** Posts the mirror of a posted journal, pointing at it (invariant 2). Never edits the original. */
  reverse(journalId: string, reason: string): Promise<{ journalId: string; number: string }>;
}

interface JournalDraft {
  branchId: string; // business comes from the scope (ADR 0005, 0007)
  date: string; // business date in Asia/Dhaka, "YYYY-MM-DD"
  source: { type: string; id: string }; // e.g. { type: 'sales_payment', id }
  memo: string;
  lines: { role: AccountRole; debit: Money; credit: Money; partyId?: string }[];
}
```

- **Lines name account roles, not account codes.** For example `cash`, `bank`, `mobile_money`,
  `card_clearing`, `receivable`, `customer_advance`, `pass_through_payable`, `sales_revenue`. Accounting maps
  each role to an account per business (`account_role`, ADR 0013). Consumers never know the chart of accounts,
  and each business can set its own mapping (A-01 to A-05, configurable posting).
- **Pass-through money has its own role** (`pass_through_payable`), so registration fees and advances post as
  liabilities, never revenue (invariant 8). Which role a Sales line uses is Sales's rule; that the role is a
  liability is Accounting's.
- **Money is a string** (`Money`, two decimals), summed only with `shared/src/utils/money.ts`.
- **Checks in the service**, before any SQL:
  - debits equal credits;
  - each line has exactly one side above zero;
  - at least two lines;
  - every role is mapped.

  The database checks balance again at commit (ADR 0013), so a bug in the service can't post an unbalanced
  journal.

- **Errors** use existing codes with field codes, like the money helpers:

  | Problem                       | Error                                      |
  | ----------------------------- | ------------------------------------------ |
  | Unbalanced draft              | `500 INTERNAL_ERROR`, `journal.unbalanced` |
  | Role not mapped               | `409 CONFLICT`, `journal.role_unmapped`    |
  | Date in a closed day or month | `409 CONFLICT`, `period.locked` (ADR 0017) |
  | Same source posted twice      | `409 CONFLICT`, `journal.already_posted`   |

  An unbalanced draft is a programming error in the consumer, hence a 500.

### 3. `IStockService` (Inventory)

```ts
interface IStockService {
  /** Records stock movements; refuses any that would take on-hand below zero (spec F-08). */
  move(movements: StockMovementDraft[]): Promise<{ movementIds: string[] }>;
}

interface StockMovementDraft {
  productId: string;
  branchId: string;
  qtyDelta: Quantity; // three-decimal string; negative = out
  unitId?: string; // serial-tracked units (invariant 7)
  unitCost?: Money; // required on receipts; hidden field (plan 2.5)
  source: { type: string; id: string };
}
```

- **Atomic decrement** (invariant 6): each outgoing movement updates its balance with a conditional `UPDATE`
  (`... WHERE on_hand + delta >= 0`). Zero rows updated means `409 CONFLICT`, `stock.insufficient`. Never
  read-then-write in code. Two cashiers selling the last unit: one wins (spec F-02).
- **Movements are append-only** (invariant 2); a correction is a new movement with the opposite sign.
- **Locking order:** movements are applied sorted by `(productId, branchId)`, so two documents touching the
  same items can't deadlock.

### 4. Other services named now, designed in their own ADRs

| Interface              | Provider     | Designed in               |
| ---------------------- | ------------ | ------------------------- |
| `INumberSeries.next()` | Accounting   | ADR 0015 (A14a)           |
| `IUnitReservation`     | Inventory    | booking design (plan 3.5) |
| `IApprovalService`     | Platform (F) | approvals ADR (plan B7)   |

### 5. How consumers test

Each provider ships a fake in `businessLogic/src/test/` (`FakePostingService`, `FakeStockService`). Fakes
record calls and can be told to fail. A **contract test suite** runs the same cases against the fake and,
in integration tests, against the real service, so the fake can't drift from the real behaviour.

## Tests to write first

These are written with the services (ADR 0013 for posting; the Inventory ADR for stock):

1. **Contract suite, posting:**
   - a balanced draft posts and returns an id;
   - an unbalanced draft, a line with both sides, a single line or an unmapped role are refused, with nothing
     written;
   - posting the same source twice is refused;
   - `reverse` produces mirror lines pointing at the original and refuses a second reversal.
2. **Contract suite, stock:** a receipt raises on-hand; a sale lowers it; a sale below zero is refused with
   nothing written; two parallel sales of the last unit → one succeeds.
3. **One transaction (invariant 4):** a consumer that posts, then throws, leaves no journal and no movement
   (real Postgres).
4. **Lint:** a Manager importing another module's Query or Manager fails `npm run lint`.

## Migration

None in this ADR. Tables come with ADR 0013 (`accounting_core`), ADR 0015 (`number_series`) and the
Inventory ADR.

## Size and PR split

| PR                                                              | Owner | Size (approx.) | Needs first     |
| --------------------------------------------------------------- | ----- | -------------- | --------------- |
| Interfaces, `JournalDraft` and `AccountRole` types, fakes, lint | M     | ~250           | this ADR agreed |
| `PostingService` and its contract tests                         | M     | in ADR 0013    | ADR 0013 tables |
| `StockService` and its contract tests                           | M     | Inventory ADR  | stock tables    |

## Consequences

- **Easier:** Farhan can build Sales and Purchase against the interfaces and fakes now, before the tables
  exist. Account mapping per business comes free.
- **Harder:** one more kind of file (`contracts/provided`), and a lint rule to keep Managers from reaching
  into each other.
- **Keep true:** services never open a transaction; consumers never name accounts; stock never goes negative.
- **Undo:** the interfaces are code only; replacing them is a refactor with no migration.

## Open questions (Farhan, then both)

1. Is "the provider publishes the contract" acceptable, as an exception written into CLAUDE.md, or should each
   consumer own a copy (CLAUDE.md's current rule)?
2. The role list: does Sales need any role not listed (for example `discount_allowed`, `brta_payable`)? A
   vehicle-pack role would be added by the pack, not the core.
3. Should `post` accept the `Idempotency-Key`, or is the route-level key (ADR 0011) enough? Recommended:
   enough, because the journal and the key row commit together.
4. An unbalanced draft as `500`: agree, or `400`?
