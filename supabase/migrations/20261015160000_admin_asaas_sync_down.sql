drop table if exists public.admin_sync_state;
alter table public.billing_events drop constraint if exists billing_events_payment_kind_uq;
create unique index if not exists billing_events_payment_kind_uq
  on public.billing_events (payment_id, kind) where payment_id is not null;
alter table public.billing_events drop column if exists net_amount;
-- A função admin_metrics volta à versão da migration 20261015150000 (reaplique-a se precisar).
