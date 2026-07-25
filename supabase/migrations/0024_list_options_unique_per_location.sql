-- Branch-scoped lists (storage, sales_person, sale_type) need the SAME option
-- name to exist in more than one branch — e.g. both Iloilo and Bacolod having a
-- 'Delivery' sale type. The original constraint was unique (list_type, name),
-- which made that impossible: seeding Bacolod's 'Delivery' failed with
-- "duplicate key value violates unique constraint list_options_list_type_name_key".
--
-- Scope the uniqueness to the branch instead. NULLS NOT DISTINCT keeps shared
-- (location is null) entries unique among themselves, so we don't regress into
-- allowing duplicate shared rows.

alter table list_options
  drop constraint if exists list_options_list_type_name_key;

alter table list_options
  add constraint list_options_list_type_name_location_key
  unique nulls not distinct (list_type, name, location);
