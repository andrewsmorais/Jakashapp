-- Assinatura obrigatória (parte 1): valores novos dos tipos. Precisa rodar antes da parte 2 (o Postgres
-- não deixa usar um valor de enum na mesma transação em que ele foi criado).
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'none';
ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'mensal';
ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'anual';
