# 0048: Plan for plate, odometer, km warranty and service reminders (Vehicle pack, E5)

| Field               | Value                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                                       |
| Date                | 2026-11-21                                                                                                     |
| Deciders            | Munif, Farhan                                                                                                  |
| Owner               | Munif (Vehicle pack). Farhan owns the Service jobs these attach to (ADR 0029, #67)                             |
| Spec / roadmap refs | spec SV-01, SV-05, SV-06, SV-10, R-06, O-11; CLAUDE.md "Generic names in the core"; ADR 0020, 0029, 0044, 0045 |

## Context

- **SV-01:** a job card is opened by chassis, **number plate** or phone, with the **odometer reading**.
- **SV-05:** opening a job shows whether the unit is under warranty **by date and kilometres**.
- **SV-10:** a reminder when the next service is due **by date or kilometres**.
- **O-11 and CLAUDE.md:** plate, odometer and km belong to the **Vehicle pack only**; no core Service table has them.

ADR 0029 (#67, Farhan) keeps Service generic and leaves part 5, "plate, odometer, km rule", to the pack, reviewed
by Munif. This ADR plans that part and the reminders. New pack tables, so CLAUDE.md requires an agreed plan. No code
is in this PR.

## Decision

### 1. Tables (Vehicle pack, `vehicle.prisma`, migration `vehicle_service`)

| Table                     | Columns and notes                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `vehicle_unit` (ADR 0020) | gains `plate_no` (nullable; unique per business when set, stored normalised: upper case, single spaces), `plate_set_at`, `plate_set_by`  |
| `odometer_reading`        | `serial_unit_id`, `km` (`integer` ≥ 0), `read_on`, `source_type` (`service_job`, `sale`, `manual`), `source_id`, `note`; **append-only** |
| `vehicle_job_detail`      | ADR 0029's pack row: `job_id`, `odometer_reading_id`, the plate as it was when the job opened                                            |
| `vehicle_model_rule`      | per `product_id` (a model): `warranty_km`, `service_interval_km`, `service_interval_days`; `version`                                     |

The rules on #27 and #31 apply (business-scoped; `odometer_reading` append-only: `SELECT, INSERT` only). The core
Service tables gain nothing (ADR 0029 test 13 keeps checking that).

### 2. Plate

- Set when the plate is handed over (R-06, the registration case, a later pack plan) or at the service counter for a
  vehicle bought elsewhere (SV-06). A change writes an activity event with the old and new plate (ADR 0032).
- **Job search by plate** (SV-01): the pack registers a search provider for ADR 0031's search (#69, Farhan), so the
  core search box finds a unit by plate when the pack is on, and the core never names the field.

### 3. Odometer and the km warranty

- Opening a job records a reading in the same transaction (`source_type = 'service_job'`). A sale records the
  delivery reading, normally 0 to a few km.
- **A reading below the unit's latest reading is refused** (`odometer.went_back`) unless it carries a note (meter
  replaced, typing error), which is kept with the reading (question 1).
- **Under warranty (SV-05)** = ADR 0029's date check **and**, when the model has `warranty_km`, the latest reading
  is at or under it. The pack supplies this as `IWarrantyLimit` to ADR 0029's Manager, which stays generic.

### 4. Service reminders (SV-10)

- **Next service due** for a unit: the later of its last job date or sale date plus `service_interval_days`, or
  its last reading plus `service_interval_km`, **whichever comes first**. The km date is estimated from the unit's
  average km per day over its readings (at least two readings 7 days apart; otherwise the date rule alone).
- **Release 1 has no automatic sending** (no relay, ADR 0044). Instead:
  - an Action Center kind **`service_due`** (pack only, ADR 0045) lists units due in the next 7 days or overdue;
  - each row has a **"Share on WhatsApp"** link with the reminder text in Bangla or English, sent by hand.
- When the relay exists, the same rows become automatic reminders with templates and a log (SV-10, C-14).

### Routes and permissions (pack routes, mounted only when the pack is on)

| Route                                                          | Permission                                     |
| -------------------------------------------------------------- | ---------------------------------------------- |
| `PUT /v1/vehicle-units/:id/plate`                              | `vehicle.plate.edit`                           |
| `POST /v1/vehicle-units/:id/odometer-readings`, `GET` the same | `vehicle.odometer.record`, `vehicle.unit.view` |
| `GET`, `PUT /v1/vehicle-models/:productId/rule`                | `vehicle.model_rule.manage` for `PUT`          |

Default mapping: Owner, Business Manager and Branch Manager all; Cashier records odometer readings (the service
counter); Accountant views.

## Invariants touched

O-11 (pack-only fields), tenancy (business-scoped pack tables), append-only readings, hidden fields (none).

## Tests to write first

1. With the pack off, no route, table column in core responses, or search result mentions a plate or odometer.
2. A plate is unique per business after normalising (`dhaka metro-la 12-3456` equals `DHAKA METRO-LA 12-3456`);
   the same plate in another business is allowed.
3. Opening a job records one reading in the same transaction; a rolled-back job leaves none.
4. A reading below the latest is refused without a note and accepted with one.
5. Warranty: inside the date but over `warranty_km` is not under warranty; inside both is; a model without
   `warranty_km` uses the date only.
6. Next service due: 90 days or 3,000 km, whichever first; with readings averaging 50 km a day, 3,000 km comes first
   (day 60); with one reading only, the date rule applies.
7. The `service_due` kind lists units due within 7 days, only when the pack is on, and its WhatsApp link has the
   customer's number and no other customer's data.
8. Isolation: business Y can't read X's plates, readings or rules, or find X's unit by plate.

## Dependencies

- ADR 0020 (#58) for `vehicle_unit`; ADR 0029 (#67, Farhan) for jobs and the warranty check; ADR 0031 (#69, Farhan)
  for search; ADR 0045 (#87) for the Action Center kind; ADR 0044 (#86) for the later relay.

## Size and PR split

| Part | Contents                                                                            | Size |
| ---- | ----------------------------------------------------------------------------------- | ---- |
| 1    | plate, readings, `vehicle_job_detail`, the km warranty; tests 1 to 5, 8             | ~350 |
| 2    | model rules, next-service-due, the `service_due` kind and WhatsApp link; tests 6, 7 | ~300 |

This replaces ADR 0029's part 5 (`feat/vehicle-job-detail`); Farhan's review of part 1 confirms the hand-off.

## Consequences

- **Easier:** the service counter finds a bike by its plate and sees warranty by date and km.
- **Harder:** km-based reminders depend on readings; a unit that never comes back has only the date rule.
- **Undo:** before go-live, drop the pack tables and the column in a new migration; core is untouched.

## Open questions

1. ~~**Munif:** a lower odometer reading?~~ **Decided by Munif, 21 Nov:** allowed with a note, kept with the reading
   and in the activity record.
2. ~~**Munif:** who enters warranty km and service intervals?~~ **Decided by Munif, 21 Nov:** the Owner, per model;
   **no defaults**, so a model without a rule has date-only warranty and date-only reminders.
3. **Farhan (open, his decision):** does ADR 0029's warranty check take an `IWarrantyLimit` from the pack, and is
   ADR 0029's part 5 handed over to this plan?
