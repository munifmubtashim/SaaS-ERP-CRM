# Org, auth and dashboard UI, part D: owner dashboard (M6)

## What was built

The home page is now the owner dashboard. It answers "how much are customers owing me, and what came in today?"
across the businesses the owner can see. It runs against a mock report service until
`GET /v1/reports/owner-dashboard` exists (M6 backend).

- **One hero number:** total dues, in taka with lakh grouping (`৳ 16,21,817.50`).
- **One supporting figure:** collections today.
- **When:** "As of" with the date and time in Dhaka, because the real figures will come from snapshots.
- **By business:** one row per business with its dues and collections today, numbers right-aligned.
- **States:** loading, could not load (with Try again), and no business figures yet.
- The old home page (API and database status) moved to `/status`, one link away.

## Request flow

1. The user opens `/`; `HomePage` renders `OwnerDashboard`.
2. `useOwnerDashboard` asks `report.ownerDashboard()` through `IReportService` (today the mock).
3. The answer matches the shared `ownerDashboardSchema`: money as text such as `"1234567.50"`.
4. The screen formats every amount with `formatMoneyBDT` (Bangla digits in Bangla) and the time with
   `formatDateTimeBD`. No money arithmetic happens in the browser: the totals come from the server.
5. When the M6 API exists, `createServices` switches to `ReportService`, which already calls the route.

## Why each file exists

- `features/report/OwnerDashboard.tsx`: the screen; renders only.
- `features/report/useOwnerDashboard.ts`: loading the figures (TanStack Query).
- `services/reportService.ts`: `IReportService` and the HTTP class for the future route.
- `services/mock/MockReportService.ts`: sample figures for "Demo Motors" and "Sample Traders".
- `app/HomePage.tsx`, `app/StatusPage.tsx`, `app/router.tsx`: dashboard on `/`, status on `/status`.
- `i18n/en.ts`, `i18n/bn.ts`: every string in English and Bangla.
- `shared/src/utils/date.ts` (`formatDateTimeBD`, in PR #10): the date-and-time format in Dhaka.

## Five questions an interviewer could ask

1. Why does the browser not add up the per-business figures to get the totals?
2. Why show "As of" on a dashboard? What would you do if the snapshot is hours old?
3. How do you format ৳ amounts with lakh grouping without ever turning them into floats?
4. Why is this screen read-only, and how does that connect to ADR 0005's read-only group routes?
5. What would you put on this screen next, and what would you leave off?
