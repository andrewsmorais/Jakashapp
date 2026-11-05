-- Desfaz a Fase 5. Os dados das colunas novas (credor, status, acordo...) SAO PERDIDOS; as parcelas de acordo
-- ja criadas continuam como contas a pagar comuns (a ligacao com a divida some).
DROP FUNCTION IF EXISTS public.register_debt_agreement(UUID, INT, NUMERIC, DATE);

-- Funcoes de volta ao corpo anterior
CREATE OR REPLACE FUNCTION public.mark_bill_paid(p_bill_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
    b public.bills%ROWTYPE;
    v_today DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
    SELECT * INTO b FROM public.bills
     WHERE id = p_bill_id AND user_id IN (SELECT public.household_user_ids()) AND status = 'pending' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada ou já paga'; END IF;

    UPDATE public.bills SET status = 'paid', paid_at = now() WHERE id = b.id;
    INSERT INTO public.transactions (user_id, amount, description, type, date, origin, is_business, revenue_kind, client_id)
    VALUES (b.user_id, b.amount, b.description, b.type, v_today, 'manual', b.is_business, b.revenue_kind, b.client_id);

    IF b.recurrence = 'monthly' THEN
        INSERT INTO public.bills (user_id, description, amount, due_date, type, recurrence, is_business, revenue_kind, client_id)
        VALUES (b.user_id, b.description, b.amount, (b.due_date + INTERVAL '1 month')::date, b.type, 'monthly', b.is_business, b.revenue_kind, b.client_id);
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.register_debt_payment(p_debt_id UUID, p_amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_balance NUMERIC;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
    UPDATE public.debts SET balance = GREATEST(balance - p_amount, 0)
     WHERE id = p_debt_id AND user_id IN (SELECT public.household_user_ids()) RETURNING balance INTO v_balance;
    IF NOT FOUND THEN RAISE EXCEPTION 'Dívida não encontrada'; END IF;
    INSERT INTO public.debt_payments (debt_id, amount) VALUES (p_debt_id, p_amount);
    RETURN v_balance;
END
$$;

DROP INDEX IF EXISTS public.idx_bills_debt;
ALTER TABLE public.bills DROP COLUMN IF EXISTS debt_id;

ALTER TABLE public.debts DROP CONSTRAINT IF EXISTS debts_kind_check;
UPDATE public.debts SET kind = 'outro' WHERE kind IN ('conta_consumo','loja');
ALTER TABLE public.debts ADD CONSTRAINT debts_kind_check
    CHECK (kind IN ('cartao','cheque_especial','emprestimo','financiamento','outro'));

ALTER TABLE public.debts
    DROP COLUMN IF EXISTS creditor, DROP COLUMN IF EXISTS original_amount, DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS overdue_since, DROP COLUMN IF EXISTS essential, DROP COLUMN IF EXISTS cash_offer,
    DROP COLUMN IF EXISTS agreement_installments, DROP COLUMN IF EXISTS agreement_amount, DROP COLUMN IF EXISTS agreement_first_due;
