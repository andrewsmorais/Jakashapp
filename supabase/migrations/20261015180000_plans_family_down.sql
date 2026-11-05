-- Reverte a gestao compartilhada para o modelo de 2 pessoas.
-- ATENCAO: so funciona se nenhum dono tiver mais de uma linha em partnerships (apague os membros extras antes).
-- O valor 'familia' do enum nao pode ser removido pelo Postgres; fica sem uso.

DROP INDEX IF EXISTS public.partnerships_one_pending_per_owner;
CREATE UNIQUE INDEX IF NOT EXISTS partnerships_owner_key ON public.partnerships (owner_id);

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
