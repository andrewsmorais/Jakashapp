-- Preferência por usuário: marca uma categoria (padrão ou própria, pai ou sub) como essencial e/ou benefício
-- (ex.: vale-alimentação). Não altera a tabela categories (categorias padrão são travadas por RLS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='category_flags') THEN
    CREATE TABLE public.category_flags (
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
      is_essential boolean,
      is_benefit boolean,
      PRIMARY KEY (user_id, category_id)
    );
  END IF;
END $$;

ALTER TABLE public.category_flags ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Ver próprias marcações e do parceiro' AND polrelid = 'public.category_flags'::regclass) THEN
    CREATE POLICY "Ver próprias marcações e do parceiro" ON public.category_flags FOR SELECT
      USING (auth.uid() = user_id OR user_id IN (SELECT household_user_ids()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Gerenciar próprias marcações' AND polrelid = 'public.category_flags'::regclass) THEN
    CREATE POLICY "Gerenciar próprias marcações" ON public.category_flags FOR ALL
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Nova categoria padrão de receita, para marcar vale-alimentação/refeição/benefícios como "benefício"
-- (contam na renda, mas não como dinheiro livre).
INSERT INTO public.categories (name, type, is_default)
SELECT 'Benefícios (VA/VR)', 'income', true
 WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE is_default AND parent_id IS NULL AND lower(name) = lower('Benefícios (VA/VR)'));
