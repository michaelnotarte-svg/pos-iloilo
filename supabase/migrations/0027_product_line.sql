-- ============================================================
-- PRODUCT LINE dimension.
-- Separates product lines that are tracked & computed differently:
--   'Meat'    — boxed meat, sold BY KILO (the existing/default line)
--   'Chorizo' — sold BY UNIT (price × quantity; simple-count inventory)
-- Lives on the ITEM (so stocks/inventory derive it via item_id join) and is
-- STAMPED on the invoice at creation (receipts never mix lines), which locks
-- each invoice to one line and lets totals split cleanly by line — WITHOUT
-- splitting customers/AR across locations.
--
-- Column-level defaults backfill existing rows in the catalog (PG11+, no table
-- rewrite, no row-trigger/audit noise): every current item/invoice reads as the
-- Meat line, sold by kilo.
-- ============================================================
alter table items    add column if not exists product_line text default 'Meat';
alter table items    add column if not exists sell_by      text default 'kg';   -- 'kg' | 'unit'
alter table invoices add column if not exists product_line text default 'Meat';

-- Managed list for the picker (shared across branches; a branch simply has no
-- items in a line it doesn't sell).
insert into list_options (list_type, name, sort_order) values
  ('product_line', 'Meat', 1),
  ('product_line', 'Chorizo', 2)
on conflict do nothing;
