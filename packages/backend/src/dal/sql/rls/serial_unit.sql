-- serial_unit: the parts Prisma can't express (ADR 0020 sections 1 and 2). Shipped in migration serial_units,
-- after Prisma's CREATE TABLE, index and foreign key statements. branch_id gets no UPDATE grant: it never changes
-- until transfers (C6) and ADR 0034 (#73, stock by location) are decided.
-- Readable source: SerialUnits.int.test.ts fails when this file and the migration differ.
-- Changing this file: a new migration and the same edit here.

ALTER TABLE serial_unit ADD CONSTRAINT serial_unit_status_known CHECK (status IN ('in_stock', 'reserved', 'sold', 'delivered'));
ALTER TABLE serial_unit ADD CONSTRAINT serial_unit_cost_nonnegative CHECK (unit_cost >= 0);

-- Only serial-tracked products have units.
CREATE FUNCTION public.serial_unit_product_is_serial() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE t text;
BEGIN
  SELECT p.tracking INTO t FROM public.product p WHERE p.id = NEW.product_id AND p.business_id = NEW.business_id;
  IF t IS DISTINCT FROM 'serial' THEN
    RAISE EXCEPTION 'serial_unit: product % is not serial-tracked', NEW.product_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER serial_unit_product_is_serial BEFORE INSERT ON serial_unit FOR EACH ROW EXECUTE FUNCTION public.serial_unit_product_is_serial();

-- Allowed status changes only (ADR 0020 §2); identity and cost never change, for every role.
CREATE FUNCTION public.serial_unit_status_change() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.serial_no IS DISTINCT FROM OLD.serial_no OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.unit_cost IS DISTINCT FROM OLD.unit_cost OR NEW.business_id IS DISTINCT FROM OLD.business_id THEN
    RAISE EXCEPTION 'serial_unit: serial_no, product_id, unit_cost and business_id never change' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'in_stock' AND NEW.status IN ('reserved', 'sold'))
    OR (OLD.status = 'reserved' AND NEW.status IN ('in_stock', 'sold'))
    OR (OLD.status = 'sold' AND NEW.status = 'delivered')) THEN
    RAISE EXCEPTION 'serial_unit: status % to % is not allowed', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER serial_unit_status_change BEFORE UPDATE ON serial_unit FOR EACH ROW EXECUTE FUNCTION public.serial_unit_status_change();
CREATE TRIGGER serial_unit_no_truncate BEFORE TRUNCATE ON serial_unit FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON serial_unit FROM erp_app;
GRANT INSERT ON serial_unit TO erp_app;
GRANT UPDATE (status, invoice_id, reserved_by_ref, version, updated_at) ON serial_unit TO erp_app;

ALTER TABLE serial_unit ENABLE ROW LEVEL SECURITY;
ALTER TABLE serial_unit FORCE ROW LEVEL SECURITY;
CREATE POLICY serial_unit_app_select ON serial_unit FOR SELECT TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));
CREATE POLICY serial_unit_app_insert ON serial_unit FOR INSERT TO erp_app
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]) AND branch_is_active(branch_id));
CREATE POLICY serial_unit_app_update ON serial_unit FOR UPDATE TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]))
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]) AND branch_is_active(branch_id));
CREATE POLICY serial_unit_owner_select ON serial_unit FOR SELECT TO CURRENT_USER
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));
CREATE POLICY serial_unit_owner_insert ON serial_unit FOR INSERT TO CURRENT_USER
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));
CREATE POLICY serial_unit_owner_update ON serial_unit FOR UPDATE TO CURRENT_USER
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]))
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));
