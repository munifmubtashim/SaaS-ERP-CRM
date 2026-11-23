-- product: the parts Prisma can't express (ADR 0020 section 1). Shipped in migration product_catalogue, after
-- Prisma's CREATE TABLE, index and foreign key statements.
-- Readable source: ProductCatalogue.int.test.ts fails when this file and the migration differ.
-- Changing this file: a new migration and the same edit here.

ALTER TABLE product ADD CONSTRAINT product_tracking_known CHECK (tracking IN ('serial', 'quantity'));
ALTER TABLE product ADD CONSTRAINT product_status_known CHECK (status IN ('active', 'archived'));
ALTER TABLE product ADD CONSTRAINT product_sell_price_nonnegative CHECK (sell_price >= 0);
CREATE TRIGGER product_no_truncate BEFORE TRUNCATE ON product FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON product FROM erp_app;
GRANT INSERT ON product TO erp_app;
GRANT UPDATE (name, name_bn, brand, category, unit, sell_price, status, version, updated_at) ON product TO erp_app;

ALTER TABLE product ENABLE ROW LEVEL SECURITY;
ALTER TABLE product FORCE ROW LEVEL SECURITY;
CREATE POLICY product_app_select ON product FOR SELECT TO erp_app USING (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY product_app_insert ON product FOR INSERT TO erp_app WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY product_app_update ON product FOR UPDATE TO erp_app USING (business_id = ANY ((SELECT app_business_ids())::uuid[])) WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY product_owner_select ON product FOR SELECT TO CURRENT_USER USING (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY product_owner_insert ON product FOR INSERT TO CURRENT_USER WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY product_owner_update ON product FOR UPDATE TO CURRENT_USER USING (business_id = ANY ((SELECT app_business_ids())::uuid[])) WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
