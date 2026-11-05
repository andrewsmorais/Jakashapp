-- Sincronização com a API do Asaas: valor líquido (taxa real), upsert sem corrida e estado da última sync.

alter table public.billing_events add column if not exists net_amount numeric(10, 2);

-- Índice único comum (não parcial) para o upsert por (payment_id, kind). payment_id nulo (cancelamentos) continua permitido várias vezes.
drop index if exists public.billing_events_payment_kind_uq;
alter table public.billing_events
  add constraint billing_events_payment_kind_uq unique (payment_id, kind);

create table if not exists public.admin_sync_state (
  id int primary key default 1 check (id = 1),
  last_sync_at timestamptz,
  last_full_sync_at timestamptz,
  last_result jsonb
);
alter table public.admin_sync_state enable row level security;
revoke all on public.admin_sync_state from anon, authenticated;

create or replace function public.admin_metrics(p_cpf numeric, p_mei numeric, p_months int default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tz constant text := 'America/Sao_Paulo';
  v_months int := greatest(1, least(coalesce(p_months, 12), 36));
  v_first timestamp := date_trunc('month', now() at time zone tz) - ((v_months - 1) || ' months')::interval;
  result jsonb;
begin
  select jsonb_build_object(
    'generated_at', now(),
    'total_users', (select count(*) from profiles),
    'payers_total', (select count(distinct user_id) from billing_events where kind = 'paid' and user_id is not null),
    'snapshot', (
      select coalesce(jsonb_agg(jsonb_build_object('status', st, 'plan', pl, 'count', n)), '[]'::jsonb)
      from (
        select subscription_status::text as st, subscription_plan::text as pl, count(*) as n
        from profiles group by 1, 2
      ) s
    ),
    'mrr', (
      select coalesce(sum(case subscription_plan::text when 'cpf' then p_cpf when 'mei' then p_mei else 0 end), 0)
      from profiles where subscription_status::text in ('active', 'past_due')
    ),
    'sync', (select to_jsonb(s) from admin_sync_state s where s.id = 1),
    'months', (
      select coalesce(jsonb_agg(row_to_json(m)::jsonb order by m.month), '[]'::jsonb)
      from (
        select
          to_char(gs, 'YYYY-MM-01') as month,
          coalesce((select sum(e.amount) from billing_events e
                    where e.kind = 'paid' and date_trunc('month', e.occurred_at at time zone tz) = gs), 0) as revenue,
          coalesce((select sum(e.amount) from billing_events e
                    where e.kind = 'paid' and e.plan = 'cpf' and date_trunc('month', e.occurred_at at time zone tz) = gs), 0) as revenue_cpf,
          coalesce((select sum(e.amount) from billing_events e
                    where e.kind = 'paid' and e.plan = 'mei' and date_trunc('month', e.occurred_at at time zone tz) = gs), 0) as revenue_mei,
          coalesce((select sum(e.amount) from billing_events e
                    where e.kind = 'refunded' and date_trunc('month', e.occurred_at at time zone tz) = gs), 0) as refunds,
          (select count(*) from billing_events e
            where e.kind = 'paid' and date_trunc('month', e.occurred_at at time zone tz) = gs) as payments,
          -- Taxa real do Asaas: valor cobrado - valor líquido, só onde o líquido é conhecido.
          coalesce((select sum(e.amount - e.net_amount) from billing_events e
                    where e.kind = 'paid' and e.net_amount is not null
                      and date_trunc('month', e.occurred_at at time zone tz) = gs), 0) as fees,
          (select count(*) from billing_events e
            where e.kind = 'paid' and e.net_amount is not null
              and date_trunc('month', e.occurred_at at time zone tz) = gs) as fees_known,
          (select count(*) from (
             select user_id, min(occurred_at) as first_paid
             from billing_events where kind = 'paid' and user_id is not null group by user_id
           ) fp where date_trunc('month', fp.first_paid at time zone tz) = gs) as new_customers,
          (select count(distinct e.user_id) from billing_events e
            where e.kind in ('canceled', 'refunded') and e.user_id is not null
              and date_trunc('month', e.occurred_at at time zone tz) = gs) as churned
        from generate_series(v_first, date_trunc('month', now() at time zone tz), interval '1 month') gs
      ) m
    ),
    'costs', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.month), '[]'::jsonb)
      from admin_costs c where c.month >= v_first::date
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_metrics(numeric, numeric, int) from public, anon, authenticated;
grant execute on function public.admin_metrics(numeric, numeric, int) to service_role;
