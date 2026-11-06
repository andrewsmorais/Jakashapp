-- Novo lançamento: lançamento fixo, vencimento separado e data de competência.
-- Só acrescenta colunas opcionais; nada do que já existe muda.
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS competence_date DATE;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN NOT NULL DEFAULT false;
