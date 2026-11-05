-- Métricas do painel admin para um período qualquer (dia, mês, ano ou intervalo "de/até").
-- Só leitura, só para o servidor (service_role). Datas no fuso America/Sao_Paulo.

-- Totais de eventos de cobrança entre duas datas (inclusive).
create or replace function public.admin_period_totals(p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select (p_from::timestamp at time zone 'America/Sao_Paulo') as t0,
           ((p_to + 1)::timestamp at time zone 'America/Sao_Paulo') as t1
  ),
  ev as (
    select e.kind, e.plan, e.amount, e.net_amount, e.user_id
    from billing_events e, bounds b
    where e.occurred_at >= b.t0 and e.occurred_at < b.t1
  )
  select jsonb_build_object(
    'revenue',     coalesce(sum(amount) filter (where kind = 'paid'), 0),
    'revenue_cpf', coalesce(sum(amount) filter (where kind = 'paid' and plan = 'cpf'), 0),
    'revenue_mei', coalesce(sum(amount) filter (where kind = 'paid' and plan = 'mei'), 0),
    'refunds',     coalesce(sum(amount) filter (where kind = 'refunded'), 0),
    'payments',    count(*) filter (where kind = 'paid'),
    -- Taxa real do Asaas (valor cobrado - líquido), só onde o líquido é conhecido.
    'fees',        coalesce(sum(amount - net_amount) filter (where kind = 'paid' and net_amount is not null), 0),
    'fees_known',  count(*) filter (where kind = 'paid' and net_amount is not null),
    'churned',     count(distinct user_id) filter (where kind in ('canceled', 'refunded') and user_id is not null),
    'payers',      count(distinct user_id) filter (where kind = 'paid' and user_id is not null),
    -- Novo cliente = primeira cobrança paga da vida caiu dentro do período.
    'new_customers', (
      select count(*) from (
        select user_id, min(occurred_at) as first_paid
        from billing_events where kind = 'paid' and user_id is not null group by user_id
      ) fp, bounds b
      where fp.first_paid >= b.t0 and fp.first_paid < b.t1
    )
  )
  from ev;
$$;

-- Período completo: totais, período anterior (mesmo tamanho, logo antes), série por dia ou por mês e custos lançados.
create or replace function public.admin_period(p_from date, p_to date, p_grain text default 'auto')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int;
  v_grain text;
  v_prev_from date;
  v_prev_to date;
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'invalid range';
  end if;
  v_days := (p_to - p_from) + 1;
  if v_days > 1100 then
    raise exception 'range too large';
  end if;

  v_grain := case
    when p_grain in ('day', 'month') then p_grain
    when v_days <= 62 then 'day'
    else 'month'
  end;
  v_prev_to := p_from - 1;
  v_prev_from := p_from - v_days;

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'days', v_days,
    'grain', v_grain,
    'totals', admin_period_totals(p_from, p_to),
    'prev', jsonb_build_object(
      'from', v_prev_from, 'to', v_prev_to,
      'totals', admin_period_totals(v_prev_from, v_prev_to)
    ),
    'series', (
      select coalesce(jsonb_agg(
        jsonb_build_object('bucket', to_char(b.s, 'YYYY-MM-DD'), 'from', b.s, 'to', b.e, 'totals', admin_period_totals(b.s, b.e))
        order by b.s
      ), '[]'::jsonb)
      from (
        select
          greatest(g::date, p_from) as s,
          least(
            case when v_grain = 'day' then g::date else (g + interval '1 month' - interval '1 day')::date end,
            p_to
          ) as e
        from generate_series(
          case when v_grain = 'day' then p_from::timestamp else date_trunc('month', p_from::timestamp) end,
          p_to::timestamp,
          case when v_grain = 'day' then interval '1 day' else interval '1 month' end
        ) g
      ) b
    ),
    'costs', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.month), '[]'::jsonb)
      from admin_costs c
      where c.month >= date_trunc('month', p_from)::date and c.month <= p_to
    ),
    'costs_prev', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.month), '[]'::jsonb)
      from admin_costs c
      where c.month >= date_trunc('month', v_prev_from::timestamp)::date and c.month <= v_prev_to
    )
  );
end;
$$;

revoke all on function public.admin_period_totals(date, date) from public, anon, authenticated;
revoke all on function public.admin_period(date, date, text) from public, anon, authenticated;
grant execute on function public.admin_period_totals(date, date) to service_role;
grant execute on function public.admin_period(date, date, text) to service_role;
