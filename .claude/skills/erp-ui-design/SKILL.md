---
name: erp-ui-design
description: Use before building or changing any UI screen, component or page in this ERP/CRM. Produces a modern, minimal interface for Bangladeshi business owners and staff, not generic AI-looking output and not an old spreadsheet-style report.
---

# ERP UI design rules

Users are shop owners, accountants and counter staff in Bangladesh, in Bangla and English. The goal is modern and minimal: calm, clear hierarchy, few things on screen, details one tap away.

## Before writing any UI
1. Read the tokens file (colors, type scale, spacing, radius). If it does not exist, create it first and use only its values. No one-off colors, sizes or shadows in components.
2. State the one question this screen answers and the one next action. If you cannot, ask before building.
3. Use realistic Bangladeshi data (names, ৳ amounts, branch names, invoice numbers). Never lorem ipsum or round fake numbers.

## Layout
- A dashboard fits its first screen (1440x900 desktop, 390x844 mobile). Summary on top, details behind a tap or drill-down. Never stack many full tables on one page.
- Strong hierarchy: one hero number, a few supporting cards, one action list. Everything else is secondary.
- Generous whitespace. Fewer elements, not smaller ones.

## Visual style
- Light, calm, mostly neutral. One accent color. Red and amber only for real problems; green only for good results.
- Soft cards with 8-12px radius, hairline borders, almost no shadow. No gradients, glow, glassmorphism, emoji icons or decorative illustrations.
- Large, clear numerals (hero about 28-32px, card values about 20-24px) with small grey labels (12-13px). Minimum text size 12px. Labels must meet WCAG AA contrast.
- One icon set, one stroke weight, used sparingly next to text.
- Small trend lines and bars are welcome when they answer a decision (cash trend, dues aging). No decorative charts.
- Type: one Latin family and one matched Bangla family (for example Noto Sans Bengali). Maximum 4 sizes. Always test with real Bangla text, which is taller and wider.

## Business rules
- Numbers: right-aligned in tables, tabular figures, ৳ with lakh/crore grouping (12,34,567; Bangla digits as a setting). Overdue and negative amounts are marked by text or sign, not only color.
- Detail pages use clean tables: sticky header, filters, totals row, no heavy borders. Tables belong on detail pages, not the home screen.
- The home screen is exception-first: what needs action, who owns it, how old it is, a button to act, a link to the source document.
- Every list has designed empty, loading, error and no-permission states. Financial or destructive actions need a confirm step that names what will change.
- Branch and business context is always visible in the header.
- Mobile is a real layout: one column, summary first, action list next, cards that open details. Never shrink the desktop page.

## Review before saying done
- Render and look at the result in English and Bangla, desktop and mobile.
- Check with 0 rows, 200 rows, a very long name and a 9-digit amount.
- Remove anything that carries no information.
- Confirm only token values are used.

## Signs it looks AI-generated or old (fix these)
Purple-blue gradients, uniform grids of identical cards, emoji bullets, stock illustrations, long pages of stacked tables, tiny grey text, fake round metrics like "+12.5%", vague copy, shadows on everything.
