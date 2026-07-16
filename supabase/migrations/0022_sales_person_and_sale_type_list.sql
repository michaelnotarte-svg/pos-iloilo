-- ============================================================
-- SALES PERSON + EDITABLE SALE TYPE
--  1. invoices.sales_person — one sales person per invoice (parent level)
--  2. sale_type: enum → text so it can be a user-editable managed list
--     (same treatment storage / mode_of_payment got in migration 0007)
-- ============================================================

-- 1) Sales person on the invoice
alter table invoices add column if not exists sales_person text;

-- 2) Make sale_type user-extensible
alter table invoices alter column sale_type type text;

-- 3) Seed the editable Sale Type list (shared across branches)
insert into list_options (list_type, name, sort_order) values
  ('sale_type', 'Walk-in', 1),
  ('sale_type', 'Delivery', 2),
  ('sale_type', 'Out-of-Town', 3)
on conflict do nothing;

-- Pick up any other sale types already in use (e.g. from the Iloilo backfill:
-- 'Tonio Trucking', 'Transfer') so nothing disappears from the dropdown.
insert into list_options (list_type, name)
  select distinct 'sale_type', sale_type
  from invoices
  where sale_type is not null and sale_type <> ''
on conflict do nothing;

-- The Sales Person list starts empty — add entries via the "Manage" link on the
-- invoice form. It is branch-scoped (each branch keeps its own sales people).
