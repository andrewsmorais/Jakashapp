-- Guarda o wamid da resposta que a Jaki envia e o último status de entrega que a Meta avisa
-- (sent, delivered, read, failed). Serve para diagnosticar "a Jaki respondeu mas não chegou".
-- Aditiva: o código funciona antes e depois desta migration (a gravação é tolerante).

ALTER TABLE public.whatsapp_inbox
    ADD COLUMN IF NOT EXISTS reply_wamid TEXT,
    ADD COLUMN IF NOT EXISTS reply_status TEXT,
    ADD COLUMN IF NOT EXISTS reply_status_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbox_reply_wamid
    ON public.whatsapp_inbox (reply_wamid) WHERE reply_wamid IS NOT NULL;
