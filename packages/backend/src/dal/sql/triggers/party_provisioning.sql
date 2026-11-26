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
