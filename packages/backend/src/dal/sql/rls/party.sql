-- party: the parts Prisma can't express (ADR 0019 sections 2 and 3). Shipped in migration party, after Prisma's
-- CREATE TABLE, index and foreign key statements.
-- Readable source: Party.int.test.ts fails when this file and the migration differ.
-- Changing this file: a new migration and the same edit here.

ALTER TABLE party ADD CONSTRAINT party_code_length CHECK (char_length(code) BETWEEN 1 AND 32);
ALTER TABLE party ADD CONSTRAINT party_name_length CHECK (char_length(name) BETWEEN 1 AND 200);
ALTER TABLE party ADD CONSTRAINT party_kind_known CHECK (kind IN ('person', 'company'));
ALTER TABLE party ADD CONSTRAINT party_customer_or_supplier CHECK (is_customer OR is_supplier);
ALTER TABLE party ADD CONSTRAINT party_address_length CHECK (char_length(address) <= 500);
ALTER TABLE party ADD CONSTRAINT party_area_length CHECK (char_length(area) <= 100);
ALTER TABLE party ADD CONSTRAINT party_credit_limit_nonnegative CHECK (credit_limit >= 0);
ALTER TABLE party ADD CONSTRAINT party_pay_term_days_range CHECK (pay_term_days BETWEEN 0 AND 365);
ALTER TABLE party ADD CONSTRAINT party_status_known CHECK (status IN ('active', 'inactive'));
-- created_by is NULL only for a seeded walk-in party (ADR 0019 question 2).
ALTER TABLE party ADD CONSTRAINT party_created_by_required CHECK (created_by IS NOT NULL OR is_walk_in);
-- One walk-in party per business; ensureWalkIn() inserts with ON CONFLICT on this index.
CREATE UNIQUE INDEX party_one_walk_in_per_business ON party (business_id) WHERE is_walk_in;
CREATE TRIGGER party_no_truncate BEFORE TRUNCATE ON party FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();

-- No DELETE: a party is deactivated. code, is_walk_in and the audit columns never change.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON party FROM erp_app;
GRANT INSERT ON party TO erp_app;
GRANT UPDATE (name, name_bn, kind, is_customer, is_supplier, phone_e164, alt_phone_e164, email, address, area,
  credit_limit, pay_term_days, status, assigned_to, version, updated_at) ON party TO erp_app;

-- Business-wide: no branch condition (ADR 0006 section 1).
ALTER TABLE party ENABLE ROW LEVEL SECURITY;
ALTER TABLE party FORCE ROW LEVEL SECURITY;
CREATE POLICY party_app_select ON party FOR SELECT TO erp_app USING (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY party_app_insert ON party FOR INSERT TO erp_app WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY party_app_update ON party FOR UPDATE TO erp_app USING (business_id = ANY ((SELECT app_business_ids())::uuid[])) WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY party_owner_select ON party FOR SELECT TO CURRENT_USER USING (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY party_owner_insert ON party FOR INSERT TO CURRENT_USER WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY party_owner_update ON party FOR UPDATE TO CURRENT_USER USING (business_id = ANY ((SELECT app_business_ids())::uuid[])) WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
