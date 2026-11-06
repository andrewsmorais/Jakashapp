-- Segurança: um lançamento (e um pagamento de fatura) só pode apontar para conta, cartão e categoria da própria casa
-- (ou categoria padrão do app). Antes, a RLS só conferia o user_id da linha: dava para gravar o id do cartão de outra
-- pessoa e mexer no lembrete de fatura dela (achado 4.6 da auditoria run-2). Vale também para finish_shopping_list,
-- que grava em transactions.
-- Escritas do servidor (service role, sem auth.uid()) não passam por aqui.
CREATE OR REPLACE FUNCTION public.check_refs_in_household()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  j jsonb := to_jsonb(NEW);
  v uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  v := (j->>'account_id')::uuid;
  IF v IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = v AND a.user_id IN (SELECT public.household_user_ids())) THEN
    RAISE EXCEPTION 'Conta inválida.' USING ERRCODE = '42501';
  END IF;
  v := (j->>'card_id')::uuid;
  IF v IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.credit_cards c WHERE c.id = v AND c.user_id IN (SELECT public.household_user_ids())) THEN
    RAISE EXCEPTION 'Cartão inválido.' USING ERRCODE = '42501';
  END IF;
  v := (j->>'debit_card_id')::uuid;
  IF v IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.credit_cards c WHERE c.id = v AND c.user_id IN (SELECT public.household_user_ids())) THEN
    RAISE EXCEPTION 'Cartão inválido.' USING ERRCODE = '42501';
  END IF;
  v := (j->>'category_id')::uuid;
  IF v IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.categories c WHERE c.id = v AND ((c.is_default AND c.user_id IS NULL) OR c.user_id IN (SELECT public.household_user_ids()))
  ) THEN
    RAISE EXCEPTION 'Categoria inválida.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.check_refs_in_household() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_transactions_refs_household ON public.transactions;
CREATE TRIGGER trg_transactions_refs_household BEFORE INSERT OR UPDATE OF account_id, card_id, debit_card_id, category_id
  ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.check_refs_in_household();

DROP TRIGGER IF EXISTS trg_card_invoice_payments_refs_household ON public.card_invoice_payments;
CREATE TRIGGER trg_card_invoice_payments_refs_household BEFORE INSERT OR UPDATE OF card_id, account_id
  ON public.card_invoice_payments FOR EACH ROW EXECUTE FUNCTION public.check_refs_in_household();

-- Aviso do Supabase: função sem search_path fixo.
ALTER FUNCTION public.subscription_is_live(text, timestamptz) SET search_path = public, pg_temp;
