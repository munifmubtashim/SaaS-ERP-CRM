-- ADR 0055: the walk-in party and the business-wide party_code series, created with every business.
-- Source: dal/sql/triggers/party_provisioning.sql (PartyProvisioning.int.test.ts checks it appears unchanged).

-- ADR 0055: every business gets its walk-in party and its business-wide party_code series in the same transaction
-- that creates it. Shipped in migration party_provisioning. Readable source: PartyProvisioning.int.test.ts fails
-- when this file and the migration differ.
--
-- SECURITY DEFINER, owned by the migration owner (not superuser, not BYPASSRLS in production): erp_provisioner
-- inserts the business and has no grant on party or number_series (ADR 0008 test 17). RLS stays forced: the
-- owner's policies check app_business_ids(), so the function scopes its two inserts to the new business and then
-- puts the caller's app.business_ids back exactly as it was, set or unset.
CREATE FUNCTION public.party_provision_business() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
DECLARE
  caller_business_ids text := current_setting('app.business_ids', true);
BEGIN
  PERFORM set_config('app.business_ids', NEW.id::text, true);

  INSERT INTO public.party (business_id, code, name, kind, is_customer, is_supplier, phone_e164, is_walk_in)
  VALUES (NEW.id, 'WALK-IN', 'Walk-in customer', 'person', true, false, '+8801000000000', true)
  ON CONFLICT (business_id) WHERE is_walk_in DO NOTHING;

  INSERT INTO public.number_series (business_id, branch_id, kind, prefix, width, next_value)
  VALUES (NEW.id, NULL, 'party_code', 'C-', 6, 1)
  ON CONFLICT (business_id, branch_id, kind) DO NOTHING;

  PERFORM set_config('app.business_ids', coalesce(caller_business_ids, ''), true);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.party_provision_business() FROM PUBLIC, erp_app, erp_provisioner;

CREATE TRIGGER business_provision_party AFTER INSERT ON public.business
  FOR EACH ROW EXECUTE FUNCTION public.party_provision_business();

-- Backfill: every business that exists before this migration gets the same two rows (ADR 0055 section 1).
-- Owner only; safe to run again (ON CONFLICT). As in stock_ledger's backfill, FORCE RLS is lifted on business
-- alone, to read its ids when the owner isn't a superuser, and put back at once. The party and number_series
-- inserts keep forced RLS and run in each business's own scope.
DO $$
DECLARE
  ids uuid[];
  one_business uuid;
BEGIN
  ALTER TABLE public.business NO FORCE ROW LEVEL SECURITY;
  SELECT coalesce(array_agg(id), '{}') INTO ids FROM public.business;
  ALTER TABLE public.business FORCE ROW LEVEL SECURITY;
  FOREACH one_business IN ARRAY ids LOOP
    PERFORM set_config('app.business_ids', one_business::text, true);
    INSERT INTO public.party (business_id, code, name, kind, is_customer, is_supplier, phone_e164, is_walk_in)
    VALUES (one_business, 'WALK-IN', 'Walk-in customer', 'person', true, false, '+8801000000000', true)
    ON CONFLICT (business_id) WHERE is_walk_in DO NOTHING;
    INSERT INTO public.number_series (business_id, branch_id, kind, prefix, width, next_value)
    VALUES (one_business, NULL, 'party_code', 'C-', 6, 1)
    ON CONFLICT (business_id, branch_id, kind) DO NOTHING;
  END LOOP;
  PERFORM set_config('app.business_ids', '', true);
END
$$;
