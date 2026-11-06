-- Supermercado: lista nova nasce "Lista sem nome" (o campo do nome aparece em branco na tela).
ALTER TABLE public.shopping_lists ALTER COLUMN name SET DEFAULT 'Lista sem nome';
UPDATE public.shopping_lists SET name = 'Lista sem nome' WHERE status = 'open' AND name IN ('Mercado', 'Empresa');
