-- Tracks which Google Drive receipt photos have been processed, so re-pulling the
-- shared folder never re-imports them. file_id is Drive's file id (globally
-- unique). status: 'saved' (became an invoice) or 'discarded' (junk / not an
-- invoice). A row here means "won't resurface". NOTE: the "Skip" action writes
-- NOTHING — skipped receipts have no row and intentionally reappear on the next
-- pull; only Approve and Discard record a marker.
create table if not exists drive_imports (
  file_id     text primary key,
  file_name   text,
  location    text not null,
  invoice_id  uuid references invoices (id) on delete set null,
  status      text not null default 'saved',
  created_at  timestamptz not null default now()
);

create index if not exists drive_imports_location_idx on drive_imports (location);

alter table drive_imports enable row level security;
-- QA feature: any authenticated user may read/record their branch's imports.
create policy "drive_imports_rw" on drive_imports
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
