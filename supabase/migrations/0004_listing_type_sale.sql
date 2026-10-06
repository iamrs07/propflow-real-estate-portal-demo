-- -----------------------------------------------------------------------------
-- 0004 — add the 'sale' listing type.
--
-- 'rent'  = tenanted, priced per month or year
-- 'sale'  = buying a home, shown to visitors as "Buy"
-- 'resale'= buying a home from its previous owner
--
-- 'sale' is also declared in 0001 so a fresh install needs only the original
-- three files. This migration exists so an installation that already applied
-- 0001-0003 can add the value in place instead of being rebuilt.
--
-- `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block on older
-- PostgreSQL releases, so the guard is written to be safe on any supported
-- version: the enum label is looked up first, and the whole file is a no-op
-- when the value is already present.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'listing_type'
      and e.enumlabel = 'sale'
  ) then
    alter type public.listing_type add value if not exists 'sale';
  end if;
end
$$;
