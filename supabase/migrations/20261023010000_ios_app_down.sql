-- Desfaz a migration do app iOS. Os tokens de notificacao gravados e os vinculos com a Apple SAO APAGADOS
-- (quem assina pela App Store perde o vinculo no Jakash; a assinatura em si continua na Apple).
DROP TABLE IF EXISTS public.native_push_tokens;

DROP INDEX IF EXISTS public.profiles_apple_original_transaction_id_key;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_billing_provider_check;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS apple_original_transaction_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS billing_provider;
