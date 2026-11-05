-- Cartoes de credito (faturas, limites, vencimentos) e carteira de investimentos manual.
-- As politicas usam household_user_ids(): sem parceria, so as linhas do proprio usuario.

-- 1. Cartoes
CREATE TABLE IF NOT EXISTS public.credit_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
    brand TEXT NOT NULL DEFAULT 'outro' CHECK (brand IN ('visa','mastercard','elo','amex','hipercard','outro')),
    credit_limit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
    closing_day INT NOT NULL CHECK (closing_day BETWEEN 1 AND 31),
    due_day INT NOT NULL CHECK (due_day BETWEEN 1 AND 31),
    pay_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_cards_user ON public.credit_cards (user_id);

-- 2. Compras no cartao ficam em transactions (entram em despesas, categorias e limites pela data da compra),
--    mas nao mexem no saldo das contas: o dinheiro sai quando a fatura e paga.
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS card_id UUID REFERENCES public.credit_cards(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS invoice_month DATE;          -- 1o dia do mes de vencimento da fatura
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS installment_group UUID;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS installment_number INT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS installment_total INT;
CREATE INDEX IF NOT EXISTS idx_transactions_card_invoice ON public.transactions (card_id, invoice_month) WHERE card_id IS NOT NULL;

-- 3. Pagamentos de fatura (saem de uma conta; nao contam como despesa de novo)
CREATE TABLE IF NOT EXISTS public.card_invoice_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
    invoice_month DATE NOT NULL,
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    paid_on DATE NOT NULL,
    account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_card_payments_card ON public.card_invoice_payments (card_id, invoice_month);
CREATE INDEX IF NOT EXISTS idx_card_payments_account ON public.card_invoice_payments (account_id);

-- 4. Investimentos (carteira manual) e movimentos
CREATE TABLE IF NOT EXISTS public.investments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    kind TEXT NOT NULL DEFAULT 'outros' CHECK (kind IN ('renda_fixa','tesouro','acoes','fiis','cripto','fundos','previdencia','poupanca','outros')),
    institution TEXT,
    invested NUMERIC(16,2) NOT NULL DEFAULT 0,        -- total aportado (custo)
    current_value NUMERIC(16,2) NOT NULL DEFAULT 0,   -- valor atual informado
    archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_investments_user ON public.investments (user_id);

CREATE TABLE IF NOT EXISTS public.investment_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    investment_id UUID NOT NULL REFERENCES public.investments(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('aporte','resgate','valor')),
    amount NUMERIC(16,2) NOT NULL CHECK (amount >= 0),
    moved_on DATE NOT NULL,
    account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    note TEXT,
    value_after NUMERIC(16,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_movements_inv ON public.investment_movements (investment_id, moved_on);
CREATE INDEX IF NOT EXISTS idx_inv_movements_account ON public.investment_movements (account_id);

-- 5. RLS
ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso aos cartoes da casa" ON public.credit_cards FOR ALL TO authenticated
    USING (user_id IN (SELECT public.household_user_ids()))
    WITH CHECK (user_id IN (SELECT public.household_user_ids()));
CREATE POLICY "Acesso aos pagamentos de fatura da casa" ON public.card_invoice_payments FOR ALL TO authenticated
    USING (user_id IN (SELECT public.household_user_ids()))
    WITH CHECK (user_id IN (SELECT public.household_user_ids()));
CREATE POLICY "Acesso aos investimentos da casa" ON public.investments FOR ALL TO authenticated
    USING (user_id IN (SELECT public.household_user_ids()))
    WITH CHECK (user_id IN (SELECT public.household_user_ids()));
CREATE POLICY "Acesso aos movimentos de investimento da casa" ON public.investment_movements FOR ALL TO authenticated
    USING (user_id IN (SELECT public.household_user_ids()))
    WITH CHECK (user_id IN (SELECT public.household_user_ids()));

-- 6. Resumo das faturas: uma linha por cartao/mes (total de compras e total pago)
CREATE OR REPLACE FUNCTION public.card_invoice_summary()
RETURNS TABLE (card_id UUID, invoice_month DATE, total NUMERIC, paid NUMERIC)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
    WITH t AS (
        SELECT x.card_id, x.invoice_month,
               SUM(CASE WHEN x.type = 'expense' THEN x.amount ELSE -x.amount END) AS total
          FROM public.transactions x
         WHERE x.card_id IS NOT NULL AND x.invoice_month IS NOT NULL
           AND x.user_id IN (SELECT public.household_user_ids())
         GROUP BY x.card_id, x.invoice_month
    ), p AS (
        SELECT y.card_id, y.invoice_month, SUM(y.amount) AS paid
          FROM public.card_invoice_payments y
         WHERE y.user_id IN (SELECT public.household_user_ids())
         GROUP BY y.card_id, y.invoice_month
    )
    SELECT COALESCE(t.card_id, p.card_id), COALESCE(t.invoice_month, p.invoice_month),
           COALESCE(t.total, 0), COALESCE(p.paid, 0)
      FROM t FULL OUTER JOIN p ON p.card_id = t.card_id AND p.invoice_month = t.invoice_month;
$$;
REVOKE EXECUTE ON FUNCTION public.card_invoice_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.card_invoice_summary() TO authenticated;

-- 7. Movimento de investimento (atomico): aporte soma ao custo e ao valor; resgate reduz o custo pelo custo medio;
--    "valor" apenas atualiza o valor atual (rendimento/queda).
CREATE OR REPLACE FUNCTION public.investment_move(
    p_investment UUID, p_kind TEXT, p_amount NUMERIC,
    p_date DATE DEFAULT NULL, p_account UUID DEFAULT NULL, p_note TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
    i public.investments%ROWTYPE;
    v_after NUMERIC;
    v_invested NUMERIC;
    v_date DATE := COALESCE(p_date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
BEGIN
    IF p_kind NOT IN ('aporte', 'resgate', 'valor') THEN RAISE EXCEPTION 'Tipo de movimento inválido'; END IF;
    IF p_amount IS NULL OR p_amount < 0 OR (p_kind <> 'valor' AND p_amount = 0) THEN RAISE EXCEPTION 'Valor inválido'; END IF;

    SELECT * INTO i FROM public.investments
     WHERE id = p_investment AND user_id IN (SELECT public.household_user_ids()) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Investimento não encontrado'; END IF;

    IF p_account IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.accounts a WHERE a.id = p_account AND a.user_id IN (SELECT public.household_user_ids())
    ) THEN RAISE EXCEPTION 'Conta não encontrada'; END IF;

    IF p_kind = 'aporte' THEN
        v_after := i.current_value + p_amount;
        v_invested := i.invested + p_amount;
    ELSIF p_kind = 'resgate' THEN
        IF p_amount > i.current_value + 0.004 THEN RAISE EXCEPTION 'Resgate maior que o valor atual'; END IF;
        v_invested := CASE WHEN i.current_value > 0 THEN round(i.invested * (1 - p_amount / i.current_value), 2) ELSE 0 END;
        v_after := i.current_value - p_amount;
    ELSE
        v_after := p_amount;
        v_invested := i.invested;
    END IF;

    UPDATE public.investments SET current_value = v_after, invested = v_invested, updated_at = now() WHERE id = i.id;
    INSERT INTO public.investment_movements (user_id, investment_id, kind, amount, moved_on, account_id, note, value_after)
    VALUES (i.user_id, i.id, p_kind, p_amount, v_date, p_account, left(p_note, 200), v_after);
END
$$;
REVOKE EXECUTE ON FUNCTION public.investment_move(UUID, TEXT, NUMERIC, DATE, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.investment_move(UUID, TEXT, NUMERIC, DATE, UUID, TEXT) TO authenticated;
