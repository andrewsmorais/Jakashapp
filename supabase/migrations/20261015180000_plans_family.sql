-- Plano Familia (R$ 29,90, ate 3 pessoas) + gestao compartilhada com mais de 2 membros.
-- Ids dos planos: 'cpf' (Essencial, 19,90), 'familia' (29,90), 'mei' (39,90). Quem ja e 'cpf' nao muda.

-- 1) Novo valor do enum de plano. (Nao use 'familia' nesta mesma transacao.)
ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'familia';

-- 2) Parcerias: um dono pode ter varios membros (topologia em estrela: dono + ate 2 membros, o limite fica na API).
--    Antes: um dono = uma linha. Agora: um convite pendente por dono; varias linhas aceitas.
DROP INDEX IF EXISTS public.partnerships_owner_key;
CREATE UNIQUE INDEX IF NOT EXISTS partnerships_one_pending_per_owner
    ON public.partnerships (owner_id) WHERE status = 'pending';
-- partnerships_partner_key (um usuario so pode ser membro de uma casa) continua valendo.

-- 3) "Casa" do usuario: ele + o dono + todos os membros aceitos.
--    SECURITY DEFINER porque, com RLS, um membro nao enxergaria a linha dos outros membros.
--    Devolve apenas ids da propria casa de auth.uid(); search_path fixo.
CREATE OR REPLACE FUNCTION public.household_user_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    WITH me AS (SELECT auth.uid() AS id),
    root AS (
        SELECT COALESCE(
            (SELECT p.owner_id FROM public.partnerships p, me
              WHERE p.partner_id = me.id AND p.status = 'accepted' LIMIT 1),
            (SELECT id FROM me)
        ) AS id
    )
    SELECT id FROM me
    UNION
    SELECT id FROM root
    UNION
    SELECT p.partner_id FROM public.partnerships p, root
     WHERE p.owner_id = root.id AND p.status = 'accepted' AND p.partner_id IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.household_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.household_user_ids() TO authenticated;
