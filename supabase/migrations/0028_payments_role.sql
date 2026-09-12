-- ============================================================
-- PAYMENTS ROLE — recording/editing payments is sensitive and is split out of
-- the broad 'Sales' tag into its own 'Payments' tag.
--
-- Cross-over closed: a 'Sales' user (no 'Payments') must NOT be able to erase
-- payment records by deleting the parent invoice (soft-delete hides the child
-- payments from every read). So deleting an invoice that still has live payments
-- now requires 'Payments' (or admin). Invoices UPDATE also allows 'Payments' so
-- recording a payment can recompute the invoice status.
--
-- 'Payments' is just a value in profiles.tags[] (no enum), assigned in
-- Settings → Users. Admin bypasses everything.
-- ============================================================

-- ── partial_payments writes → Payments (was Sales) ──
drop policy if exists "pp_modify" on partial_payments;
create policy "pp_modify" on partial_payments for all
  using (public.is_admin() or (public.has_tag('Payments') and exists (
    select 1 from invoices i where i.id = partial_payments.invoice_id and i.location = public.my_location())))
  with check (public.is_admin() or (public.has_tag('Payments') and exists (
    select 1 from invoices i where i.id = partial_payments.invoice_id and i.location = public.my_location())));

-- ── invoices: split the blanket "for all" into per-command so DELETE can be
--    gated independently of INSERT/UPDATE. ──
drop policy if exists "inv_modify" on invoices;

create policy "inv_insert" on invoices for insert
  with check (public.is_admin() or (public.has_tag('Sales') and location = public.my_location()));

-- UPDATE by Sales OR Payments (recording a payment recomputes invoices.status).
create policy "inv_update" on invoices for update
  using (public.is_admin() or ((public.has_tag('Sales') or public.has_tag('Payments')) and location = public.my_location()))
  with check (public.is_admin() or ((public.has_tag('Sales') or public.has_tag('Payments')) and location = public.my_location()));

-- DELETE by Sales, but if the invoice still has LIVE payments it also needs
-- Payments (or admin). Prevents erasing payment history without the payments role.
create policy "inv_delete" on invoices for delete
  using (
    public.is_admin() or (
      public.has_tag('Sales') and location = public.my_location()
      and (public.has_tag('Payments') or not exists (
        select 1 from partial_payments pp
        where pp.invoice_id = invoices.id and pp.deleted_at is null
      ))
    )
  );
