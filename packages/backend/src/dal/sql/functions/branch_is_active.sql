-- branch_is_active(branch_id) (ADR 0009 part 2): whether a branch is active, read under the caller's RLS.
-- A branch outside the caller's scope reads as NULL, which a WITH CHECK treats as refused. Each later
-- branch-scoped table adds `branch_is_active(branch_id)` to its WITH CHECK, so nothing is written to a closed
-- branch. Not SECURITY DEFINER: it must see only what the caller may see. Shipped in the
-- organization_provisioning migration; OrganizationProvisioning.int.test.ts checks the two match.
CREATE FUNCTION public.branch_is_active(branch_id uuid) RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path = pg_catalog, public
AS $$
  SELECT b.is_active FROM public.branch b WHERE b.id = branch_is_active.branch_id
$$;
