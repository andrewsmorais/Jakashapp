-- Rollback da migracao de Fase 0 (valores 'cpf' e 'mei' do enum permanecem).
DROP INDEX IF EXISTS public.idx_transactions_user_date;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS chk_transactions_amount_positive;
DROP POLICY IF EXISTS "Qualquer um entra na waitlist" ON public.waitlist;
ALTER TABLE public.waitlist DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS public.profiles_whatsapp_number_key;
GRANT UPDATE ON public.profiles TO authenticated;
