-- Gestao compartilhada: politicas ADITIVAS (nao removem as existentes) para o parceiro acessar os dados da casa,
-- e funcoes de saldo/pagamento que consideram a casa, cartoes e investimentos.
-- Ficam de fora: profiles (assinatura, WhatsApp), chat_history, open_finance_connections.

CREATE POLICY "Casal acessa transacoes" ON public.transactions FOR ALL TO authenticated
    USING (user_id IN (SELECT public.household_user_ids()))
    WITH CHECK (user_id IN (SELECT public.household_user_ids()));
CREATE POLICY "Casal acessa contas bancarias" ON public.accounts FOR ALL TO authenticated
    USING (user_id IN (SELECT public.household_user_ids()))
    WITH CHECK (user_id IN (SELECT public.household_user_ids()));
CREATE POLICY "Casal acessa contas a pagar" ON public.bills FOR ALL TO authenticated
    USING (user_id IN (SELECT public.household_user_ids()))
    WITH CHECK (user_id IN (SELECT public.household_user_ids()));
CREATE POLICY "Casal acessa limites" ON public.budgets FOR ALL TO authenticated
    USING (user_id IN (SELECT public.household_user_ids()))
    WITH CHECK (user_id IN (SELECT public.household_user_ids()));
CREATE POLICY "Casal acessa metas" ON public.goals FOR ALL TO authenticated
    USING (user_id IN (SELECT public.household_user_ids()))
    WITH CHECK (user_id IN (SELECT public.household_user_ids()));
CREATE POLICY "Casal acessa dividas" ON public.debts FOR ALL TO authenticated
    USING (user_id IN (SELECT public.household_user_ids()))
    WITH CHECK (user_id IN (SELECT public.household_user_ids()));
CREATE POLICY "Casal acessa aportes das metas" ON public.goal_contributions FOR ALL TO authenticated
    USING (goal_id IN (SELECT g.id FROM public.goals g WHERE g.user_id IN (SELECT public.household_user_ids())))
    WITH CHECK (goal_id IN (SELECT g.id FROM public.goals g WHERE g.user_id IN (SELECT public.household_user_ids())));
CREATE POLICY "Casal acessa pagamentos de dividas" ON public.debt_payments FOR ALL TO authenticated
    USING (debt_id IN (SELECT d.id FROM public.debts d WHERE d.user_id IN (SELECT public.household_user_ids())))
    WITH CHECK (debt_id IN (SELECT d.id FROM public.debts d WHERE d.user_id IN (SELECT public.household_user_ids())));
-- Categorias proprias do parceiro: so leitura (para exibir o nome nos lancamentos)
CREATE POLICY "Casal ve categorias do parceiro" ON public.categories FOR SELECT TO authenticated
    USING (user_id IN (SELECT public.household_user_ids()));

-- Saldo por conta da casa: saldo inicial + lancamentos comuns (sem cartao) - faturas pagas - aportes + resgates.
-- Lancamentos sem conta (ex.: WhatsApp) entram na conta ativa mais antiga de cada pessoa.
CREATE OR REPLACE FUNCTION public.account_balances()
RETURNS TABLE (id UUID, name TEXT, kind TEXT, balance NUMERIC)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
    WITH acc AS (
        SELECT a.id, a.user_id, a.name, a.kind, a.initial_balance, a.created_at,
               row_number() OVER (PARTITION BY a.user_id ORDER BY a.created_at, a.id) AS rn
          FROM public.accounts a
         WHERE a.user_id IN (SELECT public.household_user_ids()) AND NOT a.archived
    ),
    tx AS (
        SELECT t.user_id, t.account_id,
               SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END) AS n
          FROM public.transactions t
         WHERE t.user_id IN (SELECT public.household_user_ids()) AND t.card_id IS NULL
         GROUP BY t.user_id, t.account_id
    ),
    pay AS (
        SELECT p.account_id, SUM(p.amount) AS n
          FROM public.card_invoice_payments p
         WHERE p.user_id IN (SELECT public.household_user_ids()) AND p.account_id IS NOT NULL
         GROUP BY p.account_id
    ),
    inv AS (
        SELECT m.account_id,
               SUM(CASE WHEN m.kind = 'resgate' THEN m.amount ELSE -m.amount END) AS n
          FROM public.investment_movements m
         WHERE m.user_id IN (SELECT public.household_user_ids())
           AND m.account_id IS NOT NULL AND m.kind IN ('aporte', 'resgate')
         GROUP BY m.account_id
    )
    SELECT acc.id, acc.name, acc.kind,
           acc.initial_balance
             + COALESCE((SELECT tx.n FROM tx WHERE tx.user_id = acc.user_id AND tx.account_id = acc.id), 0)
             + CASE WHEN acc.rn = 1
                    THEN COALESCE((SELECT tx.n FROM tx WHERE tx.user_id = acc.user_id AND tx.account_id IS NULL), 0)
                    ELSE 0 END
             - COALESCE((SELECT pay.n FROM pay WHERE pay.account_id = acc.id), 0)
             + COALESCE((SELECT inv.n FROM inv WHERE inv.account_id = acc.id), 0)
      FROM acc ORDER BY acc.created_at, acc.id;
$$;

-- Dar baixa em conta: agora tambem para contas da casa. A data do pagamento usa o fuso de Sao Paulo.
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
    INSERT INTO public.transactions (user_id, amount, description, type, date, origin)
    VALUES (b.user_id, b.amount, b.description, b.type, v_today, 'manual');

    IF b.recurrence = 'monthly' THEN
        INSERT INTO public.bills (user_id, description, amount, due_date, type, recurrence)
        VALUES (b.user_id, b.description, b.amount, (b.due_date + INTERVAL '1 month')::date, b.type, 'monthly');
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
