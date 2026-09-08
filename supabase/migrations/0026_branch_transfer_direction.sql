-- ============================================================
-- Branch transfers now carry a DIRECTION so a branch can record
-- both sending stock out and receiving stock in.
--   'out' — this branch ships to another branch  (deduct from from_storage)
--   'in'  — this branch receives from another branch (add to storage)
--   null  — not a branch transfer
-- to_branch holds the OTHER branch in both directions; direction disambiguates.
-- ============================================================
alter table purchase_orders add column if not exists transfer_direction text;

-- Backfill: any existing branch transfer (has to_branch) was an outbound send.
update purchase_orders
   set transfer_direction = 'out'
 where to_branch is not null
   and transfer_direction is null;
