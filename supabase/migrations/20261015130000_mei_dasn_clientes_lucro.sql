-- Pacote MEI v2: tipo de receita (DASN), clientes e a receber, lucro e retiradas.

-- 1. Clientes do MEI (dados so do dono; nao entram na gestao compartilhada)
CREATE TABLE IF NOT EXISTS public.mei_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    document TEXT CHECK (document IS NULL OR char_length(document) <= 20),
    phone TEXT CHECK (phone IS NULL OR char_length(phone) <= 20),
    email TEXT CHECK (email IS NULL OR char_length(email) <= 120),
    notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 500),
    archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mei_clients_user ON public.mei_clients (user_id, archived);
ALTER TABLE public.mei_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dono gerencia os proprios clientes" ON public.mei_clients FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
REVOKE ALL ON public.mei_clients FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mei_clients TO authenticated;

-- 2. Lancamentos: tipo da receita (DASN separa comercio/industria de servicos), cliente e retirada (pro-labore)
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS revenue_kind TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.mei_clients(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_owner_draw BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_revenue_kind_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_revenue_kind_check
    CHECK (revenue_kind IS NULL OR revenue_kind IN ('comercio','industria','servicos'));
CREATE INDEX IF NOT EXISTS idx_transactions_client ON public.transactions (client_id) WHERE client_id IS NOT NULL;

-- 3. Contas a receber da empresa: carregam "da empresa", tipo e cliente ate a baixa
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS is_business BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS revenue_kind TEXT;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.mei_clients(id) ON DELETE SET NULL;
ALTER TABLE public.bills DROP CONSTRAINT IF EXISTS bills_revenue_kind_check;
ALTER TABLE public.bills ADD CONSTRAINT bills_revenue_kind_check
    CHECK (revenue_kind IS NULL OR revenue_kind IN ('comercio','industria','servicos'));
CREATE INDEX IF NOT EXISTS idx_bills_client ON public.bills (client_id) WHERE client_id IS NOT NULL;

-- 4. Dar baixa: o lancamento criado herda empresa, tipo e cliente (antes virava lancamento pessoal e ficava fora do limite do MEI)
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

-- 5. Receita/despesa por mes: retiradas (pro-labore) nao contam como despesa da empresa
CREATE OR REPLACE FUNCTION public.mei_monthly(p_year INT)
RETURNS TABLE (month INT, revenue NUMERIC, expenses NUMERIC)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
    SELECT EXTRACT(month FROM t.date)::int,
           COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'), 0),
           COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense' AND NOT t.is_owner_draw), 0)
      FROM public.transactions t
     WHERE t.is_business AND t.user_id = auth.uid()
       AND t.date >= make_date(p_year, 1, 1) AND t.date < make_date(p_year + 1, 1, 1)
     GROUP BY 1
     ORDER BY 1;
$$;

-- 6. Resumo do ano: receita por tipo (DASN), despesas, retiradas e DAS pago.
-- Receita sem tipo usa a atividade principal do perfil.
CREATE OR REPLACE FUNCTION public.mei_year_summary(p_year INT)
RETURNS TABLE (rev_comercio NUMERIC, rev_industria NUMERIC, rev_servicos NUMERIC, expenses NUMERIC, draws NUMERIC, das_paid NUMERIC)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
    WITH act AS (
        SELECT COALESCE((SELECT p.mei_activity FROM public.profiles p WHERE p.id = auth.uid()), 'servicos') AS a
    ),
    tx AS (
        SELECT t.amount, t.type, t.description, t.is_owner_draw, COALESCE(t.revenue_kind, (SELECT a FROM act)) AS kind
          FROM public.transactions t
         WHERE t.is_business AND t.user_id = auth.uid()
           AND t.date >= make_date(p_year, 1, 1) AND t.date < make_date(p_year + 1, 1, 1)
    )
    SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'income' AND kind = 'comercio'), 0),
           COALESCE(SUM(amount) FILTER (WHERE type = 'income' AND kind = 'industria'), 0),
           COALESCE(SUM(amount) FILTER (WHERE type = 'income' AND kind = 'servicos'), 0),
           COALESCE(SUM(amount) FILTER (WHERE type = 'expense' AND NOT is_owner_draw), 0),
           COALESCE(SUM(amount) FILTER (WHERE type = 'expense' AND is_owner_draw), 0),
           COALESCE(SUM(amount) FILTER (WHERE type = 'expense' AND NOT is_owner_draw AND description ILIKE 'DAS%'), 0)
      FROM tx;
$$;
REVOKE EXECUTE ON FUNCTION public.mei_year_summary(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mei_year_summary(INT) TO authenticated;
