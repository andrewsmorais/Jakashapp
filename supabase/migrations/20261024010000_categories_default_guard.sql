-- Categoria "padrão" (is_default) é só a que vem com o app (user_id NULL, criada por migração).
-- Antes, qualquer usuário podia gravar is_default = true na própria categoria e ela aparecia para todos.

-- Rebaixa linhas de usuário marcadas como padrão (em 24/10/2026 não havia nenhuma em produção).
UPDATE public.categories SET is_default = false WHERE is_default AND user_id IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_default_is_shipped') THEN
        ALTER TABLE public.categories ADD CONSTRAINT categories_default_is_shipped CHECK (NOT is_default OR user_id IS NULL);
    END IF;
END $$;

ALTER POLICY "Criar próprias categorias" ON public.categories
    WITH CHECK (auth.uid() = user_id AND is_default = false);

ALTER POLICY "Atualizar próprias categorias" ON public.categories
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id AND is_default = false);

ALTER POLICY "Ver categorias padrão e próprias" ON public.categories
    USING ((is_default = true AND user_id IS NULL) OR auth.uid() = user_id);
