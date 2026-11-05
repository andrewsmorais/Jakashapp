-- Guarda a assinatura do Asaas para permitir cancelar pelo app.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS asaas_subscription_id TEXT;
