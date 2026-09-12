-- ============================================================
-- DELETION DEPENDENCY GUARDS (RLS backstop for the UI warnings).
-- Clear dependents first, so each destructive step is done by the right role
-- and stays auditable:
--   • an invoice can be deleted only once its payments are cleared
--   • (stock-vs-sales dependency is enforced in the UI; see PurchaseOrderDetail)
--
-- Supersedes 0028's inv_delete clause (which let a Payments holder delete an
-- invoice that still had payments). Now NO non-admin can delete an invoice while
-- it has live payments — clear the payments first (needs the Payments role).
-- ============================================================
drop policy if exists "inv_delete" on invoices;
create policy "inv_delete" on invoices for delete
  using (
    public.is_admin() or (
      public.has_tag('Sales') and location = public.my_location()
      and not exists (
        select 1 from partial_payments pp
        where pp.invoice_id = invoices.id and pp.deleted_at is null
      )
    )
  );
