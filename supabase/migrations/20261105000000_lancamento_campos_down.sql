ALTER TABLE public.transactions DROP COLUMN IF EXISTS is_fixed;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS due_date;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS competence_date;
ALTER TABLE public.bills DROP COLUMN IF EXISTS is_fixed;
