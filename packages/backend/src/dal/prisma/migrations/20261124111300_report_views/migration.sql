-- report_owner_dashboard (ADR 0023 section 2, amended by Munif on 24 Nov: revenue month to date and stock value).
-- Shipped in migration report_views. Readable source: ReportViews.int.test.ts fails when this file and the migration
-- differ. Changing this file: a new migration and the same edit here.
--
-- One row per business the caller may see, with four figures from the ledger only (invariant 1, spec C-05):
--   dues               the receivable balance (debits - credits);
--   collections_today  debits - credits on cash, bank, mobile_money and card_clearing in sales_payment journals and
--                      their reversals, dated today in Dhaka, so a payment voided the same day nets to zero;
--   revenue_month      credits - debits on sales_revenue and service_revenue from the 1st of this Dhaka month to
--                      today; pass-through fees and VAT are never revenue;
--   stock_value        the inventory balance (debits - credits). A cost figure: ReportManager hides it from callers
--                      without product.cost.view.
-- security_invoker: it reads with the caller's RLS, never the owner's; it also filters on the organization and the
-- allowed businesses itself, as CLAUDE.md requires of group views. Read outside a scope, the RLS functions raise.
CREATE VIEW report_owner_dashboard WITH (security_invoker = true) AS
WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Dhaka')::date AS day)
SELECT
  b.organization_id,
  b.id AS business_id,
  b.name,
  coalesce((SELECT sum(l.debit - l.credit)
              FROM journal_line l
              JOIN account_role r ON r.business_id = l.business_id AND r.account_id = l.account_id
             WHERE l.business_id = b.id AND r.role = 'receivable'), 0)::numeric(18,2) AS dues,
  coalesce((SELECT sum(l.debit - l.credit)
              FROM journal_line l
              JOIN journal j ON j.id = l.journal_id
              JOIN account_role r ON r.business_id = l.business_id AND r.account_id = l.account_id
              LEFT JOIN journal o ON o.id = j.reversal_of
             WHERE l.business_id = b.id
               AND r.role IN ('cash', 'bank', 'mobile_money', 'card_clearing')
               AND j.journal_date = (SELECT day FROM today)
               AND (j.source_type = 'sales_payment' OR (j.source_type = 'reversal' AND o.source_type = 'sales_payment'))),
           0)::numeric(18,2) AS collections_today,
  coalesce((SELECT sum(l.credit - l.debit)
              FROM journal_line l
              JOIN journal j ON j.id = l.journal_id
              JOIN account_role r ON r.business_id = l.business_id AND r.account_id = l.account_id
             WHERE l.business_id = b.id
               AND r.role IN ('sales_revenue', 'service_revenue')
               AND j.journal_date BETWEEN date_trunc('month', (SELECT day FROM today))::date AND (SELECT day FROM today)),
           0)::numeric(18,2) AS revenue_month,
  coalesce((SELECT sum(l.debit - l.credit)
              FROM journal_line l
              JOIN account_role r ON r.business_id = l.business_id AND r.account_id = l.account_id
             WHERE l.business_id = b.id AND r.role = 'inventory'), 0)::numeric(18,2) AS stock_value
FROM business b
WHERE b.organization_id = (SELECT app_organization_id())
  AND b.id = ANY ((SELECT app_business_ids())::uuid[]);

REVOKE ALL ON report_owner_dashboard FROM erp_app;
GRANT SELECT ON report_owner_dashboard TO erp_app;
