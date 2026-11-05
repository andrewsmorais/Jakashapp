-- Apoio ao envio automatico de lembretes: faturas de cartao que vencem em determinadas datas.
-- Usada so pela rota de cron (service role). Mesma regra de fatura do app: total = despesas - estornos do mes de vencimento,
-- em aberto = total - pagamentos; o dia de vencimento e ajustado ao tamanho do mes (dia 31 vence dia 30/28 quando preciso).

CREATE OR REPLACE FUNCTION public.card_invoices_due_on(p_dates DATE[])
RETURNS TABLE (card_id UUID, user_id UUID, card_name TEXT, due_date DATE, remaining NUMERIC)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
    SELECT c.id, c.user_id, c.name, d.due_date,
           round(COALESCE(t.total, 0) - COALESCE(p.paid, 0), 2)
      FROM unnest(p_dates) AS d(due_date)
      JOIN public.credit_cards c
        ON c.archived = false
       AND LEAST(
             c.due_day,
             EXTRACT(day FROM (date_trunc('month', d.due_date::timestamp) + interval '1 month' - interval '1 day'))::int
           ) = EXTRACT(day FROM d.due_date)::int
      LEFT JOIN LATERAL (
            SELECT SUM(CASE WHEN x.type = 'expense' THEN x.amount ELSE -x.amount END) AS total
              FROM public.transactions x
             WHERE x.card_id = c.id AND x.invoice_month = date_trunc('month', d.due_date::timestamp)::date
      ) t ON true
      LEFT JOIN LATERAL (
            SELECT SUM(y.amount) AS paid
              FROM public.card_invoice_payments y
             WHERE y.card_id = c.id AND y.invoice_month = date_trunc('month', d.due_date::timestamp)::date
      ) p ON true
     WHERE COALESCE(t.total, 0) - COALESCE(p.paid, 0) > 0.004;
$$;

REVOKE ALL ON FUNCTION public.card_invoices_due_on(DATE[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.card_invoices_due_on(DATE[]) TO service_role;
