ALTER POLICY "Ver categorias padrão e próprias" ON public.categories USING ((is_default = true) OR (auth.uid() = user_id));
ALTER POLICY "Atualizar próprias categorias" ON public.categories USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
ALTER POLICY "Criar próprias categorias" ON public.categories WITH CHECK (auth.uid() = user_id);
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_default_is_shipped;
