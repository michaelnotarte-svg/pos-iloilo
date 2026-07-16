-- ============================================================
--  1. Ref # (po_number) is optional — the form says "optional" but the column
--     was NOT NULL, so any delivery saved without a ref failed.
--  2. Branch transfers — stock leaving this branch for another branch.
--     Recorded as an OUT only in the sending branch's ledger.
--  3. Notes on invoice payments.
-- ============================================================

-- 1) Ref # optional (still unique; Postgres allows many NULLs in a unique index)
alter table purchase_orders alter column po_number drop not null;

-- 2) Destination branch for a branch transfer (null for normal deliveries and
--    for in-branch warehouse transfers)
alter table purchase_orders add column if not exists to_branch text;

-- 3) Payment notes
alter table partial_payments add column if not exists notes text;

-- Seed the Branch Transfer delivery category (shared across branches)
insert into list_options (list_type, name, sort_order) values
  ('delivery_category', 'Branch Transfer', 10)
on conflict do nothing;
