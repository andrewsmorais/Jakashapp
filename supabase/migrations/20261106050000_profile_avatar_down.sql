REVOKE UPDATE (avatar_path) ON public.profiles FROM authenticated;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS avatar_path;
