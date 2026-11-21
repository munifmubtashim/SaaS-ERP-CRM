# 0043: Plan for attachments and exports (B13, built as B14)

| Field               | Value                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| Status              | Proposed                                                                                                       |
| Date                | 2026-11-21                                                                                                     |
| Deciders            | Munif, Farhan                                                                                                  |
| Owner               | Munif (platform: table, storage, routes). Farhan owns the customer Documents tab (A10, F1b)                    |
| Spec / roadmap refs | spec C-16, C-11, C-12, CR-06, I-14; CLAUDE.md tenancy rules, "never log NIDs"; ADR 0005, 0032, 0033; plan 2.10 |

The build plan reserved ADR 0016 for this; that number was taken, so it is 0043 (#70's map).

## Context

- **C-16:** documents and photos can be attached to customers, units, purchases, expenses and jobs.
- **C-12:** sensitive data is encrypted. A customer's NID copy is the most sensitive file the system will hold.
- **I-14 and the interface standards:** tables export to Excel and PDF.
- Plan 2.10: one `attachment` table and MinIO, presigned URLs, a `restricted` flag that needs a permission, and a
  `view_sensitive` event on every restricted download. The first user is the customer **Documents** tab.

It adds a tenant table, object storage and a permission, and touches NID data, so CLAUDE.md requires an agreed
plan. No code is in this PR.

## Decision

### Table `attachment` (platform, migration `attachments`)

| Column                                      | Notes                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `subject_type`, `subject_id`                | `party` in release 1; `serial_unit`, `purchase`, `expense`, `service_job` as each screen adds it |
| `object_key`                                | `b/<business_id>/<attachment_id>`, made by the server, **never** from client input               |
| `file_name`, `mime`, `size_bytes`, `sha256` | as declared at upload, checked at confirm                                                        |
| `restricted`                                | boolean; NID copies and anything the uploader marks                                              |
| `status`                                    | `pending` (URL issued), `ready` (confirmed), `removed`                                           |
| `removed_by`, `removed_at`                  | set once when a user removes it                                                                  |

Business-scoped (no `branch_id`). The rules on #27 and #31 apply: forced RLS, no `DELETE`, the `TRUNCATE` trigger,
key columns frozen. `erp_app` may `UPDATE (status, removed_by, removed_at, updated_at)` only.

### Storage

- One private bucket; every key starts with the business id. Default encryption on the bucket (MinIO SSE locally,
  the provider's server-side encryption in production) for C-12.
- **The api never streams files.** Upload and download use presigned URLs: `PUT` valid 5 minutes, `GET` valid 60
  seconds.
- The S3 client sits behind `IObjectStore` (`presignPut`, `presignGet`, `head`), a contract businessLogic owns.
  **Where the implementing class lives is still open** (question 2).

### Flow

1. **Start:** `POST /v1/attachments` with the subject, `fileName`, `mime`, `sizeBytes`, `sha256`, `restricted`.
   - The subject must exist in the active business: each `subject_type` is a class behind `IAttachmentSubject`
     (open/closed), and an unknown or other business's subject is `404`.
   - Allowed: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`, up to 10 MB (question 3). Anything else
     is `400 VALIDATION_FAILED` before a URL exists.
   - Inserts a `pending` row and returns a presigned `PUT` that requires the declared length, type and SHA-256
     checksum, so MinIO rejects a different file.
2. **Confirm:** `POST /v1/attachments/:id/confirm`. The server `HEAD`s the object, checks size, type and checksum,
   and sets `ready`. A mismatch leaves it `pending` and answers `409`, `attachment.mismatch`.
3. **List:** `GET /v1/attachments?subjectType=&subjectId=` lists `ready` rows; restricted ones show their name and
   date to everyone who may list, but no download link without the permission.
4. **Download:** `POST /v1/attachments/:id/download-url` (a POST, because a restricted one writes a record).
   - Restricted needs `platform.attachment.restricted.view`. Without it: `403`, and a `denied` event (ADR 0032).
   - With it: a `view_sensitive` event (who, which attachment, which subject; never the file) **commits before**
     the URL is returned.
   - The key is read from the row under RLS, so business Y can't get a URL for X's file, even with its id.
5. **Remove:** `POST /v1/attachments/:id/remove` sets `removed`. The row and the object are kept (C-11; nothing is
   deleted, #27). Erasing a person's data on request needs its own later ADR.
6. **Never logged:** file names of restricted attachments, URLs (they carry signatures), and NID numbers.

`pending` rows older than a day are listed by the nightly check (C-13) as abandoned uploads; nothing deletes them
in release 1.

### Exports (I-14)

- **CSV that opens in Excel** and **PDF of lists** are made **in the browser** from the API response, which ADR
  0033 has already redacted. No hidden field can reach an export.
- CSV: UTF-8 with a byte-order mark (so Excel shows Bangla), CRLF line ends, and every cell starting with `=`, `+`,
  `-`, `@`, tab or carriage return prefixed with `'` (spreadsheet formula injection).
- PDF of a list: the browser's print to PDF with a print stylesheet (question 4), so Bangla renders with the
  system font and no PDF library is needed.
- **Size cap:** an export asks the list endpoint for at most 5,000 rows. More than that answers ADR 0005's
  over-limit error, asking for a narrower filter; larger exports wait for the worker (ADR 0003).
- Every export writes an `export` event (ADR 0032; a new action, question 5) with the list, filter and row count.
- Shared code: `toCsv(rows, columns)` in `frontend/src/lib`, used by every table.

### Permissions

| Code                                  | Default roles                                          |
| ------------------------------------- | ------------------------------------------------------ |
| `platform.attachment.view`            | every role                                             |
| `platform.attachment.upload`          | every role except Accountant (who can't add documents) |
| `platform.attachment.remove`          | Owner, Business Manager                                |
| `platform.attachment.restricted.view` | Owner, Business Manager                                |

Exporting needs the list's own permission; there's no separate export code.

## Invariants touched

Tenancy (business-scoped table, keys prefixed and never client-made, RLS on every read), NID rules (restricted,
role-limited, every view logged, never in logs), nothing deleted (#27), hidden fields (exports come from redacted
responses).

## Tests to write first

1. Start refuses a type or size outside the list, and a subject from another business (`404`); it never returns a
   URL for those.
2. Confirm refuses an object whose size or checksum differs (`attachment.mismatch`); a matching one becomes `ready`.
3. The object key is always `b/<business_id>/<attachment_id>`, whatever the client sends.
4. A restricted download without the permission is `403` and writes `denied`; with it, a `view_sensitive` event
   exists before the URL is returned, and the event has no file name or URL in it.
5. Isolation: business Y gets `404` for X's attachment id on every route, and can't list X's attachments.
6. Remove keeps the row and the object; a removed attachment is not listed and has no download URL.
7. Logs: a test logger captures no URL, no restricted file name, and no NID through the attachment routes.
8. CSV: a cell `=1+1` is written as `'=1+1`; Bangla text survives a round trip; the file starts with the BOM.
9. Export of a list with a hidden field (cost) has no cost column for a role without `product.cost.view`.
10. An export over 5,000 rows gets the over-limit error and writes no event.

## Dependencies

- ADR 0032 (#71) for the events, ADR 0033 (#72) for the permission check and redaction, #26 for the codes.
- MinIO in `docker-compose.yml` (exists); an S3 client package (`@aws-sdk/client-s3` and its presigner).
- Party (ADR 0019, #54, Farhan) for the first subject type; the Documents tab is Farhan's (F1b).

## Size and PR split

| Part | Contents                                                                                         | Size |
| ---- | ------------------------------------------------------------------------------------------------ | ---- |
| 1    | table, `IObjectStore`, start, confirm, list, remove; tests 1 to 3, 5, 6                          | ~400 |
| 2    | restricted download, events, log checks; tests 4, 7                                              | ~200 |
| 3    | `toCsv`, print stylesheet for lists, size cap, export event; tests 8 to 10 (shared: both review) | ~250 |

## Consequences

- **Easier:** any screen can attach files with one subject class; NID copies have one guarded path.
- **Harder:** object storage becomes part of backups and restores; a file and its row must be restored together.
- **Undo:** before go-live, drop the table and empty the bucket in a new migration and a script.

## HEIC: the phones and browsers to check (question 3)

iPhones save photos as HEIC by default ("High Efficiency"), and some Android phones can too. The upload screen
turns a HEIC file into JPEG in the browser before step 1, with a decoder loaded only when a HEIC file is picked;
the server never accepts HEIC. Part 1's manual check, on real devices or a device cloud, for each row: pick a
photo from the gallery, take one with the camera, and pick a PDF. Each must arrive as JPEG or PDF under 10 MB,
upright (orientation kept), and readable.

| Device                                                                                      | Browsers                 |
| ------------------------------------------------------------------------------------------- | ------------------------ |
| iPhone on the current and previous iOS (camera set to High Efficiency)                      | Safari, Chrome           |
| Samsung Galaxy, an A series and an S series, current Android, "High efficiency pictures" on | Chrome, Samsung Internet |
| A Xiaomi or Realme on Android (common in Bangladesh)                                        | Chrome                   |
| Windows laptop, with a HEIC file copied from an iPhone                                      | Chrome, Edge             |
| Mac, with a HEIC file from Photos                                                           | Safari, Chrome           |

Each result goes in part 1's PR description. A row that can't convert shows "Please choose a JPEG or PDF" in en and
bn, never a silent failure.

## Open questions

1. ~~**Munif:** which subjects in release 1?~~ **Decided by Munif, 21 Nov:** customers only (`party`, the
   Documents tab).
2. **Munif and Farhan (open): where does the storage client live?** Both options keep `IObjectStore` as a
   businessLogic contract (CLAUDE.md line 148, "the consuming layer owns the contract", is met either way) and
   construct it once in `createManagers`, injected through constructors (line 146 is met either way). They differ
   in which other lines they stretch:
   - **A. In dal** (`dal/storage/ObjectStore.ts`).
     - Line 87, the tree: "`dal/` database access only". It would need to read "database and file storage
       access".
     - Line 116: "**dal** is the only place that talks to the database". Still true, but dal would also talk to
       MinIO.
     - Line 151: "Query = database". The storage class isn't a Query, so it gets its own name pattern
       (`<Thing>Store`).
     - Line 115: `createManagers` already "builds the dal client and Queries"; it would build the store too.
     - No lint change: dal may import any package.
   - **B. An adapter in businessLogic** (`businessLogic/src/adapters/S3ObjectStore.ts`), built in `createManagers`.
     - Line 114: "**businessLogic** holds the rules: no Express, no SQL, no Prisma". An I/O adapter isn't a rule;
       the letter holds (no Express, SQL or Prisma), the spirit doesn't.
     - Line 151: "Manager = rules". The adapter is neither a Manager nor a rule, so the single-responsibility line
       needs an "adapters" entry.
     - Line 115: `createManagers` would build the adapter too.
     - Lint: `@aws-sdk/*` isn't on businessLogic's banned list, so nothing fails, and nothing stops other I/O
       creeping in either. Adding an `adapters/` folder rule would be new lint.
   - Either way, CLAUDE.md gets a one-line change in its own small PR, reviewed by both.
3. ~~**Munif:** allowed types and size?~~ **Decided by Munif, 21 Nov:** JPEG, PNG, WebP and PDF up to 10 MB; the
   browser converts HEIC to JPEG. The devices and browsers to check are listed above.
4. ~~**Munif:** PDF of a list?~~ **Decided by Munif, 21 Nov:** the browser's print to PDF.
5. ~~**Munif:** record every export as an activity event?~~ **Decided by Munif, 21 Nov:** yes. `export` is added
   to ADR 0032's action list (#71) when that ADR is next changed.
