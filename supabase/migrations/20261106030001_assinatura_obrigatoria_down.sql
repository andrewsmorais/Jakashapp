DROP FUNCTION IF EXISTS public.has_app_access();
DROP FUNCTION IF EXISTS public.subscription_is_live(text, timestamptz);
ALTER TABLE public.profiles ALTER COLUMN subscription_status SET DEFAULT 'trial';
ALTER TABLE public.profiles ALTER COLUMN subscription_expires_at SET DEFAULT (now() + interval '7 days');
ALTER TABLE public.profiles ALTER COLUMN subscription_plan SET DEFAULT 'zap';
-- Os valores de enum 'none', 'mensal' e 'anual' não são removidos (o Postgres não remove valor de enum).
