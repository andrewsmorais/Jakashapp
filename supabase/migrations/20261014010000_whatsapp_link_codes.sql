-- Vinculacao do WhatsApp por codigo: o usuario gera um codigo no painel e manda
-- "conectar ABC123" para o numero do bot. Prova que ele controla o numero (sem OTP pago).

CREATE TABLE IF NOT EXISTS public.whatsapp_link_codes (
    code TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_link_codes ENABLE ROW LEVEL SECURITY; -- sem policies: so o servidor acessa
CREATE INDEX IF NOT EXISTS idx_wa_link_codes_user ON public.whatsapp_link_codes (user_id);

CREATE OR REPLACE FUNCTION public.link_whatsapp_number(p_code TEXT, p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user UUID;
    v_exp TIMESTAMPTZ;
    v_used TIMESTAMPTZ;
BEGIN
    SELECT user_id, expires_at, used_at INTO v_user, v_exp, v_used
    FROM public.whatsapp_link_codes
    WHERE code = upper(p_code)
    FOR UPDATE;

    IF v_user IS NULL THEN
        RETURN 'invalid';
    END IF;

    -- Idempotente: se o worker repetir apos o sucesso, responde ok
    IF v_used IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user AND whatsapp_number = p_phone) THEN
            RETURN 'ok';
        END IF;
        RETURN 'invalid';
    END IF;

    IF v_exp <= now() THEN
        RETURN 'invalid';
    END IF;

    IF EXISTS (SELECT 1 FROM public.profiles WHERE whatsapp_number = p_phone AND id <> v_user) THEN
        RETURN 'in_use';
    END IF;

    UPDATE public.profiles SET whatsapp_number = p_phone WHERE id = v_user;
    UPDATE public.whatsapp_link_codes SET used_at = now() WHERE code = upper(p_code);
    RETURN 'ok';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.link_whatsapp_number(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_whatsapp_number(TEXT, TEXT) TO service_role;
