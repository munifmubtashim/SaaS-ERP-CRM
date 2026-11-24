-- Sales payments (ADR 0026 section 1; ADR 0016 section 4). The parts Prisma can't express. Shipped in migration
-- sales_payment, after Prisma's table. Readable source: SalesTables.int.test.ts fails when this file and the migration
-- differ. Changing this file: a new migration and the same edit here.
--
-- Kept true: no payment without its journal (invariant 4); amount above zero, numeric(18,2); a transaction id is
-- required for every method but cash and is taken once per method while posted; posted is permanent apart from
-- posted → voided with the void columns; branch-scoped, RLS forced. Known gap: party_id has no foreign key until
-- A11 (gap 2).

-- 1. What every row must be ----------------------------------------------------------------------------------
ALTER TABLE sales_payment ADD CONSTRAINT sales_payment_method_known CHECK (method IN ('cash', 'bank', 'bkash', 'card'));
ALTER TABLE sales_payment ADD CONSTRAINT sales_payment_external_ref_needed CHECK (method = 'cash' OR external_ref IS NOT NULL);
ALTER TABLE sales_payment ADD CONSTRAINT sales_payment_external_ref_length CHECK (char_length(external_ref) BETWEEN 1 AND 64);
ALTER TABLE sales_payment ADD CONSTRAINT sales_payment_amount_positive CHECK (amount > 0);
ALTER TABLE sales_payment ADD CONSTRAINT sales_payment_note_length CHECK (char_length(note) <= 500);
ALTER TABLE sales_payment ADD CONSTRAINT sales_payment_status_known CHECK (status IN ('posted', 'voided'));
ALTER TABLE sales_payment ADD CONSTRAINT sales_payment_void_complete CHECK (
  (status = 'posted' AND voided_journal_id IS NULL AND void_reason IS NULL AND voided_by IS NULL AND voided_at IS NULL)
  OR (status = 'voided' AND voided_journal_id IS NOT NULL AND void_reason IS NOT NULL AND voided_at IS NOT NULL));
-- One transaction id once per method while posted (ADR 0026 section 1): a voided payment leaves the index.
CREATE UNIQUE INDEX sales_payment_one_external_ref ON sales_payment (business_id, method, external_ref)
  WHERE external_ref IS NOT NULL AND status = 'posted';

-- 2. Posted is permanent: only posted → voided with the void columns, for every role ---------------------------
CREATE FUNCTION public.sales_payment_posted_is_permanent() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'sales_payment %: a payment is never deleted; void it', OLD.id USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (OLD.status = 'posted' AND NEW.status = 'voided')
     OR (to_jsonb(NEW) - 'status' - 'version' - 'updated_at' - 'voided_journal_id' - 'void_reason' - 'voided_by' - 'voided_at')
        <> (to_jsonb(OLD) - 'status' - 'version' - 'updated_at' - 'voided_journal_id' - 'void_reason' - 'voided_by' - 'voided_at') THEN
    RAISE EXCEPTION 'sales_payment %: a posted payment can only change posted → voided', OLD.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_payment_posted_is_permanent BEFORE UPDATE OR DELETE ON sales_payment
  FOR EACH ROW EXECUTE FUNCTION public.sales_payment_posted_is_permanent();
CREATE TRIGGER sales_payment_no_truncate BEFORE TRUNCATE ON sales_payment FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();

-- 3. Rights and RLS ------------------------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON sales_payment FROM erp_app;
GRANT INSERT ON sales_payment TO erp_app;
GRANT UPDATE (status, voided_journal_id, void_reason, voided_by, voided_at, version, updated_at) ON sales_payment TO erp_app;

ALTER TABLE sales_payment ENABLE ROW LEVEL SECURITY; ALTER TABLE sales_payment FORCE ROW LEVEL SECURITY;

CREATE POLICY sales_payment_app_select ON sales_payment FOR SELECT TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));
CREATE POLICY sales_payment_app_insert ON sales_payment FOR INSERT TO erp_app
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[])
              AND branch_is_active(branch_id));
CREATE POLICY sales_payment_app_update ON sales_payment FOR UPDATE TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]))
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));

CREATE POLICY sales_payment_owner_select ON sales_payment FOR SELECT TO CURRENT_USER USING (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY sales_payment_owner_insert ON sales_payment FOR INSERT TO CURRENT_USER WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY sales_payment_owner_update ON sales_payment FOR UPDATE TO CURRENT_USER USING (business_id = ANY ((SELECT app_business_ids())::uuid[])) WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
