-- Importacao de extrato, pacote MEI (PF/PJ, Pix, contador), indicacoes e insight mensal.

-- 1. Lancamentos: chave anti-duplicidade da importacao e marca "da empresa" (MEI)
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS import_key TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_business BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_import_key ON public.transactions (user_id, import_key);
CREATE INDEX IF NOT EXISTS idx_transactions_business ON public.transactions (user_id, date) WHERE is_business;

-- Conta/cartao da empresa: pre-seleciona "empresa" ao lancar ou importar
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS is_business BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.credit_cards ADD COLUMN IF NOT EXISTS is_business BOOLEAN NOT NULL DEFAULT false;

-- 2. Perfil: dados do MEI, chave Pix e codigo de indicacao
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS business_cnpj TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mei_activity TEXT NOT NULL DEFAULT 'servicos';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mei_opened_on DATE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mei_annual_limit NUMERIC(12,2) NOT NULL DEFAULT 81000;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pix_key TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pix_key_type TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pix_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pix_city TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code TEXT;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_mei_activity_check CHECK (mei_activity IN ('servicos','comercio','industria'));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_mei_limit_check CHECK (mei_annual_limit > 0 AND mei_annual_limit <= 10000000);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pix_type_check CHECK (pix_key_type IS NULL OR pix_key_type IN ('cpf','cnpj','email','telefone','aleatoria'));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_business_text_check CHECK (
    char_length(COALESCE(business_name, '')) <= 120 AND char_length(COALESCE(business_cnpj, '')) <= 20
    AND char_length(COALESCE(pix_key, '')) <= 100 AND char_length(COALESCE(pix_name, '')) <= 25 AND char_length(COALESCE(pix_city, '')) <= 15);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key ON public.profiles (referral_code) WHERE referral_code IS NOT NULL;

-- O usuario edita os dados do MEI e do Pix; o codigo de indicacao e gerado pelo servidor.
GRANT UPDATE (business_name, business_cnpj, mei_activity, mei_opened_on, mei_annual_limit, pix_key, pix_key_type, pix_name, pix_city)
    ON public.profiles TO authenticated;

-- 3. Receita e despesa da empresa por mes (so os lancamentos do proprio usuario)
CREATE OR REPLACE FUNCTION public.mei_monthly(p_year INT)
RETURNS TABLE (month INT, revenue NUMERIC, expenses NUMERIC)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
    SELECT EXTRACT(month FROM t.date)::int,
           COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'), 0),
           COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense'), 0)
      FROM public.transactions t
     WHERE t.is_business AND t.user_id = auth.uid()
       AND t.date >= make_date(p_year, 1, 1) AND t.date < make_date(p_year + 1, 1, 1)
     GROUP BY 1
     ORDER BY 1;
$$;
REVOKE EXECUTE ON FUNCTION public.mei_monthly(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mei_monthly(INT) TO authenticated;

-- 4. Links de leitura para o contador (a pagina publica le pela service role; so o hash do token fica guardado)
CREATE TABLE IF NOT EXISTS public.accountant_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    label TEXT CHECK (label IS NULL OR char_length(label) <= 60),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_accountant_links_user ON public.accountant_links (user_id);
ALTER TABLE public.accountant_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver os proprios links do contador" ON public.accountant_links FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- 5. Indicacoes (escritas pela service role; quem indicou ve as proprias)
CREATE TABLE IF NOT EXISTS public.referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referred_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'signed_up' CHECK (status IN ('signed_up','subscribed','rewarded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    subscribed_at TIMESTAMPTZ,
    rewarded_at TIMESTAMPTZ,
    CHECK (referrer_id <> referred_id)
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals (referrer_id);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver as proprias indicacoes" ON public.referrals FOR SELECT TO authenticated
    USING (auth.uid() = referrer_id);

-- 6. Insight mensal (gerado pelo servidor; o usuario le o proprio)
CREATE TABLE IF NOT EXISTS public.monthly_insights (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    month DATE NOT NULL,
    items JSONB NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('ai','rules')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, month)
);
ALTER TABLE public.monthly_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver os proprios insights" ON public.monthly_insights FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
