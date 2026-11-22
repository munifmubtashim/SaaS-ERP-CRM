-- number_series: the parts Prisma can't express (ADR 0015 sections 1 to 3). Shipped in migration number_series,
-- after Prisma's CREATE TABLE, index and foreign key statements (the unique index is made NULLS NOT DISTINCT there).
-- Readable source: NumberSeries.int.test.ts fails when this file and the migration differ.
-- Changing this file: a new migration and the same edit here.

ALTER TABLE number_series ADD CONSTRAINT number_series_next_value_positive CHECK (next_value >= 1);
ALTER TABLE number_series ADD CONSTRAINT number_series_width_range CHECK (width BETWEEN 1 AND 18);

-- next_value moves only by exactly +1 per statement; nothing else changes after insert (ADR 0015 §3).
CREATE FUNCTION public.number_series_plus_one() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.next_value <> OLD.next_value + 1 THEN
    RAISE EXCEPTION 'number_series: next_value moves only by +1' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.business_id IS DISTINCT FROM OLD.business_id OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
     OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.prefix IS DISTINCT FROM OLD.prefix OR NEW.width IS DISTINCT FROM OLD.width THEN
    RAISE EXCEPTION 'number_series: only next_value changes after insert' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER number_series_plus_one BEFORE UPDATE ON number_series FOR EACH ROW EXECUTE FUNCTION public.number_series_plus_one();
CREATE TRIGGER number_series_no_truncate BEFORE TRUNCATE ON number_series FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON number_series FROM erp_app;
GRANT INSERT ON number_series TO erp_app;
GRANT UPDATE (next_value) ON number_series TO erp_app;

ALTER TABLE number_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE number_series FORCE ROW LEVEL SECURITY;
-- Branch series need the branch in scope; business-wide series (branch_id null) need only the business.
CREATE POLICY number_series_app_select ON number_series FOR SELECT TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[])
         AND (branch_id IS NULL OR branch_id = ANY ((SELECT app_branch_ids())::uuid[])));
CREATE POLICY number_series_app_insert ON number_series FOR INSERT TO erp_app
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[])
              AND (branch_id IS NULL OR branch_id = ANY ((SELECT app_branch_ids())::uuid[])));
CREATE POLICY number_series_app_update ON number_series FOR UPDATE TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[])
         AND (branch_id IS NULL OR branch_id = ANY ((SELECT app_branch_ids())::uuid[])))
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[])
              AND (branch_id IS NULL OR branch_id = ANY ((SELECT app_branch_ids())::uuid[])));
CREATE POLICY number_series_owner_select ON number_series FOR SELECT TO CURRENT_USER USING (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY number_series_owner_insert ON number_series FOR INSERT TO CURRENT_USER WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY number_series_owner_update ON number_series FOR UPDATE TO CURRENT_USER USING (business_id = ANY ((SELECT app_business_ids())::uuid[])) WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
