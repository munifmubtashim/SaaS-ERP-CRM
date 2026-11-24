-- CreateTable
CREATE TABLE "invoice" (
    "id" UUID NOT NULL DEFAULT uuid_v7(),
    "business_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "party_id" UUID NOT NULL,
    "customer_name" TEXT,
    "invoice_date" DATE NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "journal_id" UUID NOT NULL,
    "sold_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line" (
    "id" UUID NOT NULL DEFAULT uuid_v7(),
    "business_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "product_id" UUID NOT NULL,
    "serial_unit_id" UUID,
    "qty" DECIMAL(18,3) NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "line_total" DECIMAL(18,2) NOT NULL,
    "cost_amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "invoice_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_journal_id_key" ON "invoice"("journal_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_business_id_id_key" ON "invoice"("business_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_business_id_number_key" ON "invoice"("business_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_line_invoice_id_line_no_key" ON "invoice_line"("invoice_id", "line_no");

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_business_id_branch_id_fkey" FOREIGN KEY ("business_id", "branch_id") REFERENCES "branch"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_business_id_journal_id_fkey" FOREIGN KEY ("business_id", "journal_id") REFERENCES "journal"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_business_id_invoice_id_fkey" FOREIGN KEY ("business_id", "invoice_id") REFERENCES "invoice"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_business_id_product_id_fkey" FOREIGN KEY ("business_id", "product_id") REFERENCES "product"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_business_id_serial_unit_id_fkey" FOREIGN KEY ("business_id", "serial_unit_id") REFERENCES "serial_unit"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Sales invoices (ADR 0022 section 1; amended 24 Nov: customer_name snapshot). The parts Prisma can't express.
-- Shipped in migration sales_invoice, after Prisma's tables. Readable source: SalesTables.int.test.ts fails when this
-- file and the migration differ. Changing this file: a new migration and the same edit here.
--
-- Kept true: no invoice without its journal (invariant 4, NOT NULL composite key); money numeric(18,2), never
-- negative, total = subtotal - discount; a posted invoice refuses every edit from any login but posted → voided;
-- lines are append-only; branch-scoped, RLS forced. Known gaps: party_id has no foreign key until A11 (gap 2); the
-- void and reissue route is C14 (gap 3).

-- 1. What every row must be ----------------------------------------------------------------------------------
ALTER TABLE invoice ADD CONSTRAINT invoice_status_known CHECK (status IN ('posted', 'voided'));
ALTER TABLE invoice ADD CONSTRAINT invoice_amounts_nonnegative CHECK (subtotal >= 0 AND discount >= 0 AND total >= 0);
ALTER TABLE invoice ADD CONSTRAINT invoice_total_is_subtotal_less_discount CHECK (total = subtotal - discount);
ALTER TABLE invoice_line ADD CONSTRAINT invoice_line_qty_positive CHECK (qty > 0);
ALTER TABLE invoice_line ADD CONSTRAINT invoice_line_amounts_nonnegative
  CHECK (unit_price >= 0 AND line_total >= 0 AND cost_amount >= 0);
ALTER TABLE invoice_line ADD CONSTRAINT invoice_line_serial_one_at_a_time CHECK (serial_unit_id IS NULL OR qty = 1);

-- 2. Posted is permanent: only posted → voided, for every role, owners included ----------------------------------
CREATE FUNCTION public.invoice_posted_is_permanent() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'invoice %: an invoice is never deleted; void it', OLD.id USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (OLD.status = 'posted' AND NEW.status = 'voided')
     OR (to_jsonb(NEW) - 'status' - 'version' - 'updated_at') <> (to_jsonb(OLD) - 'status' - 'version' - 'updated_at') THEN
    RAISE EXCEPTION 'invoice %: a posted invoice can only change posted → voided', OLD.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invoice_posted_is_permanent BEFORE UPDATE OR DELETE ON invoice
  FOR EACH ROW EXECUTE FUNCTION public.invoice_posted_is_permanent();

CREATE FUNCTION public.invoice_line_is_immutable() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'invoice_line: invoice lines are never updated or deleted' USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER invoice_line_is_immutable BEFORE UPDATE OR DELETE ON invoice_line
  FOR EACH ROW EXECUTE FUNCTION public.invoice_line_is_immutable();

CREATE TRIGGER invoice_no_truncate BEFORE TRUNCATE ON invoice FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();
CREATE TRIGGER invoice_line_no_truncate BEFORE TRUNCATE ON invoice_line FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();

-- 3. Rights: erp_app inserts and reads; on invoice it may change only the status (posted → voided) -------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON invoice, invoice_line FROM erp_app;
GRANT INSERT ON invoice, invoice_line TO erp_app;
GRANT UPDATE (status, version, updated_at) ON invoice TO erp_app;

ALTER TABLE invoice ENABLE ROW LEVEL SECURITY;      ALTER TABLE invoice FORCE ROW LEVEL SECURITY;
ALTER TABLE invoice_line ENABLE ROW LEVEL SECURITY; ALTER TABLE invoice_line FORCE ROW LEVEL SECURITY;

-- erp_app: invoices per business and branch; lines follow their invoice.
CREATE POLICY invoice_app_select ON invoice FOR SELECT TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));
CREATE POLICY invoice_app_insert ON invoice FOR INSERT TO erp_app
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[])
              AND branch_is_active(branch_id));
CREATE POLICY invoice_app_update ON invoice FOR UPDATE TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]))
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND branch_id = ANY ((SELECT app_branch_ids())::uuid[]));
CREATE POLICY invoice_line_app_select ON invoice_line FOR SELECT TO erp_app
  USING (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND EXISTS (SELECT 1 FROM invoice i WHERE i.id = invoice_id));
CREATE POLICY invoice_line_app_insert ON invoice_line FOR INSERT TO erp_app
  WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]) AND EXISTS (SELECT 1 FROM invoice i WHERE i.id = invoice_id));

-- Migration owner (TO CURRENT_USER): SELECT and INSERT on both, UPDATE on invoice (held by the trigger). No DELETE.
CREATE POLICY invoice_owner_select ON invoice FOR SELECT TO CURRENT_USER USING (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY invoice_owner_insert ON invoice FOR INSERT TO CURRENT_USER WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY invoice_owner_update ON invoice FOR UPDATE TO CURRENT_USER USING (business_id = ANY ((SELECT app_business_ids())::uuid[])) WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY invoice_line_owner_select ON invoice_line FOR SELECT TO CURRENT_USER USING (business_id = ANY ((SELECT app_business_ids())::uuid[]));
CREATE POLICY invoice_line_owner_insert ON invoice_line FOR INSERT TO CURRENT_USER WITH CHECK (business_id = ANY ((SELECT app_business_ids())::uuid[]));
