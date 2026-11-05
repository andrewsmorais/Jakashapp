DROP INDEX IF EXISTS public.idx_whatsapp_inbox_reply_wamid;

ALTER TABLE public.whatsapp_inbox
    DROP COLUMN IF EXISTS reply_wamid,
    DROP COLUMN IF EXISTS reply_status,
    DROP COLUMN IF EXISTS reply_status_at;
