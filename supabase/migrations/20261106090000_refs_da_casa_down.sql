DROP TRIGGER IF EXISTS trg_card_invoice_payments_refs_household ON public.card_invoice_payments;
DROP TRIGGER IF EXISTS trg_transactions_refs_household ON public.transactions;
DROP FUNCTION IF EXISTS public.check_refs_in_household();
ALTER FUNCTION public.subscription_is_live(text, timestamptz) RESET search_path;
