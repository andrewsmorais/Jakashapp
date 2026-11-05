-- Cartao de debito: usa a mesma tabela dos cartoes, mas as compras saem direto da conta vinculada (sem fatura).
-- Compra no debito = lancamento normal com account_id da conta do cartao + debit_card_id para saber qual cartao foi usado.
-- (card_id continua exclusivo de credito: e ele que faz a compra ir para a fatura em vez de mexer no saldo.)

ALTER TABLE public.credit_cards ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'credito';
ALTER TABLE public.credit_cards ADD CONSTRAINT credit_cards_kind_check CHECK (kind IN ('credito','debito'));

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS debit_card_id UUID REFERENCES public.credit_cards(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_debit_card ON public.transactions (debit_card_id, date) WHERE debit_card_id IS NOT NULL;

-- Lembrete de fatura so para cartao de credito.
CREATE OR REPLACE FUNCTION public.card_invoices_due_on(p_dates DATE[])
RETURNS TABLE (card_id UUID, user_id UUID, card_name TEXT, due_date DATE, remaining NUMERIC)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
    SELECT c.id, c.user_id, c.name, d.due_date,
           round(COALESCE(t.total, 0) - COALESCE(p.paid, 0), 2)
      FROM unnest(p_dates) AS d(due_date)
      JOIN public.credit_cards c
        ON c.archived = false AND c.kind = 'credito'
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
