-- CreateTable
CREATE TABLE "vehicle_unit" (
    "serial_unit_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "engine_no" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "vehicle_unit_pkey" PRIMARY KEY ("serial_unit_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_unit_business_id_engine_no_key" ON "vehicle_unit"("business_id", "engine_no");

-- AddForeignKey
ALTER TABLE "vehicle_unit" ADD CONSTRAINT "vehicle_unit_business_id_serial_unit_id_fkey" FOREIGN KEY ("business_id", "serial_unit_id") REFERENCES "serial_unit"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- vehicle_unit: the parts Prisma can't express (ADR 0020 section 1; Vehicle pack only, spec O-11). Shipped in
-- migration vehicle_units, after Prisma's CREATE TABLE, index and foreign key statements.
-- Readable source: VehicleUnits.int.test.ts fails when this file and the migration differ.
-- Changing this file: a new migration and the same edit here.

CREATE TRIGGER vehicle_unit_no_truncate BEFORE TRUNCATE ON vehicle_unit FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON vehicle_unit FROM erp_app;
GRANT INSERT ON vehicle_unit TO erp_app;
GRANT UPDATE (colour, updated_at) ON vehicle_unit TO erp_app;
ALTER TABLE vehicle_unit ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_unit FORCE ROW LEVEL SECURITY;
-- Same visibility as the unit: the business, and the unit's branch through serial_unit's own RLS.
CREATE POLICY vehicle_unit_app_select ON vehicle_unit FOR SELECT TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND EXISTS (SELECT 1 FROM serial_unit u WHERE u.id = serial_unit_id));
CREATE POLICY vehicle_unit_app_insert ON vehicle_unit FOR INSERT TO erp_app
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND EXISTS (SELECT 1 FROM serial_unit u WHERE u.id = serial_unit_id));
CREATE POLICY vehicle_unit_app_update ON vehicle_unit FOR UPDATE TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND EXISTS (SELECT 1 FROM serial_unit u WHERE u.id = serial_unit_id))
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY vehicle_unit_owner_select ON vehicle_unit FOR SELECT TO CURRENT_USER USING (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY vehicle_unit_owner_insert ON vehicle_unit FOR INSERT TO CURRENT_USER WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY vehicle_unit_owner_update ON vehicle_unit FOR UPDATE TO CURRENT_USER USING (business_id = ANY ((SELECT app_business_ids())::uuid[])) WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
