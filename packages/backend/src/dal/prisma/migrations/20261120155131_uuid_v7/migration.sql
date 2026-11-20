-- Copied from dal/sql/functions/uuid_v7.sql (ADR 0008 amendment, #27). No table or schema change:
-- no column uses it yet; the organization_tree migration (A3b) adds the defaults.

-- uuid_v7(): a UUID version 7 (RFC 9562) for primary key defaults (ADR 0008 amendment, #27).
-- Shipped in migration uuid_v7. PostgreSQL 16 has no built-in for it (uuidv7() arrives in PostgreSQL 18).
--
-- Layout: the first 48 bits are the Unix time in milliseconds, so new keys sort in creation order and index
-- inserts stay at the right-hand end of the B-tree. The rest comes from gen_random_uuid() (core since
-- PostgreSQL 13, no extension), with the version nibble changed from 4 to 7. Its variant bits (10xx) are kept.
--   bytes 1 to 6  <- int8send(milliseconds), bytes 3 to 8 (the low 48 bits)
--   bits 52, 53   <- set to 1: version 0100 becomes 0111
-- Keys created within the same millisecond are unique but not ordered among themselves.
--
-- VOLATILE: a new value on every call, so it works as a column DEFAULT for each inserted row.
-- Not SECURITY DEFINER; search_path is fixed so another schema cannot shadow the functions it calls.
--
-- Changing it: add a new migration with CREATE OR REPLACE FUNCTION, and make the same edit here.
-- UuidV7.int.test.ts fails when this file and the migrations define it differently.

CREATE FUNCTION public.uuid_v7() RETURNS uuid
  LANGUAGE sql VOLATILE PARALLEL SAFE
  SET search_path = pg_catalog
AS $$
  SELECT encode(
    set_bit(
      set_bit(
        overlay(uuid_send(gen_random_uuid())
                PLACING substring(int8send((extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
                FROM 1 FOR 6),
        52, 1),
      53, 1),
    'hex')::uuid;
$$;

-- PUBLIC can already execute a new function; the explicit grant documents that the app role relies on it.
GRANT EXECUTE ON FUNCTION public.uuid_v7() TO erp_app;
