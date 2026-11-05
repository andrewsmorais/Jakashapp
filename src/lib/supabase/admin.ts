import { createClient } from '@supabase/supabase-js';

// Cliente com service_role. Usar SOMENTE em rotas de servidor (webhooks, checkout, worker).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias no servidor.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
