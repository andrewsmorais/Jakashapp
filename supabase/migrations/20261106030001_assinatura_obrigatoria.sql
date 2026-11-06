-- Assinatura obrigatória (parte 2). Decisão de 06/11/2026:
--  - Ninguém usa o app sem assinatura (Mensal ou Anual, 7 dias grátis pela Apple), exceto o dono (is_admin).
--  - Conta nova nasce SEM plano ('none'); o teste grátis de 7 dias passa a ser o da Apple, ao assinar.
--  - has_app_access(): a regra única de quem entra, usada pelo middleware a cada página.

ALTER TABLE public.profiles ALTER COLUMN subscription_status SET DEFAULT 'none';
ALTER TABLE public.profiles ALTER COLUMN subscription_expires_at DROP DEFAULT;
ALTER TABLE public.profiles ALTER COLUMN subscription_plan DROP DEFAULT;

-- Quem estava no teste grátis automático (sem nunca ter assinado) passa a precisar escolher um plano.
UPDATE public.profiles
   SET subscription_status = 'none', subscription_expires_at = NULL
 WHERE subscription_status = 'trial' AND billing_provider IS NULL AND is_admin IS NOT TRUE;

-- Assinatura valendo: teste dentro do prazo; ativa ou com cobrança pendente até 3 dias depois do fim do período
-- (folga para a renovação da Apple chegar). Mesma regra de src/lib/entitlements.ts.
CREATE OR REPLACE FUNCTION public.subscription_is_live(p_status text, p_expires timestamptz)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_status = 'trial' THEN p_expires IS NOT NULL AND p_expires > now()
    WHEN p_status IN ('active', 'past_due') THEN p_expires IS NULL OR p_expires > now() - interval '3 days'
    ELSE false
  END;
$$;

-- Pode usar o app: é o dono, tem assinatura valendo, ou é membro aceito de uma casa cujo dono tem.
CREATE OR REPLACE FUNCTION public.has_app_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = auth.uid()
       AND (p.is_admin IS TRUE OR public.subscription_is_live(p.subscription_status::text, p.subscription_expires_at))
  ) OR EXISTS (
    SELECT 1 FROM public.partnerships s JOIN public.profiles o ON o.id = s.owner_id
     WHERE s.partner_id = auth.uid() AND s.status = 'accepted'
       AND public.subscription_is_live(o.subscription_status::text, o.subscription_expires_at)
  );
$$;
REVOKE ALL ON FUNCTION public.has_app_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_app_access() TO authenticated;
