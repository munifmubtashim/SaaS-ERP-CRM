# Frontend wiring: which screen reads which API

How each frontend service moves from its sample data to the real API, so either developer's session can wire a screen
without rediscovering the details. Written by Munif's session on 24 Nov 2026; keep it current with each wiring PR.
**Every value in examples and tests is invented.**

## The switch: `VITE_DEMO_DATA`

- `packages/frontend/src/services/demoData.ts` parses it: unset, `all`, `none`, or a comma list of service keys
  (`report` means every `report.*` key). A production build never uses sample data, whatever the flag says.
- **Unset** means "sample only where no API exists yet" (`DEMO_DEFAULT`). When a route exists, take its key out of
  `DEMO_DEFAULT` in the wiring PR, so a developer gets the real API by default and can still force the sample by
  naming the key.
- **Every figure from a sample service shows the "Demo data" badge** (`DemoBadge`, `useDemoData`). A card fed by two
  calls is marked while either is sample.
- A service with several calls that go live at different times gets per-call keys and a `<Service>ServiceSwitch`
  that picks real or sample per call (copy `ReportServiceSwitch` in `reportService.ts`).
- If the backend is down, the app falls back to sample data for every service and marks it (demo-local4).

## Services

| Service (key)                                | Endpoint                                                                | Shared shape                                                                                                       | Status                                                                                                | Still sample                              |
| -------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Owner dashboard (`report.ownerDashboard`)    | `GET /v1/reports/owner-dashboard` (#197)                                | `ownerDashboardSchema` (#196): dues, collectionsToday, revenueMonth, stockValue (null without `product.cost.view`) | **Wired** (#200), real by default                                                                     | every other `report.*` call: no route yet |
| POS items (`sales.pos`)                      | `GET /v1/stock/pos-catalog` (#199)                                      | `posCatalogSchema` (#198): items with price, category, tracking, on hand, units in stock; `walkInPartyId`          | **Wired** (#205), real by default                                                                     | —                                         |
| Complete sale (`sales.pos`)                  | `POST /v1/invoices` (#191), `Idempotency-Key` required                  | `postInvoiceSchema` / `postedInvoiceSchema` (#185)                                                                 | **Wired** (#205), real by default; refusals shown inline                                              | —                                         |
| Invoices list and detail (`sales.invoices`)  | none yet                                                                | provisional `invoiceSummarySchema`, `invoiceDetailSchema`                                                          | No route                                                                                              | all                                       |
| Stock on hand (`inventory`)                  | `GET /v1/stock` (#199): `search`, `branchId`, `cursor`, `limit`         | `stockRowSchema` / `stockListResponseSchema` (#34)                                                                 | Route built; **to wire** (the page uses provisional `/v1/stock/items` shapes: map the rows into them) | movements, item detail                    |
| Customers (`party`, to add)                  | Farhan's F2 (party routes, walk-in party)                               | ADR 0019 / 0006 shapes                                                                                             | Not built                                                                                             | all                                       |
| Customer payments (`sales.payments`, to add) | Farhan's F3, `POST /v1/payments` (ADR 0026), `Idempotency-Key` required | ADR 0026 `recordPaymentSchema`, `salesPaymentSchema`                                                               | Not built; reuses `SalesPaymentQuery` (#190)                                                          | all                                       |
| Dues (`party.dues`, to add)                  | Farhan's F5, `GET /v1/parties/:id/dues`                                 | ADR 0026 `customerDuesSchema`; totals from `IPartyLedger.balances` (#195)                                          | Not built                                                                                             | all                                       |
| Products (`product`)                         | `GET/POST/PATCH /v1/products` (#131)                                    | `product.schema.ts`                                                                                                | Routes built                                                                                          | models (`/v1/products/models`)            |
| Units (`vehicle`)                            | none yet                                                                | provisional `vehicleUnitSchema`                                                                                    | No route                                                                                              | all                                       |
| Businesses (`organization`)                  | `GET /v1/me/businesses` (M2)                                            | `myBusinessesResponseSchema`                                                                                       | No route                                                                                              | all                                       |

## Controls that write data, screen by screen (24–25 Nov)

Every button or form that creates or changes data, the route it needs, and who builds what. "Sample only" means the
control works but only against sample data (marked Demo data); "missing" means it isn't in the UI.

| Screen         | Control                                     | In the UI                                              | Route it needs                                              | Route status                                | Status                                          | Who                                 |
| -------------- | ------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------- | ----------------------------------- |
| Products       | Add, edit, archive a product                | **Missing** (the page only switches views)             | `POST` / `PATCH /v1/products`                               | **Built** (#131)                            | UI form missing                                 | Munif                               |
| Inventory      | Adjust stock                                | Button shown, **disabled**                             | an adjustment route (none planned for the slice)            | Not built                                   | Missing both sides                              | Munif                               |
| Inventory      | Transfer between branches                   | **Missing**                                            | a transfer route                                            | Not built                                   | Missing both sides                              | Munif (after the slice)             |
| Customers      | Add or edit a customer                      | **Missing** on the UI stack; #33 and #51 are read-only | party routes (F2)                                           | Not built                                   | Missing both sides                              | **Farhan**                          |
| Customers      | Record a payment                            | Only on Farhan's #53                                   | `POST /v1/payments` (F3, ADR 0026)                          | Not built (`SalesPaymentQuery` ready, #190) | Built in the UI, route missing                  | **Farhan**                          |
| POS            | **Complete sale**                           | Yes, with an Idempotency-Key reused on a retry         | `POST /v1/invoices` + `GET /v1/stock/pos-catalog`           | **Built** (#191, #199)                      | **Done** (#205): real by default, errors inline | Munif                               |
| POS            | Cart: add, change, remove, clear            | Yes                                                    | none (screen state)                                         | —                                           | Not a write                                     | —                                   |
| POS › Invoices | Collect a payment                           | Yes                                                    | `POST /v1/payments` (F3), not the provisional path it calls | Not built                                   | Sample only (`sales.invoices`)                  | **Farhan** (route); rewire after F3 |
| Dashboard      | Needs action: Review, Match, Reorder, Merge | Shown, **disabled**                                    | one route each                                              | Not built                                   | Placeholders                                    | Later                               |
| Dashboard      | Refresh; forecast weeks                     | Yes                                                    | read only                                                   | —                                           | Not writes; dues and revenue are real (#200)    | —                                   |

## Wiring notes per screen

**POS.**

- Map each catalog item to the POS item: id is `productId`, kind is `tracking`, price is `sellPrice`, available is
  `onHand`, serial numbers come from `units`.
- Keep the serial number → unit id map for the sale.
- Send `partyId` = `walkInPartyId` until customers exist (F2). A sale that leaves a due on the walk-in party is
  refused with 409 `invoice.due_needs_customer`: show it as the form's error.
- The client never sends a price, a cost or a date.
- The category comes from the catalog; a product without one shows a dash and has no filter button (#205).

**Inventory.** `GET /v1/stock` rows are one product at one branch. The cursor is opaque: pass `nextCursor` back as
`cursor`. A bad cursor is 400 `page.cursor_invalid`.

**Payments and dues (Farhan).**

- The receipt number comes from the server (ADR 0016).
- bKash, bank and card need the transaction id. "Due" is not a method.
- A payment above the invoice's due is 409 `payment.exceeds_due`.
- The dues total comes from the ledger; the open-invoice list comes from the documents; a test checks they agree
  (ADR 0026 §3).

**Money and cost.**

- Money and quantities are strings everywhere; format them only with the shared helpers.
- No cost ever reaches the browser except `stockValue` for callers with `product.cost.view`.

## How to test a wiring PR

1. **Tests first.**
   - In the service test, with a fake `IHttpClient`: the real service calls the right path with the right body and
     headers (`Idempotency-Key` on POSTs), and parses the answer with the shared schema.
   - The switch picks real or sample per key.
   - The default demo set no longer holds the key.
2. **Screen test.**
   - With the sample, the figures are marked "Demo data".
   - With a fake real service, they aren't, and refusals (403, 409 codes) show the translated message.
3. **The backend's own route tests** cover the API against real Postgres (`api/test/isolation/*.isolation.test.ts`).
   The frontend tests never need a database.
4. **Before pushing:** `npm run format:check`, `npm run check`, `npm run test:integration`, `npm run test:isolation`
   and `npm run db:migrate:check`, on a test database rebuilt from scratch.
5. **To see it end to end,** use the local integration branch `demo-local4`: `npm run demo:reset` (rebuild, migrate,
   seed) and `npm run demo:start` (api and frontend). Stop the api to see every screen fall back to marked sample
   data.
