-- App iOS (Capacitor): assinatura pela App Store (Apple IAP) e notificacoes nativas (APNs). Aditiva: nada existente e alterado.
-- NAO aplicada automaticamente: revise e rode no SQL Editor do Supabase (so depois de aprovada pelo dono).

-- 1) Como a conta paga e qual assinatura da Apple pertence a ela.
--    Nao ha GRANT de UPDATE nestas colunas: o usuario nao as altera pelo cliente (so o servidor, com a service role).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS billing_provider TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS apple_original_transaction_id TEXT;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_billing_provider_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_billing_provider_check CHECK (billing_provider IS NULL OR billing_provider IN ('asaas', 'apple'));

-- Uma assinatura da Apple pertence a uma unica conta Jakash.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_apple_original_transaction_id_key
    ON public.profiles (apple_original_transaction_id)
    WHERE apple_original_transaction_id IS NOT NULL;

REVOKE UPDATE (billing_provider, apple_original_transaction_id) ON public.profiles FROM anon, authenticated;

-- 2) Tokens de notificacao do iPhone (APNs). Um registro por aparelho; o token e unico no mundo.
--    RLS ligada e SEM policies: so as rotas do servidor (service role) leem e gravam.
CREATE TABLE IF NOT EXISTS public.native_push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL DEFAULT 'ios' CHECK (platform = 'ios'),
    environment TEXT CHECK (environment IS NULL OR environment IN ('production', 'sandbox')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_native_push_tokens_user ON public.native_push_tokens (user_id);

ALTER TABLE public.native_push_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.native_push_tokens FROM anon, authenticated;
