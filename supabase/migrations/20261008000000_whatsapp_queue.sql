-- Migration: WhatsApp Reliable Queue & Financial Idempotency
-- Do NOT execute directly. Needs authorization.

-- 1. Modify transactions table safely
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS source_wamid TEXT,
ADD COLUMN IF NOT EXISTS source_index INTEGER;

-- Ensure that if source_wamid is provided, source_index MUST be provided (prevents index bypass)
ALTER TABLE transactions 
DROP CONSTRAINT IF EXISTS chk_whatsapp_source;

ALTER TABLE transactions 
ADD CONSTRAINT chk_whatsapp_source CHECK (source_wamid IS NULL OR source_index IS NOT NULL);

-- Create partial unique index to prevent duplicate financial entries from the same message,
-- while completely ignoring old transactions where source_wamid IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS unique_whatsapp_source ON transactions (source_wamid, source_index) WHERE source_wamid IS NOT NULL;

-- 2. Create whatsapp_inbox table
DO $$ BEGIN
    CREATE TYPE queue_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS whatsapp_inbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wamid TEXT UNIQUE NOT NULL,
    phone_number TEXT NOT NULL,
    raw_payload JSONB NOT NULL,
    status queue_status NOT NULL DEFAULT 'pending',
    worker_id UUID,
    locked_until TIMESTAMPTZ,
    ai_response JSONB,
    db_synced BOOLEAN NOT NULL DEFAULT false,
    wa_replied BOOLEAN NOT NULL DEFAULT false,
    retry_count INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS and deny access to public/authenticated
ALTER TABLE whatsapp_inbox ENABLE ROW LEVEL SECURITY;
-- By not creating any policies, default deny is applied for public roles.
-- service_role automatically bypasses RLS.

-- Index for fast queue querying
CREATE INDEX IF NOT EXISTS idx_whatsapp_inbox_queue 
ON whatsapp_inbox(status, next_attempt_at, locked_until);

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

/*
================================================================================
5. TRIGGER AND QUEUE MECHANISM (pg_net & vault)
================================================================================
Creates the secure trigger to call the Next.js Worker.
*/

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

-- Note: The pg_cron schedule is NOT activated yet as requested.
-- To activate in the future:
-- SELECT cron.schedule('whatsapp_queue_sweeper', '* * * * *', 'SELECT public.trigger_whatsapp_worker()');

