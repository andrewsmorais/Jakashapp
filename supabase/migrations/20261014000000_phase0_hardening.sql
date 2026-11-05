-- Migration: Fase 0 - endurecimento de seguranca e preparo para os planos CPF / MEI
-- Revise antes de executar no SQL Editor do Supabase.

-- 1. Usuario NAO pode editar campos de cobranca nem o numero de WhatsApp pelo cliente.
--    (A policy de UPDATE por linha continua, mas so as colunas abaixo ficam liberadas.)
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;

-- 2. Um numero de WhatsApp pertence a um unico perfil (evita sequestro de numero).
--    Se houver duplicados hoje, resolva-os antes de rodar.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_whatsapp_number_key
    ON public.profiles (whatsapp_number)
    WHERE whatsapp_number IS NOT NULL;

-- 3. Waitlist: RLS ligado. Qualquer pessoa pode entrar, ninguem pode ler pelo cliente.
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Qualquer um entra na waitlist" ON public.waitlist;
CREATE POLICY "Qualquer um entra na waitlist"
    ON public.waitlist FOR INSERT TO anon, authenticated WITH CHECK (true);

-- 4. Valores sempre positivos (NOT VALID: nao reprova linhas antigas).
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS chk_transactions_amount_positive;
ALTER TABLE public.transactions
    ADD CONSTRAINT chk_transactions_amount_positive CHECK (amount > 0) NOT VALID;

-- 5. Indice para extrato e dashboard.
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
    ON public.transactions (user_id, date DESC);

-- 6. Planos novos. O checkout grava 'cpf' ou 'mei' em profiles.subscription_plan.
--    (Os valores antigos zap/piloto/cnpj continuam no enum; nao da para remover valor de enum com seguranca.)
ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'cpf';
ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'mei';

-- 7. Funcoes de gatilho nao devem ser chamaveis pela API, e precisam de search_path fixo.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.update_goal_current_amount() SET search_path = public;
