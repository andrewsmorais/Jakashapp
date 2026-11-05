-- Gestao compartilhada (casal): parceria entre dois usuarios, ativada por codigo de convite.
-- O convite e o aceite passam por rotas do servidor (/api/partnership); o usuario so le e encerra a propria parceria.

CREATE TABLE IF NOT EXISTS public.partnerships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    partner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
    invite_code TEXT UNIQUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at TIMESTAMPTZ,
    CONSTRAINT partnerships_distinct CHECK (partner_id IS NULL OR partner_id <> owner_id),
    CONSTRAINT partnerships_accepted_has_partner CHECK (status <> 'accepted' OR partner_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS partnerships_owner_key ON public.partnerships (owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS partnerships_partner_key ON public.partnerships (partner_id) WHERE partner_id IS NOT NULL;

ALTER TABLE public.partnerships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver a propria parceria" ON public.partnerships FOR SELECT TO authenticated
    USING (owner_id = auth.uid() OR partner_id = auth.uid());
CREATE POLICY "Encerrar a propria parceria" ON public.partnerships FOR DELETE TO authenticated
    USING (owner_id = auth.uid() OR partner_id = auth.uid());

-- Ids que o usuario logado enxerga como "da casa": ele mesmo + o parceiro (so com parceria aceita).
-- Usada nas politicas RLS e nas funcoes de saldo.
CREATE OR REPLACE FUNCTION public.household_user_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
    SELECT auth.uid()
    UNION
    SELECT CASE WHEN p.owner_id = auth.uid() THEN p.partner_id ELSE p.owner_id END
      FROM public.partnerships p
     WHERE p.status = 'accepted' AND (p.owner_id = auth.uid() OR p.partner_id = auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.household_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.household_user_ids() TO authenticated;
