-- Fase 9 — selo da instituicao em contas e cartoes. Aditiva e opcional: sem valor, o app deduz pelo nome.
ALTER TABLE public.accounts
    ADD COLUMN IF NOT EXISTS institution TEXT CHECK (institution IS NULL OR institution ~ '^[a-z0-9_]{1,30}$');
ALTER TABLE public.credit_cards
    ADD COLUMN IF NOT EXISTS institution TEXT CHECK (institution IS NULL OR institution ~ '^[a-z0-9_]{1,30}$');
