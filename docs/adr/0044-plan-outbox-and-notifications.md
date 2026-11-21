# 0044: Plan for the outbox and in-app notifications (B11, built as B12)

| Field               | Value                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                                    |
| Date                | 2026-11-21                                                                                                  |
| Deciders            | Munif, Farhan                                                                                               |
| Owner               | Munif (platform)                                                                                            |
| Spec / roadmap refs | spec C-14, D-04; CLAUDE.md invariant 10, tenancy rules, "never log …"; ADR 0003, 0005, 0012, 0032; plan 2.4 |

The build plan reserved ADR 0011 for "outbox, notifications and the Action Center"; that number was taken (#70's
map). The Action Center's workflow is its own plan, ADR 0045.

## Context

- **Invariant 10:** domain events are written to the outbox **in the same transaction** as the change. The relay
  that sends them on waits for the worker (ADR 0003).
- **C-14:** in-app, SMS or email notifications by rules such as low stock, large discount, void and cash variance.
  Plan 1.5 replaces SMS with WhatsApp, which waits for the relay; until then a "Share on WhatsApp" link sends by
  hand.
- Several plans already name events: `stock.low` (ADR 0042), `invoice.posted`, `discount.approved`,
  `day.closed_with_variance`.

Two new tenant tables, a change to what every request transaction carries, and an invariant, so CLAUDE.md requires
an agreed plan. No code is in this PR.

## Decision

### 1. `outbox_event` (platform, migration `outbox`)

| Column                       | Notes                                                       |
| ---------------------------- | ----------------------------------------------------------- |
| `id`                         | `uuid_v7()`, so ids sort in write order                     |
| `business_id`, `branch_id`   | `branch_id` null for business-level events                  |
| `type`, `type_version`       | for example `stock.low`, 1                                  |
| `subject_type`, `subject_id` | what it is about                                            |
| `payload`                    | jsonb, checked against the event's Zod schema before insert |
| `occurred_at`, `created_by`  | the request's time and caller                               |
| `relayed_at`                 | null in release 1; set only by the future relay's own role  |

- **`erp_app` may only `INSERT`.** No `SELECT`, `UPDATE` or `DELETE`: nothing in a request reads the outbox. The
  relay gets its own least-privilege role with the worker.
- Forced RLS, with an `INSERT` policy on the business scope (and `branch_is_active` when `branch_id` is set); the
  `TRUNCATE` trigger; no `DELETE` for anyone (#27).
- **Payloads carry ids and figures, never personal data:** no names, phone numbers or NIDs. A test checks every
  schema in the catalogue for such fields.

### 2. The event catalogue (shared)

`shared/src/events/` holds one Zod schema per event type and version, and the list of types. A module adds its
event in its own PR (shared code: both review). The catalogue starts with the four types above; each later plan
adds its own.

### 3. Writing events: `IEventOutbox` (ADR 0012 style)

- A businessLogic contract, `IEventOutbox.append(event)`, implemented by `OutboxQuery` in dal.
- `OutboxQuery` writes through `currentClient()`, the request's own transaction (ADR 0005). So **an event commits or
  rolls back with its change**, and a call outside a tenant transaction fails, as every tenant query does.
- Managers call it; Controllers never do.

### 4. In-app notifications

| Table          | Columns and notes                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `notification` | `business_id`, `user_id`, `type`, `payload` (jsonb, the same rule: no personal data), `created_at`, `read_at` |

- Written by **`Notifier`** (businessLogic, behind `INotifier`) in the **same transaction** as the change, for the
  alerts C-14 names: low stock, large discount, void, cash variance, plus an Action Center assignment (ADR 0045).
- **Recipients come from fixed rules in release 1** (question 2): each notification type names a permission code,
  and the recipients are the business's users who hold it for the branch in question. Auth provides
  `IRecipientSource.usersWith(permission, branchId)` (A4).
- **A user reads only their own notifications, enforced by RLS, not only by a `WHERE`** (question 1):
  `user_id = (SELECT app_user_id())`, so a missing filter in a Query can't leak another user's alerts.
- `erp_app` may `INSERT` (for any user of the business in scope), `SELECT` its own, and `UPDATE (read_at)` on its
  own. No `DELETE`.
- Routes: `GET /v1/notifications` (cursor pagination, newest first), `POST /v1/notifications/:id/read`, `POST
/v1/notifications/read-all`. Permission `platform.notification.view`, held by every role. Each gets its
  isolation case.
- The bell shows the unread count; text comes from `i18n` (en, bn) by `type`, never stored in the row.

### 5. WhatsApp and email

They wait for the relay (ADR 0003). Until then, screens that produce a message (a payment reminder, a booking
confirmation) offer a **"Share on WhatsApp"** link (`https://wa.me/<number>?text=…`), which the user sends by hand.
Nothing is sent by the server, so nothing is logged with the phone number.

## Invariants touched

10 (events in the same transaction), tenancy (two business-scoped tables; a per-user RLS rule), nothing deleted
(#27), logging rules (no personal data in payloads).

## Tests to write first

1. A change that rolls back leaves no `outbox_event` and no `notification`; one that commits leaves exactly one of
   each.
2. `append` outside a tenant transaction fails with "tenant scope not set".
3. `erp_app` can't `SELECT`, `UPDATE` or `DELETE` `outbox_event`, and can't `TRUNCATE` it.
4. An event whose payload fails its schema is refused before insert; no schema in the catalogue has a field named
   like a name, phone or NID.
5. Notifications: user A sees only A's; with a Query that forgets its `WHERE user_id`, RLS still returns only A's.
6. `read` and `read-all` change only `read_at`, only on the caller's rows.
7. Recipients: a `stock.low` for branch 1 reaches the users holding the rule's permission for branch 1, not branch
   2's.
8. Isolation: business Y sees nothing of X's notifications, and can't mark them read.

## Dependencies

- ADR 0005 (#14): `runInTenantScope` gains `app.user_id` (question 1), as an amendment made after #8 merges.
- A4 (ADR 0009 parts 3 and 4) for users, roles and scopes; `IRecipientSource` comes with them.
- ADR 0012 (#38): `IEventOutbox` and `INotifier` join its contract list.

## Size and PR split

| Part | Contents                                                        | Size |
| ---- | --------------------------------------------------------------- | ---- |
| 1    | `outbox_event`, the catalogue, `IEventOutbox`; tests 1 to 4     | ~350 |
| 2    | `app.user_id`, `notification`, `Notifier`, routes; tests 5 to 8 | ~400 |

## Consequences

- **Easier:** every later alert, the relay, WhatsApp and webhooks read one table, and no event is lost to a crash
  between the change and the send.
- **Harder:** every request transaction carries one more setting; the outbox grows until the relay archives it.
- **Undo:** before go-live, drop both tables in a new migration; removing `app.user_id` is an ADR 0005 change.

## Open questions (decided)

1. ~~**Munif (tenancy, ADR 0005):** add `app.user_id` to every request transaction?~~ **Decided by Munif, 21
   Nov:** yes, `SET LOCAL app.user_id` on every request with an `app_user_id()` function, so RLS limits
   `notification` to its user. It is **an amendment to ADR 0005, made after #8 merges**; part 2 of this plan waits
   for it.
2. ~~**Munif:** fixed recipient rules, or rules each business can change?~~ **Decided by Munif, 21 Nov:** fixed
   rules (type → permission) in release 1.
3. ~~**Munif:** keep `outbox_event` rows forever in release 1?~~ **Decided by Munif, 21 Nov:** yes; the relay's ADR
   decides archiving.
