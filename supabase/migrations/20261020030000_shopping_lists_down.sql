-- Desfaz a Fase 4. As listas e itens gravados SAO APAGADOS (os lancamentos em transactions ficam).
DROP FUNCTION IF EXISTS public.finish_shopping_list(UUID, NUMERIC, TEXT, DATE, UUID, UUID, UUID, DATE);
DROP TABLE IF EXISTS public.shopping_items;
DROP TABLE IF EXISTS public.shopping_lists;
