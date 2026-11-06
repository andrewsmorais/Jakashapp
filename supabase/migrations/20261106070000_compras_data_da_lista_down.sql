DROP INDEX IF EXISTS public.idx_shopping_lists_user_date;
ALTER TABLE public.shopping_lists DROP COLUMN IF EXISTS list_date;
