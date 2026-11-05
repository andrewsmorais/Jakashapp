-- Onboarding, contas bancarias, preferencias e lembretes.

-- 1. Preferencias no perfil (o usuario so pode editar estas colunas + full_name)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS usage_type TEXT NOT NULL DEFAULT 'pessoal';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'pt';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BRL';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notify_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notify_whatsapp BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notify_email BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notify_when TEXT NOT NULL DEFAULT 'on_due';

ALTER TABLE public.profiles ADD CONSTRAINT profiles_usage_type_check
    CHECK (usage_type IN ('pessoal','casal','empresarial','ambos'));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_notify_when_check
    CHECK (notify_when IN ('on_due','1_day','3_days','7_days'));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_language_check
    CHECK (language IN ('pt','en','es'));

GRANT UPDATE (usage_type, onboarding_completed, language, currency, notify_enabled, notify_whatsapp, notify_email, notify_when)
    ON public.profiles TO authenticated;

-- 2. Contas bancarias
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'corrente' CHECK (kind IN ('corrente','poupanca','dinheiro','investimento')),
    initial_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON public.accounts (user_id);
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso as proprias contas bancarias" ON public.accounts FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. Lancamento pode ser ligado a uma conta
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_account ON public.transactions (account_id);

-- 4. Saldo por conta: saldo inicial + lancamentos. Lancamentos sem conta (ex.: WhatsApp) entram na conta mais antiga.
CREATE OR REPLACE FUNCTION public.account_balances()
RETURNS TABLE (id UUID, name TEXT, kind TEXT, balance NUMERIC)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
    WITH acc AS (
        SELECT a.id, a.name, a.kind, a.initial_balance, a.created_at,
               row_number() OVER (ORDER BY a.created_at, a.id) AS rn
          FROM public.accounts a
         WHERE a.user_id = auth.uid() AND NOT a.archived
    ),
    net AS (
        SELECT account_id, SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) AS n
          FROM public.transactions WHERE user_id = auth.uid() GROUP BY account_id
    ),
    unassigned AS (SELECT COALESCE(SUM(n), 0) AS n FROM net WHERE account_id IS NULL)
    SELECT acc.id, acc.name, acc.kind,
           acc.initial_balance
             + COALESCE((SELECT n FROM net WHERE net.account_id = acc.id), 0)
             + CASE WHEN acc.rn = 1 THEN (SELECT n FROM unassigned) ELSE 0 END
      FROM acc ORDER BY acc.created_at, acc.id;
$$;
REVOKE EXECUTE ON FUNCTION public.account_balances() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_balances() TO authenticated;
