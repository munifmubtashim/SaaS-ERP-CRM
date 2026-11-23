-- idempotency_key: the parts Prisma can't express (ADR 0011 section 2, ADR 0014 part 1). Shipped in migration
-- idempotency_key, after Prisma's CREATE TABLE, index and foreign key statements.
-- Readable source: IdempotencyKey.int.test.ts fails when this file and the migration differ.
-- Changing this file: a new migration and the same edit here.

ALTER TABLE idempotency_key ADD CONSTRAINT idempotency_key_format CHECK (key ~ '^[\x21-\x7e]{1,255}$');
ALTER TABLE idempotency_key ADD CONSTRAINT idempotency_key_hash_length CHECK (octet_length(request_hash) = 32);
ALTER TABLE idempotency_key ADD CONSTRAINT idempotency_key_completed_together
  CHECK ((status_code IS NULL) = (response_body IS NULL) AND (status_code IS NULL) = (response_headers IS NULL));
-- The first answer's headers (a 201's Location, for example), replayed with the body (Farhan, #96): a JSON object
-- of header name to string value, '{}' when the answer sent none.
ALTER TABLE idempotency_key ADD CONSTRAINT idempotency_key_headers_object
  CHECK (response_headers IS NULL OR jsonb_typeof(response_headers) = 'object');

-- A stored answer never changes (ADR 0011 section 5), for every role.
CREATE FUNCTION public.idempotency_key_stored_once() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD.status_code IS NOT NULL THEN
    RAISE EXCEPTION 'idempotency_key: a stored response never changes' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.business_id IS DISTINCT FROM OLD.business_id OR NEW.key IS DISTINCT FROM OLD.key
     OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.route IS DISTINCT FROM OLD.route
     OR NEW.request_hash IS DISTINCT FROM OLD.request_hash THEN
    RAISE EXCEPTION 'idempotency_key: only the response is stored after the claim' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER idempotency_key_stored_once BEFORE UPDATE ON idempotency_key
  FOR EACH ROW EXECUTE FUNCTION public.idempotency_key_stored_once();
CREATE TRIGGER idempotency_key_no_truncate BEFORE TRUNCATE ON idempotency_key
  FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();

-- Everything erp_app has, stated here. No DELETE: old keys are never deleted by the app (a retention job, run
-- outside requests, is a later decision).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON idempotency_key FROM erp_app;
GRANT SELECT ON idempotency_key TO erp_app;
GRANT INSERT ON idempotency_key TO erp_app;
GRANT UPDATE (status_code, response_body, response_headers) ON idempotency_key TO erp_app;

ALTER TABLE idempotency_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_key FORCE ROW LEVEL SECURITY;
CREATE POLICY idempotency_key_app_select ON idempotency_key FOR SELECT TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY idempotency_key_app_insert ON idempotency_key FOR INSERT TO erp_app
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY idempotency_key_app_update ON idempotency_key FOR UPDATE TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]))
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY idempotency_key_owner_select ON idempotency_key FOR SELECT TO CURRENT_USER
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY idempotency_key_owner_insert ON idempotency_key FOR INSERT TO CURRENT_USER
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY idempotency_key_owner_update ON idempotency_key FOR UPDATE TO CURRENT_USER
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]))
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
