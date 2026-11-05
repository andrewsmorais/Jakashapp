-- Categorias que cada pessoa mostra ou esconde nas listas de escolha.
-- Não altera a tabela categories: as prontas continuam travadas e os lançamentos antigos mantêm a categoria.
-- Sem linha = regra do app (conta nova começa só com as básicas; conta antiga vê todas).
CREATE TABLE IF NOT EXISTS public.category_visibility (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  hidden boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category_id)
);

ALTER TABLE public.category_visibility ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Gerenciar a própria visibilidade de categorias' AND polrelid = 'public.category_visibility'::regclass) THEN
    CREATE POLICY "Gerenciar a própria visibilidade de categorias" ON public.category_visibility FOR ALL TO authenticated
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

REVOKE ALL ON public.category_visibility FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_visibility TO authenticated;
