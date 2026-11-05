-- Rollback Migration: WhatsApp Reliable Queue
-- Reverts the changes made by 20261008000000_whatsapp_queue.sql safely.

-- 1. Drop partial index and columns from transactions
DROP INDEX IF EXISTS unique_whatsapp_source;

-- Note: We only drop columns if we are sure we don't need the data.
-- Since this is a safe rollback, dropping the columns will destroy WhatsApp financial origin tracking.
ALTER TABLE transactions 
DROP COLUMN IF EXISTS source_wamid,
DROP COLUMN IF EXISTS source_index;

-- 2. Drop RPCs
DROP FUNCTION IF EXISTS commit_financial_transactions(UUID, UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS acquire_whatsapp_task(UUID, INT);

-- 3. Drop table and type
-- Only drop the table if it's safe to lose the queue history.
DROP TABLE IF EXISTS whatsapp_inbox;
DROP TYPE IF EXISTS queue_status;
