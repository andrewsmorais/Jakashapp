-- Desfaz 20261023020000_remove_whatsapp_assistant.sql: recria as ESTRUTURAS, VAZIAS.
-- Os dados apagados (mensagens, números de WhatsApp, códigos de vínculo, origem dos lançamentos, preferência
-- notify_whatsapp e o custo de WhatsApp em admin_costs) NÃO voltam. Os segredos do Vault e o agendamento do
-- pg_cron também não são recriados (o job do worker nunca foi agendado por migration).
-- O handle_new_user volta a copiar whatsapp_number do cadastro.

-- Fila
DO $$ BEGIN
    CREATE TYPE public.queue_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.whatsapp_inbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wamid TEXT UNIQUE NOT NULL,
    phone_number TEXT NOT NULL,
    raw_payload JSONB NOT NULL,
    status public.queue_status NOT NULL DEFAULT 'pending',
    worker_id UUID,
    locked_until TIMESTAMPTZ,
    ai_response JSONB,
    db_synced BOOLEAN NOT NULL DEFAULT false,
    wa_replied BOOLEAN NOT NULL DEFAULT false,
    retry_count INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reply_wamid TEXT,
    reply_status TEXT,
    reply_status_at TIMESTAMPTZ
);
ALTER TABLE public.whatsapp_inbox ENABLE ROW LEVEL SECURITY; -- sem policies: só o servidor acessa
CREATE INDEX IF NOT EXISTS idx_whatsapp_inbox_queue ON public.whatsapp_inbox (status, next_attempt_at, locked_until);
CREATE INDEX IF NOT EXISTS idx_whatsapp_inbox_reply_wamid ON public.whatsapp_inbox (reply_wamid) WHERE reply_wamid IS NOT NULL;

-- Códigos de vínculo
CREATE TABLE IF NOT EXISTS public.whatsapp_link_codes (
    code TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_link_codes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_wa_link_codes_user ON public.whatsapp_link_codes (user_id);

-- Perfil
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notify_whatsapp BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_whatsapp_number_key
    ON public.profiles (whatsapp_number) WHERE whatsapp_number IS NOT NULL;
GRANT UPDATE (notify_whatsapp) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, whatsapp_number)
  VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'full_name', 'Usuário Jakash'),
      new.raw_user_meta_data->>'whatsapp_number'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Lançamentos
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS source_wamid TEXT,
    ADD COLUMN IF NOT EXISTS source_index INTEGER;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS chk_whatsapp_source;
ALTER TABLE public.transactions
    ADD CONSTRAINT chk_whatsapp_source CHECK (source_wamid IS NULL OR source_index IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS unique_whatsapp_source
    ON public.transactions (source_wamid, source_index) WHERE source_wamid IS NOT NULL;

-- Registro de lembretes
ALTER TABLE public.notification_log DROP CONSTRAINT IF EXISTS notification_log_channel_check;
ALTER TABLE public.notification_log
    ADD CONSTRAINT notification_log_channel_check CHECK (channel IN ('push', 'email', 'whatsapp'));

-- Funções
-- 3. Function to acquire task atomically (FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION acquire_whatsapp_task(p_worker_id UUID, p_lease_seconds INT DEFAULT 45)
RETURNS TABLE (
    id UUID,
    wamid TEXT,
    phone_number TEXT,
    raw_payload JSONB,
    ai_response JSONB,
    db_synced BOOLEAN,
    wa_replied BOOLEAN,
    retry_count INT
) 
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
    -- Select the next available task and update it atomically.
    -- RETURN QUERY ensures zero rows are returned if no task is found (instead of a row of nulls).
    RETURN QUERY
    WITH next_task AS (
        SELECT wi.id 
        FROM whatsapp_inbox wi
        WHERE (wi.status = 'pending' AND wi.next_attempt_at <= NOW())
           OR (wi.status = 'processing' AND wi.locked_until < NOW())
        ORDER BY wi.next_attempt_at ASC, wi.created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    UPDATE whatsapp_inbox
    SET status = 'processing',
        locked_until = NOW() + (p_lease_seconds || ' seconds')::interval,
        worker_id = p_worker_id,
        retry_count = whatsapp_inbox.retry_count + 1,
        updated_at = NOW()
    WHERE whatsapp_inbox.id = (SELECT nt.id FROM next_task nt)
    RETURNING 
        whatsapp_inbox.id, 
        whatsapp_inbox.wamid, 
        whatsapp_inbox.phone_number, 
        whatsapp_inbox.raw_payload, 
        whatsapp_inbox.ai_response, 
        whatsapp_inbox.db_synced, 
        whatsapp_inbox.wa_replied, 
        whatsapp_inbox.retry_count;
END;
$$;

-- Protect RPC
REVOKE EXECUTE ON FUNCTION acquire_whatsapp_task(UUID, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION acquire_whatsapp_task(UUID, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION acquire_whatsapp_task(UUID, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION acquire_whatsapp_task(UUID, INT) TO service_role;

-- 4. Function for atomic financial commit ensuring fencing token is valid
CREATE OR REPLACE FUNCTION commit_financial_transactions(
    p_task_id UUID,
    p_worker_id UUID,
    p_user_id UUID,
    p_transactions JSONB, -- Array of transactions: [{amount, description, category_id, type, date, index}]
    p_user_message TEXT,
    p_ai_reply TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_task whatsapp_inbox%ROWTYPE;
    v_tx JSONB;
    v_user_valid BOOLEAN;
BEGIN
    -- VERY IMPORTANT: Lock the row FIRST in the transaction to prevent concurrent commits
    SELECT * INTO v_task
    FROM whatsapp_inbox
    WHERE id = p_task_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task not found';
    END IF;
    
    -- Idempotent exit: If already synced by a previous successful commit that timed out on network response
    IF v_task.db_synced = true THEN
        RETURN TRUE;
    END IF;

    -- Strict Fencing Token and Lease check
    IF v_task.status != 'processing' OR 
       v_task.worker_id IS NULL OR 
       v_task.worker_id != p_worker_id OR 
       v_task.locked_until IS NULL OR 
       v_task.locked_until <= NOW() THEN
        RAISE EXCEPTION 'Invalid task state, fencing token mismatch, or lease expired';
    END IF;
    
    -- Security Check: Validate p_user_id matches the task's phone_number
    SELECT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = p_user_id AND whatsapp_number = v_task.phone_number
    ) INTO v_user_valid;

    IF NOT v_user_valid THEN
        RAISE EXCEPTION 'Security violation: user_id does not match the phone number of the task';
    END IF;

    -- Insert all transactions with strong idempotency consistency validation
    FOR v_tx IN SELECT * FROM jsonb_array_elements(p_transactions)
    LOOP
        -- Check if a transaction with the same origin index already exists
        IF EXISTS (
            SELECT 1 FROM transactions 
            WHERE source_wamid = v_task.wamid AND source_index = (v_tx->>'index')::INTEGER
        ) THEN
            -- Validate that the existing transaction matches the critical financial data
            IF NOT EXISTS (
                SELECT 1 FROM transactions 
                WHERE source_wamid = v_task.wamid 
                  AND source_index = (v_tx->>'index')::INTEGER
                  AND amount = (v_tx->>'amount')::NUMERIC
                  AND user_id = p_user_id
                  AND description = v_tx->>'description'
                  AND type = (v_tx->>'type')::public.transaction_type
                  AND date = (v_tx->>'date')::DATE
                  AND category_id IS NOT DISTINCT FROM NULLIF(v_tx->>'category_id', '')::UUID
            ) THEN
                RAISE EXCEPTION 'Idempotency conflict: transaction exists with different values';
            END IF;
            -- If it exactly matches, we safely ignore (Idempotent success)
        ELSE
            INSERT INTO transactions (
                user_id, amount, description, category_id, type, date, origin, source_wamid, source_index
            ) VALUES (
                p_user_id,
                (v_tx->>'amount')::NUMERIC,
                v_tx->>'description',
                NULLIF(v_tx->>'category_id', '')::UUID,
                (v_tx->>'type')::public.transaction_type,
                (v_tx->>'date')::DATE,
                'whatsapp'::public.transaction_origin,
                v_task.wamid,
                (v_tx->>'index')::INTEGER
            );
        END IF;
    END LOOP;

    -- Insert Chat History atomically
    INSERT INTO chat_history (user_id, message_role, content) 
    VALUES 
        (p_user_id, 'user', p_user_message),
        (p_user_id, 'assistant', p_ai_reply);

    -- Mark as db_synced securely inside the same transaction
    UPDATE whatsapp_inbox 
    SET db_synced = true, updated_at = NOW() 
    WHERE id = p_task_id AND worker_id = p_worker_id;

    RETURN TRUE;
END;
$$;

-- Protect RPC
REVOKE EXECUTE ON FUNCTION commit_financial_transactions(UUID, UUID, UUID, JSONB, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION commit_financial_transactions(UUID, UUID, UUID, JSONB, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION commit_financial_transactions(UUID, UUID, UUID, JSONB, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION commit_financial_transactions(UUID, UUID, UUID, JSONB, TEXT, TEXT) TO service_role;


CREATE OR REPLACE FUNCTION public.trigger_whatsapp_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Needs to read from vault
SET search_path = ''
AS $$
DECLARE
    v_secret TEXT;
    v_worker_url TEXT;
BEGIN
    -- Read URL and Secret from Vault securely
    SELECT decrypted_secret INTO v_secret 
    FROM vault.decrypted_secrets 
    WHERE name = 'WORKER_SECRET';
    
    SELECT decrypted_secret INTO v_worker_url 
    FROM vault.decrypted_secrets 
    WHERE name = 'nextjs_worker_url';

    IF v_secret IS NULL OR v_worker_url IS NULL THEN
        RAISE WARNING 'Worker secrets not configured in vault.';
        RETURN;
    END IF;

    -- Call worker asynchronously (pg_net)
    PERFORM net.http_post(
        url := v_worker_url,
        headers := pg_catalog.jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_secret
        ),
        body := '{}'::pg_catalog.jsonb
    );
END;
$$;

-- Strict protection for the trigger function
REVOKE EXECUTE ON FUNCTION public.trigger_whatsapp_worker() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_whatsapp_worker() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trigger_whatsapp_worker() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_whatsapp_worker() TO service_role;


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
