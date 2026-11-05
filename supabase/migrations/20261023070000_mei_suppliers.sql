-- Pacote MEI: fornecedores. O MEI cadastra quem lhe vende e acompanha o que compra e o que deve a cada um.
-- Aditiva: tabela nova, uma coluna opcional em lancamentos e em contas, e a funcao mark_bill_paid atualizada
-- para a baixa de uma conta a pagar levar o fornecedor para o lancamento. Nada e apagado.

-- 1. Fornecedores (dados so do dono, como mei_clients; nao entram na gestao compartilhada)
CREATE TABLE IF NOT EXISTS public.mei_suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120 AND btrim(name) <> ''),
    -- CPF (11) ou CNPJ (14), so os digitos. O app confere se tem 11 ou 14; o banco so garante que sao digitos (ate 14).
    document TEXT CHECK (document IS NULL OR document ~ '^[0-9]{1,14}$'),
    phone TEXT CHECK (phone IS NULL OR char_length(phone) <= 20),
    email TEXT CHECK (email IS NULL OR char_length(email) <= 120),
    pix_key TEXT CHECK (pix_key IS NULL OR char_length(pix_key) <= 140),
    -- O que ele fornece (ex.: "Materia-prima", "Embalagens")
    category TEXT CHECK (category IS NULL OR char_length(category) <= 60),
    notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 500),
    archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mei_suppliers_user ON public.mei_suppliers (user_id, archived);
ALTER TABLE public.mei_suppliers ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Dono gerencia os proprios fornecedores' AND polrelid = 'public.mei_suppliers'::regclass) THEN
        CREATE POLICY "Dono gerencia os proprios fornecedores" ON public.mei_suppliers FOR ALL TO authenticated
            USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;
REVOKE ALL ON public.mei_suppliers FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mei_suppliers TO authenticated;

-- 2. Lancamentos e contas a pagar ligados a um fornecedor (opcional; apagar o fornecedor so solta a ligacao)
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.mei_suppliers(id) ON DELETE SET NULL;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.mei_suppliers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_supplier ON public.transactions (supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bills_supplier ON public.bills (supplier_id) WHERE supplier_id IS NOT NULL;

-- 3. O fornecedor tem que ser de quem e dono da linha. A checagem de chave estrangeira ignora a RLS, entao sem isto alguem
--    poderia apontar para o fornecedor de outra pessoa (se soubesse o id). SECURITY DEFINER para valer tambem quando um membro
--    da casa da baixa numa conta do dono (a RLS de mei_suppliers esconderia o fornecedor dele). So olha a linha e o id.
CREATE OR REPLACE FUNCTION public.check_supplier_owner()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.supplier_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
        IF NOT EXISTS (SELECT 1 FROM public.mei_suppliers s WHERE s.id = NEW.supplier_id AND s.user_id = NEW.user_id) THEN
            RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = '23503';
        END IF;
    END IF;
    RETURN NEW;
END
$$;
REVOKE EXECUTE ON FUNCTION public.check_supplier_owner() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_transactions_supplier_owner
    BEFORE INSERT OR UPDATE OF supplier_id, user_id ON public.transactions
    FOR EACH ROW WHEN (NEW.supplier_id IS NOT NULL) EXECUTE FUNCTION public.check_supplier_owner();
CREATE OR REPLACE TRIGGER trg_bills_supplier_owner
    BEFORE INSERT OR UPDATE OF supplier_id, user_id ON public.bills
    FOR EACH ROW WHEN (NEW.supplier_id IS NOT NULL) EXECUTE FUNCTION public.check_supplier_owner();

-- 4. Dar baixa: o lancamento criado (e a proxima conta mensal) herdam o fornecedor.
--    Corpo anterior (20261020040000) mantido; so o fornecedor e novo.
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
    INSERT INTO public.transactions (user_id, amount, description, type, date, origin, is_business, revenue_kind, client_id, supplier_id)
    VALUES (b.user_id, b.amount, b.description, b.type, v_today, 'manual', b.is_business, b.revenue_kind, b.client_id, b.supplier_id);

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
        INSERT INTO public.bills (user_id, description, amount, due_date, type, recurrence, is_business, revenue_kind, client_id, supplier_id)
        VALUES (b.user_id, b.description, b.amount, (b.due_date + INTERVAL '1 month')::date, b.type, 'monthly', b.is_business, b.revenue_kind, b.client_id, b.supplier_id);
    END IF;
END
$$;
