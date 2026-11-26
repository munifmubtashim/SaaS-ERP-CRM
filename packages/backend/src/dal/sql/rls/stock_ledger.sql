-- The stock ledger: location, stock_movement, stock_balance and stock_cost (ADR 0021 part 1 as amended by ADR 0054).
-- The parts Prisma can't express. Shipped in migration stock_ledger, after Prisma's CREATE TABLE, index and foreign
-- key statements. Readable source: StockLedger.int.test.ts fails when this file and the migration differ.
-- Changing this file: a new migration and the same edit here.
--
-- Kept true (ADR 0054 section 5): on hand is the sum of the movements and the balance equals it (rebuildable);
-- movements are never updated or deleted, for any role; negative stock is refused by the database; decrements are
-- one atomic conditional UPDATE (StockQuery); both caches are branch-scoped with forced RLS. Nothing here blocks
-- transfers or more locations later (ADR 0054 section 6): those relax a CHECK and add rows, never rewrite one.

-- 1. The rules every row obeys ---------------------------------------------------------------------------------
ALTER TABLE location ADD CONSTRAINT location_kind_known CHECK (kind = 'sales_floor');
ALTER TABLE location ADD CONSTRAINT location_default_sale CHECK (is_default_sale);

ALTER TABLE stock_movement ADD CONSTRAINT stock_movement_kind_known
  CHECK (kind IN ('opening', 'receipt', 'sale', 'adjustment'));
ALTER TABLE stock_movement ADD CONSTRAINT stock_movement_qty_nonzero CHECK (qty_delta <> 0);
ALTER TABLE stock_movement ADD CONSTRAINT stock_movement_serial_one_unit
  CHECK (serial_unit_id IS NULL OR qty_delta IN (1, -1));
ALTER TABLE stock_movement ADD CONSTRAINT stock_movement_cost_nonnegative CHECK (unit_cost >= 0);
-- One movement per source line (ADR 0021 section 1): a document can't move the same product or unit twice.
CREATE UNIQUE INDEX stock_movement_one_per_source_line
  ON stock_movement (business_id, source_type, source_id, product_id, serial_unit_id) NULLS NOT DISTINCT;

ALTER TABLE stock_balance ADD CONSTRAINT stock_balance_on_hand_nonnegative CHECK (on_hand >= 0);
ALTER TABLE stock_cost ADD CONSTRAINT stock_cost_nonnegative CHECK (avg_cost >= 0);

-- 2. Posted is permanent (invariant 2): refused for every role, as journals are (ADR 0013) ----------------------
CREATE FUNCTION public.stock_movement_append_only() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'stock_movement is append-only: a correction is a new adjustment movement'
    USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER stock_movement_append_only BEFORE UPDATE OR DELETE ON stock_movement
  FOR EACH ROW EXECUTE FUNCTION public.stock_movement_append_only();

CREATE TRIGGER location_no_truncate BEFORE TRUNCATE ON location FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();
CREATE TRIGGER stock_movement_no_truncate BEFORE TRUNCATE ON stock_movement FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();
CREATE TRIGGER stock_balance_no_truncate BEFORE TRUNCATE ON stock_balance FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();
CREATE TRIGGER stock_cost_no_truncate BEFORE TRUNCATE ON stock_cost FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();

-- 3. Every branch has its one location, created in the same transaction as the branch (ADR 0054 section 1) -------
-- Branches are inserted by erp_provisioner (ProvisioningQuery), by the owner (seeds) and by test fixtures, so a
-- trigger covers every path (Munif, 24 Nov). It runs as the owner (SECURITY DEFINER, fixed search_path), so the
-- provisioner needs no right on location; the owner's insert policy admits it only inside a trigger.
CREATE FUNCTION public.branch_default_location() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  INSERT INTO public.location (business_id, branch_id, kind, is_default_sale)
  VALUES (NEW.business_id, NEW.id, 'sales_floor', true);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.branch_default_location() FROM PUBLIC;
CREATE TRIGGER branch_default_location AFTER INSERT ON branch
  FOR EACH ROW EXECUTE FUNCTION public.branch_default_location();

-- The backfill: a location for every branch that has none (the branches made before this migration). Owner only;
-- safe to run again. FORCE RLS is lifted on the two tables for the statement, so it also works when the owner
-- isn't a superuser, and put back before returning.
CREATE FUNCTION public.stock_location_backfill() RETURNS integer
  LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE added integer;
BEGIN
  ALTER TABLE public.branch NO FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.location NO FORCE ROW LEVEL SECURITY;
  INSERT INTO public.location (business_id, branch_id, kind, is_default_sale)
  SELECT b.business_id, b.id, 'sales_floor', true
    FROM public.branch b
   WHERE NOT EXISTS (SELECT 1 FROM public.location l WHERE l.branch_id = b.id);
  GET DIAGNOSTICS added = ROW_COUNT;
  ALTER TABLE public.location FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.branch FORCE ROW LEVEL SECURITY;
  RETURN added;
END;
$$;
REVOKE ALL ON FUNCTION public.stock_location_backfill() FROM PUBLIC;

-- 4. The balance is a cache (ADR 0021 section 3): rebuilt from the movements. Owner only, never from a request ---
CREATE FUNCTION public.rebuild_stock_balance() RETURNS integer
  LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE changed integer;
BEGIN
  ALTER TABLE public.stock_movement NO FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.stock_balance NO FORCE ROW LEVEL SECURITY;
  INSERT INTO public.stock_balance (business_id, branch_id, location_id, product_id, on_hand)
  SELECT m.business_id, m.branch_id, m.location_id, m.product_id, sum(m.qty_delta)
    FROM public.stock_movement m
   GROUP BY m.business_id, m.branch_id, m.location_id, m.product_id
  ON CONFLICT (business_id, branch_id, product_id, location_id) DO UPDATE
     SET on_hand = EXCLUDED.on_hand, version = public.stock_balance.version + 1, updated_at = now()
   WHERE public.stock_balance.on_hand IS DISTINCT FROM EXCLUDED.on_hand;
  GET DIAGNOSTICS changed = ROW_COUNT;
  UPDATE public.stock_balance b SET on_hand = 0, version = b.version + 1, updated_at = now()
   WHERE b.on_hand <> 0
     AND NOT EXISTS (SELECT 1 FROM public.stock_movement m
                      WHERE m.business_id = b.business_id AND m.branch_id = b.branch_id
                        AND m.location_id = b.location_id AND m.product_id = b.product_id);
  ALTER TABLE public.stock_balance FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.stock_movement FORCE ROW LEVEL SECURITY;
  RETURN changed;
END;
$$;
REVOKE ALL ON FUNCTION public.rebuild_stock_balance() FROM PUBLIC;

-- 5. Least privilege for erp_app -------------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON location, stock_movement, stock_balance, stock_cost FROM erp_app;
GRANT INSERT ON stock_movement TO erp_app;
GRANT INSERT ON stock_balance, stock_cost TO erp_app;
GRANT UPDATE (on_hand, version, updated_at) ON stock_balance TO erp_app;
GRANT UPDATE (avg_cost, version, updated_at) ON stock_cost TO erp_app;

-- 6. Branch-scoped RLS, forced, on all four tables (ADR 0021 section 1, #27, #31) ---------------------------------
ALTER TABLE location ENABLE ROW LEVEL SECURITY;
ALTER TABLE location FORCE ROW LEVEL SECURITY;
CREATE POLICY location_app_select ON location FOR SELECT TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));
CREATE POLICY location_owner_select ON location FOR SELECT TO CURRENT_USER
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));
-- Inside a trigger (the branch's own insert) the row comes from a branch RLS already admitted, and the scope may be
-- the provisioner's (organization only), so the tenant check is skipped there and only there.
CREATE POLICY location_owner_insert ON location FOR INSERT TO CURRENT_USER
  WITH CHECK (CASE WHEN pg_trigger_depth() > 0 THEN true
                   ELSE business_id = ANY ((SELECT app_business_ids())::uuid[])
                        AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]) END);

ALTER TABLE stock_movement ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movement FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_movement_app_select ON stock_movement FOR SELECT TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));
CREATE POLICY stock_movement_app_insert ON stock_movement FOR INSERT TO erp_app
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]) AND branch_is_active(branch_id));
CREATE POLICY stock_movement_owner_select ON stock_movement FOR SELECT TO CURRENT_USER
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));
CREATE POLICY stock_movement_owner_insert ON stock_movement FOR INSERT TO CURRENT_USER
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));

ALTER TABLE stock_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_balance FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_balance_app_select ON stock_balance FOR SELECT TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));
CREATE POLICY stock_balance_app_insert ON stock_balance FOR INSERT TO erp_app
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]) AND branch_is_active(branch_id));
CREATE POLICY stock_balance_app_update ON stock_balance FOR UPDATE TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]))
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]) AND branch_is_active(branch_id));
CREATE POLICY stock_balance_owner_select ON stock_balance FOR SELECT TO CURRENT_USER
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));
CREATE POLICY stock_balance_owner_insert ON stock_balance FOR INSERT TO CURRENT_USER
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));
CREATE POLICY stock_balance_owner_update ON stock_balance FOR UPDATE TO CURRENT_USER
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]))
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));

ALTER TABLE stock_cost ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_cost FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_cost_app_select ON stock_cost FOR SELECT TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));
CREATE POLICY stock_cost_app_insert ON stock_cost FOR INSERT TO erp_app
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]) AND branch_is_active(branch_id));
CREATE POLICY stock_cost_app_update ON stock_cost FOR UPDATE TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]))
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]) AND branch_is_active(branch_id));
CREATE POLICY stock_cost_owner_select ON stock_cost FOR SELECT TO CURRENT_USER
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));
CREATE POLICY stock_cost_owner_insert ON stock_cost FOR INSERT TO CURRENT_USER
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));
CREATE POLICY stock_cost_owner_update ON stock_cost FOR UPDATE TO CURRENT_USER
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]))
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));

-- 7. The branches that existed before this migration get their location -----------------------------------------
SELECT public.stock_location_backfill();
