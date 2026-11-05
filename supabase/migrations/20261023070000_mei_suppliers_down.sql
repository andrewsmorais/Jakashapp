-- Desfaz os fornecedores do MEI. Os fornecedores cadastrados e a ligacao deles com lancamentos e contas SAO PERDIDOS
-- (os lancamentos e as contas em si continuam).
DROP TRIGGER IF EXISTS trg_transactions_supplier_owner ON public.transactions;
DROP TRIGGER IF EXISTS trg_bills_supplier_owner ON public.bills;
DROP FUNCTION IF EXISTS public.check_supplier_owner();

-- Dar baixa de volta ao corpo anterior (20261020040000), sem fornecedor
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

DROP INDEX IF EXISTS public.idx_transactions_supplier;
DROP INDEX IF EXISTS public.idx_bills_supplier;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS supplier_id;
ALTER TABLE public.bills DROP COLUMN IF EXISTS supplier_id;
DROP TABLE IF EXISTS public.mei_suppliers;
