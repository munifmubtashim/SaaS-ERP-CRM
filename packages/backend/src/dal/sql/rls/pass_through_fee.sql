-- Pass-through fees (item 3d; ledger packet 4.4, decision 6; invariant 8). The parts Prisma can't express. Shipped in
-- migration pass_through_fee, after Prisma's ALTER TABLE statements. Readable source: PassThroughFee.int.test.ts
-- fails when this file and the migration differ. Changing this file: a new migration and the same edit here.
--
-- A pass-through fee is money the business holds for someone else (a registration fee for the authority): never
-- revenue, never stock. The core stays generic; the vehicle pack's seed creates its registration-fee product.

-- VAT on the fee only makes sense on a pass-through fee; both are off by default.
ALTER TABLE product ADD CONSTRAINT product_vat_on_fee_needs_pass_through CHECK (NOT vat_on_fee OR is_pass_through);
-- A fee is never a stocked unit.
ALTER TABLE product ADD CONSTRAINT product_pass_through_not_serial CHECK (NOT is_pass_through OR tracking = 'quantity');
-- The flag copied onto the line at posting: a pass-through line has no unit and no cost.
ALTER TABLE invoice_line ADD CONSTRAINT invoice_line_pass_through_no_stock
  CHECK (NOT is_pass_through OR (serial_unit_id IS NULL AND cost_amount = 0));
-- erp_app gets no UPDATE on either product setting: the existing column grant list (sql/rls/product.sql) leaves them
-- out, so they are set when the product is created (the owner or the seed), and history keeps the line's copy.
