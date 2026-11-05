-- Desfaz a Fase 9. O selo escolhido some (o app volta a deduzir pelo nome).
ALTER TABLE public.accounts DROP COLUMN IF EXISTS institution;
ALTER TABLE public.credit_cards DROP COLUMN IF EXISTS institution;
