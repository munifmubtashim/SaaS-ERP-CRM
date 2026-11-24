-- The accounting core's rights and RLS (ADR 0013 part 1; the proposed SQL as reviewed). Shipped in migration
-- accounting_core, after sql/triggers/journal.sql. Readable source: AccountingCore.int.test.ts fails when this file
-- and the migration differ. Changing this file: a new migration and the same edit here.

-- Least privilege for erp_app: journals and lines are insert-only; accounts and roles change only in named columns.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON account, account_role, journal, journal_line FROM erp_app;
GRANT INSERT ON account, account_role, journal, journal_line TO erp_app;
GRANT UPDATE (name, name_bn, status, version, updated_at) ON account TO erp_app;
GRANT UPDATE (account_id, updated_at) ON account_role TO erp_app;

ALTER TABLE account ENABLE ROW LEVEL SECURITY;      ALTER TABLE account FORCE ROW LEVEL SECURITY;
ALTER TABLE account_role ENABLE ROW LEVEL SECURITY; ALTER TABLE account_role FORCE ROW LEVEL SECURITY;
ALTER TABLE journal ENABLE ROW LEVEL SECURITY;      ALTER TABLE journal FORCE ROW LEVEL SECURITY;
ALTER TABLE journal_line ENABLE ROW LEVEL SECURITY; ALTER TABLE journal_line FORCE ROW LEVEL SECURITY;

-- erp_app. Accounts and roles are per business; journals per branch; lines follow their journal (REVIEW 1).
CREATE POLICY account_app_select ON account FOR SELECT TO erp_app USING (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY account_app_insert ON account FOR INSERT TO erp_app WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY account_app_update ON account FOR UPDATE TO erp_app USING (business_id = ANY ((SELECT app_business_ids())::uuid[])) WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY account_role_app_select ON account_role FOR SELECT TO erp_app USING (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY account_role_app_insert ON account_role FOR INSERT TO erp_app WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY account_role_app_update ON account_role FOR UPDATE TO erp_app USING (business_id = ANY ((SELECT app_business_ids())::uuid[])) WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY journal_app_select ON journal FOR SELECT TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));
CREATE POLICY journal_app_insert ON journal FOR INSERT TO erp_app
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[])
              AND branch_is_active(branch_id));
CREATE POLICY journal_line_app_select ON journal_line FOR SELECT TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND EXISTS (SELECT 1 FROM journal j WHERE j.id = journal_id));
CREATE POLICY journal_line_app_insert ON journal_line FOR INSERT TO erp_app
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND EXISTS (SELECT 1 FROM journal j WHERE j.id = journal_id));

-- Migration owner (TO CURRENT_USER): SELECT and INSERT everywhere; UPDATE only on account and account_role.
-- journal and journal_line are append-only: no owner UPDATE policy (ADR 0008 section 4). No DELETE policy anywhere.
CREATE POLICY account_owner_select ON account FOR SELECT TO CURRENT_USER USING (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY account_owner_insert ON account FOR INSERT TO CURRENT_USER WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY account_owner_update ON account FOR UPDATE TO CURRENT_USER USING (business_id = ANY ((SELECT app_business_ids())::uuid[])) WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY account_role_owner_select ON account_role FOR SELECT TO CURRENT_USER USING (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY account_role_owner_insert ON account_role FOR INSERT TO CURRENT_USER WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY account_role_owner_update ON account_role FOR UPDATE TO CURRENT_USER USING (business_id = ANY ((SELECT app_business_ids())::uuid[])) WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY journal_owner_select ON journal FOR SELECT TO CURRENT_USER USING (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY journal_owner_insert ON journal FOR INSERT TO CURRENT_USER WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY journal_line_owner_select ON journal_line FOR SELECT TO CURRENT_USER USING (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY journal_line_owner_insert ON journal_line FOR INSERT TO CURRENT_USER WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
