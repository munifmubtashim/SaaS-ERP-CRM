-- staff: the parts Prisma can't express (ADR 0008 section 4, ADR 0009 part 4). Shipped in migration staff, after
-- Prisma's CREATE TABLE, index and foreign key statements.
-- Readable source: Staff.int.test.ts fails when this file and the migration differ.
-- Changing this file: a new migration and the same edit here.

-- TRUNCATE is refused for every role (ADR 0008, #27).
CREATE TRIGGER staff_no_truncate BEFORE TRUNCATE ON staff FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();

-- Everything erp_app has, stated here. No DELETE: staff are deactivated (is_active). business_id, branch_id and
-- user_id are not granted for UPDATE: moving staff between branches and linking a login are later, planned changes.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON staff FROM erp_app;
GRANT SELECT, INSERT ON staff TO erp_app;
GRANT UPDATE (name, phone, designation, is_active, version, updated_at) ON staff TO erp_app;

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff FORCE ROW LEVEL SECURITY;

-- The business check, and the branch when set (ADR 0008 section 4): business-level staff (branch_id null) stay
-- visible to every scope of the business. Nothing is written to a deactivated branch (branch_is_active).
CREATE POLICY staff_app_select ON staff FOR SELECT TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[])
         AND (branch_id IS NULL OR branch_id = ANY ((SELECT app_branch_ids())::uuid[])));
CREATE POLICY staff_app_insert ON staff FOR INSERT TO erp_app
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[])
              AND (branch_id IS NULL OR (branch_id = ANY ((SELECT app_branch_ids())::uuid[]) AND branch_is_active(branch_id))));
CREATE POLICY staff_app_update ON staff FOR UPDATE TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[])
         AND (branch_id IS NULL OR branch_id = ANY ((SELECT app_branch_ids())::uuid[])))
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[])
              AND (branch_id IS NULL OR (branch_id = ANY ((SELECT app_branch_ids())::uuid[]) AND branch_is_active(branch_id))));

-- The migration owner: TO CURRENT_USER, the same scope, no DELETE policy (ADR 0008 section 4).
CREATE POLICY staff_owner_select ON staff FOR SELECT TO CURRENT_USER
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[])
         AND (branch_id IS NULL OR branch_id = ANY ((SELECT app_branch_ids())::uuid[])));
CREATE POLICY staff_owner_insert ON staff FOR INSERT TO CURRENT_USER
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[])
              AND (branch_id IS NULL OR branch_id = ANY ((SELECT app_branch_ids())::uuid[])));
CREATE POLICY staff_owner_update ON staff FOR UPDATE TO CURRENT_USER
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[])
         AND (branch_id IS NULL OR branch_id = ANY ((SELECT app_branch_ids())::uuid[])))
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[])
              AND (branch_id IS NULL OR branch_id = ANY ((SELECT app_branch_ids())::uuid[])));
