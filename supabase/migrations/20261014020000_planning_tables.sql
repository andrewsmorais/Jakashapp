-- Fase 1/2: limites de gasto, contas a pagar, dividas, tipos de objetivo e categorias essenciais.

-- 1. Categorias: essencial (usado na reserva de emergencia) e subcategoria. As categorias padrao essenciais sao definidas em src/lib/planner.ts.
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_essential BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.categories(id) ON DELETE CASCADE;

-- 2. Objetivos: tipo e metadados (destino, numero de pessoas, etc.)
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'custom';
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.goals ADD CONSTRAINT goals_type_check
    CHECK (type IN ('custom','viagem','bebe','reserva','casamento','carro','imovel','curso','reforma'));

-- 3. Limites de gasto (category_id NULL = limite geral do mes)
CREATE TABLE IF NOT EXISTS public.budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
    amount_limit NUMERIC(12,2) NOT NULL CHECK (amount_limit > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS budgets_user_category_key
    ON public.budgets (user_id, COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 4. Contas a pagar e a receber
CREATE TABLE IF NOT EXISTS public.bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    due_date DATE NOT NULL,
    type public.transaction_type NOT NULL DEFAULT 'expense',
    recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','monthly')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bills_user_status_due ON public.bills (user_id, status, due_date);

-- 5. Dividas e pagamentos
CREATE TABLE IF NOT EXISTS public.debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'outro' CHECK (kind IN ('cartao','cheque_especial','emprestimo','financiamento','outro')),
    balance NUMERIC(12,2) NOT NULL CHECK (balance >= 0),
    monthly_rate NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (monthly_rate >= 0),
    min_payment NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (min_payment >= 0),
    archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.debt_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debt_id UUID NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    paid_on DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. RLS
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso aos proprios limites" ON public.budgets FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Acesso as proprias contas" ON public.bills FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Acesso as proprias dividas" ON public.debts FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Acesso aos pagamentos das proprias dividas" ON public.debt_payments FOR ALL
    USING (debt_id IN (SELECT id FROM public.debts WHERE user_id = auth.uid()))
    WITH CHECK (debt_id IN (SELECT id FROM public.debts WHERE user_id = auth.uid()));

-- 7. Dar baixa numa conta: marca como paga, lanca a transacao e cria a proxima se for mensal
CREATE OR REPLACE FUNCTION public.mark_bill_paid(p_bill_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE b public.bills%ROWTYPE;
BEGIN
    SELECT * INTO b FROM public.bills
     WHERE id = p_bill_id AND user_id = auth.uid() AND status = 'pending' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada ou já paga'; END IF;

    UPDATE public.bills SET status = 'paid', paid_at = now() WHERE id = b.id;
    INSERT INTO public.transactions (user_id, amount, description, type, date, origin)
    VALUES (b.user_id, b.amount, b.description, b.type, CURRENT_DATE, 'manual');

    IF b.recurrence = 'monthly' THEN
        INSERT INTO public.bills (user_id, description, amount, due_date, type, recurrence)
        VALUES (b.user_id, b.description, b.amount, (b.due_date + INTERVAL '1 month')::date, b.type, 'monthly');
    END IF;
END $$;

-- 8. Registrar pagamento de divida (abate o saldo)
CREATE OR REPLACE FUNCTION public.register_debt_payment(p_debt_id UUID, p_amount NUMERIC)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_balance NUMERIC;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
    UPDATE public.debts SET balance = GREATEST(balance - p_amount, 0)
     WHERE id = p_debt_id AND user_id = auth.uid() RETURNING balance INTO v_balance;
    IF NOT FOUND THEN RAISE EXCEPTION 'Dívida não encontrada'; END IF;
    INSERT INTO public.debt_payments (debt_id, amount) VALUES (p_debt_id, p_amount);
    RETURN v_balance;
END $$;

REVOKE EXECUTE ON FUNCTION public.mark_bill_paid(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.register_debt_payment(UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_bill_paid(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_debt_payment(UUID, NUMERIC) TO authenticated;

-- 9. Nome padrao do usuario novo
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, whatsapp_number)
  VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'full_name', 'Usuário Jakash'),
      new.raw_user_meta_data->>'whatsapp_number'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
