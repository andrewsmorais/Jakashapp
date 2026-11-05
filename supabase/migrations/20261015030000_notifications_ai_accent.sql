-- Lembretes automaticos (push web, e-mail, WhatsApp), limite diario do Chat IA e cor de destaque no perfil.

-- 1. Perfil: cor de destaque sincronizada entre aparelhos e canal de push
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS accent TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notify_push BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_accent_check
    CHECK (accent IS NULL OR accent IN ('violet','blue','green','rose','orange','cyan','red','slate'));
GRANT UPDATE (accent, notify_push) ON public.profiles TO authenticated;

-- 2. Inscricoes de push (gravadas pela rota /api/push/subscribe com service role; o usuario le e apaga as proprias)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions (user_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver as proprias inscricoes de push" ON public.push_subscriptions FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
CREATE POLICY "Apagar as proprias inscricoes de push" ON public.push_subscriptions FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- 3. Registro de envios (evita lembrete duplicado no mesmo dia/canal). Sem politicas: so a service role acessa.
CREATE TABLE IF NOT EXISTS public.notification_log (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('push','email','whatsapp')),
    ref_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, channel, ref_date)
);
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

-- 4. Uso diario do Chat IA (controle de custo). Sem politicas: so a service role acessa.
CREATE TABLE IF NOT EXISTS public.ai_usage (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
);
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- Reserva uma mensagem do dia. Retorna a contagem apos reservar, ou -1 se o limite ja foi atingido.
CREATE OR REPLACE FUNCTION public.ai_usage_hit(p_user UUID, p_day DATE, p_limit INT)
RETURNS INT
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v INT;
BEGIN
    INSERT INTO public.ai_usage AS u (user_id, day, count) VALUES (p_user, p_day, 1)
    ON CONFLICT (user_id, day) DO UPDATE SET count = u.count + 1 WHERE u.count < p_limit
    RETURNING u.count INTO v;
    RETURN COALESCE(v, -1);
END
$$;

-- Devolve a mensagem reservada quando a chamada a IA falha.
CREATE OR REPLACE FUNCTION public.ai_usage_refund(p_user UUID, p_day DATE)
RETURNS VOID
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
    UPDATE public.ai_usage SET count = GREATEST(count - 1, 0) WHERE user_id = p_user AND day = p_day;
$$;

REVOKE ALL ON FUNCTION public.ai_usage_hit(UUID, DATE, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_usage_refund(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_hit(UUID, DATE, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_usage_refund(UUID, DATE) TO service_role;
