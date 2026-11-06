-- Supermercado: cada lista tem uma data (o dia da compra), além do nome que já existia.
ALTER TABLE public.shopping_lists ADD COLUMN IF NOT EXISTS list_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date);
UPDATE public.shopping_lists SET list_date = (created_at AT TIME ZONE 'America/Sao_Paulo')::date WHERE list_date IS DISTINCT FROM (created_at AT TIME ZONE 'America/Sao_Paulo')::date AND created_at < now() - interval '1 minute';
CREATE INDEX IF NOT EXISTS idx_shopping_lists_user_date ON public.shopping_lists (user_id, list_date DESC);
