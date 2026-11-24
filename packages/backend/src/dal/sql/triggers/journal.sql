-- The accounting core's rules (ADR 0013 part 1; .adlc/proposed-sql/accounting_core_proposed.sql with Munif's 23 and
-- 24 Nov decisions). Shipped in migration accounting_core, after Prisma's tables and before sql/rls/accounting.sql.
-- Readable source: AccountingCore.int.test.ts fails when this file and the migration differ.
-- Changing this file: a new migration and the same edit here.
--
-- Known gaps, recorded as tests so they show in every run: 1. invariant 9 (period lock) waits for day close (A17);
-- 2. journal_line.party_id has no foreign key, and nothing can check it until the party table (A11) exists.

-- 1. What every row must be ----------------------------------------------------------------------------------
ALTER TABLE account ADD CONSTRAINT account_type_known CHECK (type IN ('asset', 'liability', 'equity', 'income', 'expense'));
ALTER TABLE account ADD CONSTRAINT account_status_known CHECK (status IN ('active', 'archived'));
-- The 12 roles (decided 23 Nov): ADR 0012's eight plus what sale posting needs.
ALTER TABLE account_role ADD CONSTRAINT account_role_known CHECK (role IN ('cash', 'bank', 'mobile_money',
  'card_clearing', 'receivable', 'customer_advance', 'pass_through_payable', 'sales_revenue',
  'inventory', 'cost_of_goods_sold', 'vat_output_payable', 'service_revenue'));
-- Exactly one side per line, never negative (Munif, 24 Nov); the columns are numeric(18,2).
ALTER TABLE journal_line ADD CONSTRAINT journal_line_one_side
  CHECK (debit >= 0 AND credit >= 0 AND (debit > 0) <> (credit > 0));
-- A reversal says so consistently (REVIEW 2, decided 24 Nov): reversal_of is set exactly when source_type is
-- 'reversal', and then source_id is the original, so the posts-once key also allows only one reversal.
ALTER TABLE journal ADD CONSTRAINT journal_reversal_consistent CHECK (
  (reversal_of IS NULL AND source_type <> 'reversal')
  OR (reversal_of IS NOT NULL AND source_type = 'reversal' AND source_id = reversal_of));

-- 2. Pass-through and advance roles map to liability accounts only (invariant 8) --------------------------------
CREATE FUNCTION public.account_role_liability_check() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE account_type text;
BEGIN
  IF NEW.role IN ('pass_through_payable', 'customer_advance') THEN
    SELECT a.type INTO account_type FROM public.account a WHERE a.id = NEW.account_id AND a.business_id = NEW.business_id;
    IF account_type IS DISTINCT FROM 'liability' THEN
      RAISE EXCEPTION 'account_role: % must map to a liability account (invariant 8)', NEW.role USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER account_role_liability_check BEFORE INSERT OR UPDATE ON account_role
  FOR EACH ROW EXECUTE FUNCTION public.account_role_liability_check();

-- 3. An account's type is fixed once a journal line or a role uses it, for every role (decision 2, 23 Nov) ------
CREATE FUNCTION public.account_type_fixed_once_used() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.type IS DISTINCT FROM OLD.type AND (
       EXISTS (SELECT 1 FROM public.journal_line l WHERE l.business_id = OLD.business_id AND l.account_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.account_role r WHERE r.business_id = OLD.business_id AND r.account_id = OLD.id)) THEN
    RAISE EXCEPTION 'account %: the type can''t change once a journal line or a role uses the account', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER account_type_fixed_once_used BEFORE UPDATE OF type ON account
  FOR EACH ROW EXECUTE FUNCTION public.account_type_fixed_once_used();

-- 4. Posted is permanent (invariant 2), for every role, owners included -----------------------------------------
CREATE FUNCTION public.journal_is_immutable() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION '%: posted journals are never updated or deleted; post a reversal', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER journal_is_immutable BEFORE UPDATE OR DELETE ON journal FOR EACH ROW EXECUTE FUNCTION public.journal_is_immutable();
CREATE TRIGGER journal_line_is_immutable BEFORE UPDATE OR DELETE ON journal_line FOR EACH ROW EXECUTE FUNCTION public.journal_is_immutable();

-- 5. Lines only on postable, active accounts --------------------------------------------------------------------
-- An account missing from this business is left to the composite foreign key, which reports it plainly.
CREATE FUNCTION public.journal_line_postable_account() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE ok boolean;
BEGIN
  SELECT a.is_postable AND a.status = 'active' INTO ok FROM public.account a
   WHERE a.id = NEW.account_id AND a.business_id = NEW.business_id;
  IF ok IS FALSE THEN
    RAISE EXCEPTION 'journal_line: account % is not postable or is archived', NEW.account_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER journal_line_postable_account BEFORE INSERT ON journal_line FOR EACH ROW EXECUTE FUNCTION public.journal_line_postable_account();

-- 6. No reversal of a reversal (Munif, 24 Nov). Runs as the caller: the original must be visible in the caller's
-- scope, which PostingService needs anyway to mirror its lines. The foreign key has already checked it exists.
CREATE FUNCTION public.journal_no_reversal_of_reversal() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE original_reversal uuid; found boolean;
BEGIN
  IF NEW.reversal_of IS NOT NULL THEN
    SELECT true, j.reversal_of INTO found, original_reversal FROM public.journal j
     WHERE j.id = NEW.reversal_of AND j.business_id = NEW.business_id;
    IF found IS NOT TRUE THEN
      RAISE EXCEPTION 'journal: the original journal % is not visible in this scope', NEW.reversal_of
        USING ERRCODE = 'check_violation';
    END IF;
    IF original_reversal IS NOT NULL THEN
      RAISE EXCEPTION 'journal: a reversal of a reversal is not allowed (journal % is itself a reversal)', NEW.reversal_of
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER journal_no_reversal_of_reversal BEFORE INSERT ON journal
  FOR EACH ROW EXECUTE FUNCTION public.journal_no_reversal_of_reversal();

-- 7. Balanced at commit (invariant 1): at least two lines, debits = credits; a reversal mirrors its original ------
-- One check, called by one trigger function per table: PL/pgSQL may evaluate both branches of a CASE, so a shared
-- trigger function can't read NEW.id on journal and NEW.journal_id on journal_line.
CREATE FUNCTION public.journal_assert_balanced(j_id uuid) RETURNS void
  LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
DECLARE n int; d numeric; c numeric; orig uuid; mismatch int;
BEGIN
  SELECT count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0) INTO n, d, c
    FROM public.journal_line WHERE journal_id = j_id;
  IF n < 2 OR d <> c THEN
    RAISE EXCEPTION 'journal %: unbalanced or fewer than two lines (debits %, credits %, lines %)', j_id, d, c, n
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT reversal_of INTO orig FROM public.journal WHERE id = j_id;
  IF orig IS NOT NULL THEN
    SELECT count(*) INTO mismatch FROM (
      (SELECT account_id, party_id, credit AS debit, debit AS credit FROM public.journal_line WHERE journal_id = orig
       EXCEPT ALL
       SELECT account_id, party_id, debit, credit FROM public.journal_line WHERE journal_id = j_id)
      UNION ALL
      (SELECT account_id, party_id, debit, credit FROM public.journal_line WHERE journal_id = j_id
       EXCEPT ALL
       SELECT account_id, party_id, credit, debit FROM public.journal_line WHERE journal_id = orig)) x;
    IF mismatch > 0 THEN
      RAISE EXCEPTION 'journal %: a reversal must mirror journal %', j_id, orig USING ERRCODE = 'check_violation';
    END IF;
  END IF;
END;
$$;
CREATE FUNCTION public.journal_balanced_on_journal() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog
AS $$ BEGIN PERFORM public.journal_assert_balanced(NEW.id); RETURN NULL; END; $$;
CREATE FUNCTION public.journal_balanced_on_line() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog
AS $$ BEGIN PERFORM public.journal_assert_balanced(NEW.journal_id); RETURN NULL; END; $$;
CREATE CONSTRAINT TRIGGER journal_balanced AFTER INSERT ON journal DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.journal_balanced_on_journal();
CREATE CONSTRAINT TRIGGER journal_line_balanced AFTER INSERT ON journal_line DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.journal_balanced_on_line();

-- 8. TRUNCATE refused on all four, for every role --------------------------------------------------------------
CREATE TRIGGER account_no_truncate BEFORE TRUNCATE ON account FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();
CREATE TRIGGER account_role_no_truncate BEFORE TRUNCATE ON account_role FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();
CREATE TRIGGER journal_no_truncate BEFORE TRUNCATE ON journal FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();
CREATE TRIGGER journal_line_no_truncate BEFORE TRUNCATE ON journal_line FOR EACH STATEMENT EXECUTE FUNCTION public.refuse_truncate();
