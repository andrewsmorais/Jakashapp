-- Remove do banco tudo que servia ao assistente do WhatsApp (decisão do fundador em 23/10/2026:
-- a Meta cobra por resposta e o plano de R$ 19,90 não comporta).
--
-- ATENÇÃO: ESTA MIGRATION APAGA DADOS PARA SEMPRE e NÃO FOI APLICADA. Só rode depois da aprovação do fundador
-- e DEPOIS de publicar o código novo (branch remove-whatsapp-agent). Se rodar antes, o código antigo ainda grava
-- profiles.notify_whatsapp, whatsapp_inbox e admin_costs.whatsapp e vai dar erro.
-- Apagados: tabelas whatsapp_inbox (mensagens, números e respostas da IA) e whatsapp_link_codes,
-- profiles.whatsapp_number e profiles.notify_whatsapp, transactions.source_wamid e source_index (o lançamento fica,
-- só some o vínculo com a mensagem de origem; transactions.origin continua 'whatsapp' nas linhas antigas) e os
-- registros de lembrete por WhatsApp em notification_log.
-- Preservado: o que já foi gravado em transactions e chat_history; admin_costs.whatsapp é somado em
-- admin_costs.other (o lucro líquido histórico não muda) e zerado; a coluna fica, sem uso (default 0).
-- O valor 'whatsapp' do enum transaction_origin não pode ser removido pelo Postgres e fica sem uso.
--
-- FORA DO BANCO (o fundador faz): remover do Supabase Vault os segredos WORKER_SECRET e nextjs_worker_url
-- (Dashboard > Project Settings > Vault). Ver docs/REMOVER-WHATSAPP.md.
-- Tudo com IF EXISTS: pode rodar mais de uma vez.

-- 1) Agendamentos do pg_cron ligados ao WhatsApp (whatsapp_queue_sweeper, whatsapp_inbox_purge ou outro).
DO $$
DECLARE r RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        FOR r IN EXECUTE $q$SELECT jobid FROM cron.job WHERE jobname ILIKE '%whatsapp%' OR command ILIKE '%whatsapp%'$q$ LOOP
            PERFORM cron.unschedule(r.jobid);
        END LOOP;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Não foi possível desagendar os jobs do pg_cron (%). Remova à mão os jobs com "whatsapp" no nome.', SQLERRM;
END $$;

-- 2) Gatilhos da fila (se existirem) e a tabela da fila.
DO $$
DECLARE t RECORD;
BEGIN
    IF to_regclass('public.whatsapp_inbox') IS NOT NULL THEN
        FOR t IN SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.whatsapp_inbox'::regclass AND NOT tgisinternal LOOP
            EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.whatsapp_inbox', t.tgname);
        END LOOP;
    END IF;
END $$;

-- 3) Funções do assistente.
DROP FUNCTION IF EXISTS public.trigger_whatsapp_worker();
DROP FUNCTION IF EXISTS public.acquire_whatsapp_task(UUID, INT);
DROP FUNCTION IF EXISTS public.link_whatsapp_number(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.purge_whatsapp_inbox_payloads(INT);
-- Só o worker usava esta (nada no app ou em outra migration chama commit_financial_transactions).
DROP FUNCTION IF EXISTS public.commit_financial_transactions(UUID, UUID, UUID, JSONB, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.commit_financial_transactions(UUID, UUID, UUID, JSONB);

-- 4) Tabelas.
DROP TABLE IF EXISTS public.whatsapp_inbox;
DROP TABLE IF EXISTS public.whatsapp_link_codes;
DROP TYPE IF EXISTS public.queue_status;

-- 5) Lançamentos: some o vínculo com a mensagem de origem (os lançamentos ficam).
DROP INDEX IF EXISTS public.unique_whatsapp_source;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS chk_whatsapp_source;
ALTER TABLE public.transactions
    DROP COLUMN IF EXISTS source_wamid,
    DROP COLUMN IF EXISTS source_index;

-- 6) Perfil: novo usuário sem copiar o número do cadastro; depois somem as colunas
--    (o índice único e os GRANTs por coluna caem junto com elas).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'full_name', 'Usuário Jakash')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP INDEX IF EXISTS public.profiles_whatsapp_number_key;
ALTER TABLE public.profiles
    DROP COLUMN IF EXISTS whatsapp_number,
    DROP COLUMN IF EXISTS notify_whatsapp;

-- 7) Registro de lembretes: só push e e-mail.
DELETE FROM public.notification_log WHERE channel = 'whatsapp';
ALTER TABLE public.notification_log DROP CONSTRAINT IF EXISTS notification_log_channel_check;
ALTER TABLE public.notification_log
    ADD CONSTRAINT notification_log_channel_check CHECK (channel IN ('push', 'email'));

-- 8) Painel do dono: o custo de WhatsApp lançado à mão vira "outros" (o total não muda) e a coluna fica zerada.
--    admin_period() lê as colunas com to_jsonb(c), então continua funcionando sem mudar a função.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'admin_costs' AND column_name = 'whatsapp') THEN
        UPDATE public.admin_costs SET other = other + whatsapp, whatsapp = 0 WHERE whatsapp <> 0;
    END IF;
END $$;
