# Demo seed spec

What the local demo database holds, and how the seed builds it. **Every name, code, price, address, phone number and
id in the seed is invented.** Nothing comes from `data/real/`, a real export or a real business, and the seed never
names one. Decided by Munif on 23 and 24 Nov 2026; built by Farhan as **one seed PR**.

## 1. Rules

- **Local only, through one guard.** Every step runs inside `runDemoSeed` (`businessLogic/src/demoSeed.ts`, #117),
  after its check: it refuses `NODE_ENV=production` and any database host other than `localhost`, `127.0.0.1` or
  `[::1]`. No step opens its own connection or runs as a separate script.
- **No credential in a file.** The owner signs in with `DEMO_OWNER_EMAIL` and `DEMO_OWNER_PASSWORD`; the four other
  logins share `DEMO_USERS_PASSWORD`. All come from the environment, are validated, and are never logged or printed.
- **A second run writes nothing.** Fixed invented ids, `INSERT … ON CONFLICT DO NOTHING`, and a seed version check.
- **Through the real paths.** Money and stock are written only the way the app writes them, so the books and the
  documents agree from the first run:
  - stock comes in through `IStockService.move` with kind `opening` (invariant 3: on hand is the sum of movements);
  - sales go through `POST /v1/invoices`'s Manager, payments through `POST /v1/payments`'s (invariant 4: each
    document posts its journal and movements in one transaction);
  - a seeded row that skips these paths (an invoice without its journal, a unit without its movement) is a bug.
- **Data lives in code.** The catalogue, customers and staff are typed constants in the seed, so a reviewer reads
  every value in the diff.

## 2. The shape

| Part                   | Count          | Detail                                                                                                                                                                                                                                                                                             |
| ---------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization, business | 1 + 1          | "Sample Motor Group", business "Sample Motors". One owner.                                                                                                                                                                                                                                         |
| Branches               | 2              | **Showroom** (bikes and parts), invoice series `INV-` → `INV-000001`. **Service centre**, invoice series `SVC-2026-` → `SVC-2026-000001` (decision 1). Each branch also gets `receipt` and `journal` series.                                                                                       |
| Chart of accounts      | 1 per business | All 12 account roles mapped (section 4).                                                                                                                                                                                                                                                           |
| Parts                  | ~40            | Quantity-tracked products. Codes in a three-five-two character format (`5VX-F5805-10`, invented), SKUs like `PRT-BRK-0214`, names like "Brake pad set, front, 150 cc", prices ৳180.00 to ৳9,500.00; categories Parts, Oil, Tyres, Accessories. Brand field "Sample Bikes"; no real brand anywhere. |
| Bike models            | 8              | Serial-tracked products: "Velo 150 V3", "Ridge 125 S", …, prices ৳1,45,000.00 to ৳4,10,000.00.                                                                                                                                                                                                     |
| Registration fee       | 1              | A product with the **pass-through fee** setting on and **VAT on fee** off (the default), seeded by the vehicle pack's seed step. It posts to `pass_through_payable`, never revenue (invariant 8). Waits for item 3d.                                                                               |
| Opening stock          | all parts      | On-hand quantities at the showroom, each brought in by an `opening` movement with its unit cost; the branch's weighted average follows from those movements.                                                                                                                                       |
| Chassis units          | ~30            | 2 to 6 per model at the showroom; chassis numbers like `VL3-000101`, engine numbers like `E3V-550101`; each with its own cost and its own `opening` movement (invariant 7). Chassis and engine live in the Vehicle pack's `vehicle_unit` (spec O-11).                                              |
| Customers              | 20 + walk-in   | Invented names; addresses as invented village + upazila + district, no house numbers (decision 4); phones `+88017000000NN` in order (decision 3). Plus the business's one walk-in party (ADR 0019).                                                                                                |
| Sales                  | 25             | 18 paid in full, 4 partly paid (a due left), 3 fully due; mostly parts at the counter, 5 bike sales, 3 of them with a registration fee. Payments in cash and bKash (with an invented transaction id). A due always names a real customer, never the walk-in party.                                 |
| Staff directory        | ~25            | Designations: Manager (2), Accounts (2), Service Manager (1), Technician (8), Sales Executive (6), Office Assistant (4), Admin (2), across both branches.                                                                                                                                          |
| Login users            | 5              | Section 5.                                                                                                                                                                                                                                                                                         |

## 3. Order of steps

1. Organization, business, branches, number series, system roles, staff, the five logins (all exist today).
2. Chart of accounts with all 12 roles mapped (section 4).
3. Catalogue: parts, bike models, the registration-fee product.
4. Opening stock: parts by quantity, then chassis units, each through `IStockService.move` (kind `opening`).
5. **The opening journal, one per branch, right after its opening stock** (section 4a). Stock movements post no
   journal, so without it the books would show no inventory at all.
6. Customers and the walk-in party.
7. Sales and their payments, through the invoice and payment Managers, dated across the last weeks by the server's
   clock rules (no back-dating into a locked period once A17 exists).

## 4. The chart: all 12 roles mapped

The accounting core (ADR 0013) seeds no chart, and an unmapped role is refused (`409 journal.role_unmapped`), so the
seed must map every role for every demo business, or nothing posts.

| Role                                                                       | Account type                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `cash`, `bank`, `mobile_money`, `card_clearing`, `receivable`, `inventory` | asset                                                                          |
| `customer_advance`, `pass_through_payable`, `vat_output_payable`           | liability (the database refuses any other type for the first two, invariant 8) |
| `sales_revenue`, `service_revenue`                                         | income                                                                         |
| `cost_of_goods_sold`                                                       | expense                                                                        |

The chart also holds one account mapped to no role: **Opening balance equity** (type `equity`), the credit side of
the opening journal (section 4a).

## 4a. The opening journal (Munif, 24 Nov)

- **One balanced journal per branch:** Dr `inventory` / Cr **Opening balance equity**. The amount is the opening
  stock's value: the sum of on hand × the branch's average cost over counted products, plus each serial unit's own
  cost (invariant 7).
- **Opening balance equity is an ordinary account** of type `equity`, in the chart but not mapped to any of the 12
  roles.
- `source_type = 'opening_stock'`, dated the seed's opening day, numbered from the branch's `journal` series.
- **The seed posts it as the migration owner**, inside the guard: `PostingService` posts by role only, and there is
  no equity role. The database still checks it: balanced at commit, permanent, `numeric(18,2)`.
- **The books then agree with the stock:** the ledger's inventory balance (the dashboard's stock value) equals the
  stock side, per business, and stays equal through sales (`StockValue.int.test.ts`, #202). An average that rounds
  to paisa can leave a paisa between them, by design (ADR 0021 §2).

## 5. Logins and their system roles

| Login                      | Designation     | System role        | Scope              |
| -------------------------- | --------------- | ------------------ | ------------------ |
| owner (`DEMO_OWNER_EMAIL`) | Owner           | `owner`            | the whole business |
| manager                    | Manager         | `business_manager` | the business       |
| accounts                   | Accounts        | `accountant`       | the business       |
| service.manager            | Service Manager | `branch_manager`   | the service centre |
| sales                      | Sales Executive | `cashier`          | the showroom       |

Technician, Office Assistant and Admin are staff rows without a login.

## 6. Decisions (Munif, 23 Nov)

1. **`SVC-<year>-`: a new series row per year.** Each new year adds a `number_series` row with the new prefix and
   `next_value` 1; the step belongs in the year-end checklist. No `{year}` token.
2. **Admin is a designation, separate from the owner login.**
3. **Phone numbers** use the repo's obviously fake sequential pattern (`+8801700000001`, …).
4. **Addresses:** real upazila and district names, invented villages, no house numbers.
5. **Chassis units are seeded with their opening movements**, never as bare rows.
6. **Part codes** use the three-five-two format with an invented brand, never a real part number.

## 7. Tests the seed PR carries

- A second run writes nothing.
- The guard refuses production and a non-local host.
- Every account role resolves for every demo business.
- The trial balance balances, and every sale and payment has its journal.
- For every product and branch, `stock_balance` equals the sum of its movements.
- **Every branch's opening journal balances**, and the ledger's inventory balance equals on hand × average cost plus
  the serial units' own cost, per business, after the opening and after the sales.
- Each customer's due from the ledger equals the sum of their open invoices' dues (ADR 0026 section 3).
- No seeded value matches a pattern from the real-data audit (no real names, phones or brands).

## 8. Known gaps the demo doesn't show

- Void and reissue (C14).
- The period lock and day close (A17).
- Purchases and service jobs: stock comes from opening movements, not purchase bills.
