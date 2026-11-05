-- Painel de métricas do admin (somente o dono, profiles.is_admin = true).
-- Tudo aqui é acessado SOMENTE pelo servidor (service_role): RLS ligada e sem policy para usuários.

-- 1) Eventos de cobrança gravados pelo webhook do Asaas (receita e churn reais, com data).
create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  asaas_customer_id text,
  payment_id text,
  kind text not null check (kind in ('paid', 'overdue', 'refunded', 'canceled')),
  plan text,
  amount numeric(10, 2) not null default 0,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Evita contar duas vezes o mesmo pagamento (PAYMENT_RECEIVED + PAYMENT_CONFIRMED).
create unique index if not exists billing_events_payment_kind_uq
  on public.billing_events (payment_id, kind) where payment_id is not null;
create index if not exists billing_events_kind_date_idx
  on public.billing_events (kind, occurred_at desc);
create index if not exists billing_events_user_idx
  on public.billing_events (user_id);

alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;

-- 2) Custos mensais lançados à mão pelo dono (um registro por mês, sempre dia 1).
create table if not exists public.admin_costs (
  month date primary key,
  vercel numeric(10, 2) not null default 0,
  supabase numeric(10, 2) not null default 0,
  ai numeric(10, 2) not null default 0,
  whatsapp numeric(10, 2) not null default 0,
  domain numeric(10, 2) not null default 0,
  payment_fees numeric(10, 2) not null default 0,
  taxes numeric(10, 2) not null default 0,
  other numeric(10, 2) not null default 0,
  notes text,
  updated_at timestamptz not null default now(),
  constraint admin_costs_month_is_first check (month = date_trunc('month', month)::date),
  constraint admin_costs_non_negative check (
    vercel >= 0 and supabase >= 0 and ai >= 0 and whatsapp >= 0 and domain >= 0
    and payment_fees >= 0 and taxes >= 0 and other >= 0
  )
);

alter table public.admin_costs enable row level security;
revoke all on public.admin_costs from anon, authenticated;

-- 3) Métricas agregadas em uma chamada só. Preços vêm do código (src/lib/plans.ts).
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
