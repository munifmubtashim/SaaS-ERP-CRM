-- party_keys (decision 4, ledger packet section 3, option A; closes known gap 2 now that A11's party table exists):
-- journal_line, invoice and sales_payment name a party of their own business through a composite foreign key.
-- Each key is added NOT VALID (no table scan under lock), then validated: a row naming another business's party, or
-- an unknown id, makes VALIDATE fail, and the fix is a reversal and re-post, never an edit (invariant 2).

-- AddForeignKey
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_business_id_party_id_fkey" FOREIGN KEY ("business_id", "party_id") REFERENCES "party"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "journal_line" VALIDATE CONSTRAINT "journal_line_business_id_party_id_fkey";

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_business_id_party_id_fkey" FOREIGN KEY ("business_id", "party_id") REFERENCES "party"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "invoice" VALIDATE CONSTRAINT "invoice_business_id_party_id_fkey";

-- AddForeignKey
ALTER TABLE "sales_payment" ADD CONSTRAINT "sales_payment_business_id_party_id_fkey" FOREIGN KEY ("business_id", "party_id") REFERENCES "party"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "sales_payment" VALIDATE CONSTRAINT "sales_payment_business_id_party_id_fkey";
