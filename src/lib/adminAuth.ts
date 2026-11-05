import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Garante que quem chama é o dono (profiles.is_admin = true). is_admin não é editável pelo usuário
// (o UPDATE em profiles é liberado só por coluna) e só é lido aqui, no servidor.
export async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: 'Faça login' }, { status: 401 }) };

  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    // 404 em vez de 403: não revela que a rota existe.
    return { ok: false, response: NextResponse.json({ error: 'Não encontrado' }, { status: 404 }) };
  }
  return { ok: true, userId: user.id };
}
