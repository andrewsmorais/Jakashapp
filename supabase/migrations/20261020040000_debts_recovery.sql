-- Fase 5 — Sair do vermelho. Aditiva: colunas novas em debts e bills, uma funcao nova e duas funcoes atualizadas.
-- Nada e apagado. As politicas RLS existentes de debts, debt_payments e bills continuam valendo.

-- 1. Dividas completas
ALTER TABLE public.debts
    ADD COLUMN IF NOT EXISTS creditor TEXT CHECK (creditor IS NULL OR char_length(creditor) <= 80),
    ADD COLUMN IF NOT EXISTS original_amount NUMERIC(12,2) CHECK (original_amount IS NULL OR original_amount >= 0),
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'em_dia' CHECK (status IN ('em_dia','atrasada','negativada','negociada','quitada')),
    ADD COLUMN IF NOT EXISTS overdue_since DATE,
    ADD COLUMN IF NOT EXISTS essential BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS cash_offer NUMERIC(12,2) CHECK (cash_offer IS NULL OR cash_offer >= 0),
    ADD COLUMN IF NOT EXISTS agreement_installments INT CHECK (agreement_installments IS NULL OR agreement_installments BETWEEN 1 AND 60),
    ADD COLUMN IF NOT EXISTS agreement_amount NUMERIC(12,2) CHECK (agreement_amount IS NULL OR agreement_amount > 0),
    ADD COLUMN IF NOT EXISTS agreement_first_due DATE;

ALTER TABLE public.debts DROP CONSTRAINT IF EXISTS debts_kind_check;
ALTER TABLE public.debts ADD CONSTRAINT debts_kind_check
    CHECK (kind IN ('cartao','cheque_especial','emprestimo','financiamento','conta_consumo','loja','outro'));

-- 2. Parcela de acordo = conta a pagar ligada a divida (o cron de lembretes ja avisa contas a pagar)
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS debt_id UUID REFERENCES public.debts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bills_debt ON public.bills (debt_id) WHERE debt_id IS NOT NULL;

-- 3. Registrar acordo: cria as parcelas como contas a pagar, numa transacao so
CREATE OR REPLACE FUNCTION public.register_debt_agreement(p_debt_id UUID, p_installments INT, p_amount NUMERIC, p_first_due DATE)
RETURNS INT
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE d public.debts%ROWTYPE;
BEGIN
    IF p_installments IS NULL OR p_installments < 1 OR p_installments > 60 THEN RAISE EXCEPTION 'Número de parcelas inválido'; END IF;
    IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000000 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
    IF p_first_due IS NULL THEN RAISE EXCEPTION 'Informe a data da primeira parcela'; END IF;

    SELECT * INTO d FROM public.debts WHERE id = p_debt_id AND user_id IN (SELECT public.household_user_ids()) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Dívida não encontrada'; END IF;

    -- Nao apaga nada: se ja ha parcelas de acordo a pagar, pede para resolver antes (dar baixa ou excluir em Contas a pagar).
    IF EXISTS (SELECT 1 FROM public.bills WHERE debt_id = d.id AND status = 'pending') THEN
        RAISE EXCEPTION 'Esta dívida já tem parcelas de acordo a pagar';
    END IF;

    UPDATE public.debts
       SET status = 'negociada', agreement_installments = p_installments, agreement_amount = p_amount, agreement_first_due = p_first_due
     WHERE id = d.id;

    INSERT INTO public.bills (user_id, description, amount, due_date, type, recurrence, debt_id)
    SELECT d.user_id, 'Acordo: ' || left(d.name, 60) || ' (' || i || '/' || p_installments || ')', p_amount,
           (p_first_due + make_interval(months => i - 1))::date, 'expense', 'none', d.id
      FROM generate_series(1, p_installments) AS i;

    RETURN p_installments;
END
$$;
REVOKE EXECUTE ON FUNCTION public.register_debt_agreement(UUID, INT, NUMERIC, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_debt_agreement(UUID, INT, NUMERIC, DATE) TO authenticated;

-- 4. Dar baixa numa conta: se for parcela de acordo, abate a divida na MESMA transacao.
--    Corpo anterior (20261015130000) mantido; so o trecho de divida e novo.
CREATE OR REPLACE FUNCTION public.mark_bill_paid(p_bill_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
    b public.bills%ROWTYPE;
    v_today DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
    v_left NUMERIC;
BEGIN
    SELECT * INTO b FROM public.bills
     WHERE id = p_bill_id AND user_id IN (SELECT public.household_user_ids()) AND status = 'pending' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada ou já paga'; END IF;

    UPDATE public.bills SET status = 'paid', paid_at = now() WHERE id = b.id;
    INSERT INTO public.transactions (user_id, amount, description, type, date, origin, is_business, revenue_kind, client_id)
    VALUES (b.user_id, b.amount, b.description, b.type, v_today, 'manual', b.is_business, b.revenue_kind, b.client_id);

    IF b.debt_id IS NOT NULL THEN
        UPDATE public.debts SET balance = GREATEST(balance - b.amount, 0)
         WHERE id = b.debt_id AND user_id IN (SELECT public.household_user_ids())
        RETURNING balance INTO v_left;
        IF FOUND THEN
            INSERT INTO public.debt_payments (debt_id, amount, paid_on) VALUES (b.debt_id, b.amount, v_today);
            -- Ultima parcela do acordo paga (ou saldo zerado): a divida esta quitada.
            IF v_left <= 0 OR NOT EXISTS (SELECT 1 FROM public.bills WHERE debt_id = b.debt_id AND status = 'pending') THEN
                UPDATE public.debts SET balance = 0, status = 'quitada' WHERE id = b.debt_id;
            END IF;
        END IF;
    END IF;

    IF b.recurrence = 'monthly' THEN
        INSERT INTO public.bills (user_id, description, amount, due_date, type, recurrence, is_business, revenue_kind, client_id)
        VALUES (b.user_id, b.description, b.amount, (b.due_date + INTERVAL '1 month')::date, b.type, 'monthly', b.is_business, b.revenue_kind, b.client_id);
    END IF;
END
$$;

-- 5. Abater divida a mao: saldo zerado marca como quitada
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
    IF v_balance <= 0 THEN
        UPDATE public.debts SET status = 'quitada' WHERE id = p_debt_id;
    END IF;
    RETURN v_balance;
END
$$;
