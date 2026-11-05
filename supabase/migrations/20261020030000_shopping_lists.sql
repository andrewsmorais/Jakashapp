-- Fase 4 — Comprar (lista de compras). Aditiva: duas tabelas novas e uma funcao. Nada existente e alterado.
-- RLS no mesmo modelo das demais tabelas: a casa (a pessoa + o parceiro aceito) enxerga as listas; ninguem de fora.

CREATE TABLE IF NOT EXISTS public.shopping_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Mercado' CHECK (char_length(name) BETWEEN 1 AND 60),
    is_business BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    leftover_list_id UUID REFERENCES public.shopping_lists(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_user ON public.shopping_lists (user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.shopping_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
    created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    quantity NUMERIC(10,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit TEXT CHECK (unit IS NULL OR char_length(unit) <= 12),
    est_price NUMERIC(12,2) CHECK (est_price IS NULL OR est_price >= 0),
    checked BOOLEAN NOT NULL DEFAULT false,
    checked_at TIMESTAMPTZ,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shopping_items_list ON public.shopping_items (list_id, position, created_at);
-- Sugestoes de itens mais comprados: leitura por nome entre as listas da casa.
CREATE INDEX IF NOT EXISTS idx_shopping_items_name ON public.shopping_items (lower(name));

ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Casal acessa listas de compras" ON public.shopping_lists FOR ALL TO authenticated
    USING (user_id IN (SELECT public.household_user_ids()))
    WITH CHECK (user_id IN (SELECT public.household_user_ids()));
CREATE POLICY "Casal acessa itens das listas de compras" ON public.shopping_items FOR ALL TO authenticated
    USING (list_id IN (SELECT l.id FROM public.shopping_lists l WHERE l.user_id IN (SELECT public.household_user_ids())))
    WITH CHECK (list_id IN (SELECT l.id FROM public.shopping_lists l WHERE l.user_id IN (SELECT public.household_user_ids())));

-- Finalizar a compra: UMA transacao no banco. Trava a lista, entao um clique duplo (ou duas pessoas ao mesmo tempo)
-- nao gera dois lancamentos: a segunda chamada recebe o mesmo resultado da primeira.
-- O que nao foi marcado passa para uma lista nova ("ficou faltando").
CREATE OR REPLACE FUNCTION public.finish_shopping_list(
    p_list_id UUID,
    p_amount NUMERIC,
    p_description TEXT,
    p_date DATE,
    p_category_id UUID DEFAULT NULL,
    p_account_id UUID DEFAULT NULL,
    p_card_id UUID DEFAULT NULL,
    p_invoice_month DATE DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    l public.shopping_lists%ROWTYPE;
    v_tx UUID;
    v_left UUID;
BEGIN
    IF p_amount IS NULL OR p_amount < 0 OR p_amount > 100000000 THEN
        RAISE EXCEPTION 'valor invalido';
    END IF;

    SELECT * INTO l FROM public.shopping_lists WHERE id = p_list_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'lista nao encontrada';
    END IF;
    IF l.status = 'done' THEN
        RETURN jsonb_build_object('transaction_id', l.transaction_id, 'leftover_list_id', l.leftover_list_id, 'already', true);
    END IF;

    IF p_card_id IS NOT NULL AND p_invoice_month IS NULL THEN
        RAISE EXCEPTION 'fatura obrigatoria para compra no cartao';
    END IF;

    IF p_amount > 0 THEN
        INSERT INTO public.transactions (user_id, description, amount, type, date, category_id, account_id, card_id, invoice_month, origin, is_business)
        VALUES (auth.uid(), left(coalesce(nullif(trim(p_description), ''), l.name), 120), p_amount, 'expense', p_date, p_category_id,
                CASE WHEN p_card_id IS NULL THEN p_account_id END, p_card_id, CASE WHEN p_card_id IS NOT NULL THEN p_invoice_month END,
                'manual', l.is_business)
        RETURNING id INTO v_tx;
    END IF;

    IF EXISTS (SELECT 1 FROM public.shopping_items WHERE list_id = l.id AND NOT checked) THEN
        INSERT INTO public.shopping_lists (user_id, name, is_business)
        VALUES (l.user_id, l.name, l.is_business)
        RETURNING id INTO v_left;
        UPDATE public.shopping_items SET list_id = v_left WHERE list_id = l.id AND NOT checked;
    END IF;

    UPDATE public.shopping_lists
       SET status = 'done', finished_at = now(), transaction_id = v_tx, leftover_list_id = v_left
     WHERE id = l.id;

    RETURN jsonb_build_object('transaction_id', v_tx, 'leftover_list_id', v_left, 'already', false);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.finish_shopping_list(UUID, NUMERIC, TEXT, DATE, UUID, UUID, UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_shopping_list(UUID, NUMERIC, TEXT, DATE, UUID, UUID, UUID, DATE) TO authenticated;
