-- Meu perfil: foto do usuário (opcional). O arquivo fica no bucket privado "receipts", na pasta do próprio usuário.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_path TEXT
  CHECK (avatar_path IS NULL OR avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$');
GRANT UPDATE (avatar_path) ON public.profiles TO authenticated;
