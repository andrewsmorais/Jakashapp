import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apnsEnvironment, isValidApnsToken } from '@/lib/apns';

// Token de notificação do app iOS (APNs). Um registro por aparelho; o token é único no mundo, então se o mesmo
// aparelho entrar em outra conta o registro muda de dono (por isso a gravação usa a service role).
// A tabela native_push_tokens não tem policy: só este servidor lê e grava.

export const dynamic = 'force-dynamic';

const MAX_PER_USER = 10;

// Hexadecimal de 64 a 200 caracteres; guardado em minúsculas.
const tokenSchema = z.object({ token: z.string().regex(/^[0-9a-fA-F]{64,200}$/).transform((t) => t.toLowerCase()) });

async function currentUser() {
  const { data: { user } } = await createClient().auth.getUser();
  return user;
}

export async function POST(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 });

    const parsed = tokenSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !isValidApnsToken(parsed.data.token)) return NextResponse.json({ error: 'Token inválido' }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from('native_push_tokens').upsert(
      { user_id: user.id, token: parsed.data.token, platform: 'ios', environment: apnsEnvironment(), last_seen_at: new Date().toISOString() },
      { onConflict: 'token' },
    );
    if (error) {
      console.error('[push/native] gravar token', error.message);
      return NextResponse.json({ error: 'Não foi possível ativar agora.' }, { status: 500 });
    }

    // Mantém só os aparelhos mais recentes.
    const { data: all } = await admin.from('native_push_tokens').select('id').eq('user_id', user.id).order('last_seen_at', { ascending: false });
    const extra = (all ?? []).slice(MAX_PER_USER).map((r) => r.id);
    if (extra.length) await admin.from('native_push_tokens').delete().in('id', extra);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[push/native] erro', (error as Error).message);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}

// Remove o token deste aparelho e informa quantos avisos (navegadores + aparelhos) ainda restam para a conta.
export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 });

  const parsed = tokenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });

  const admin = createAdminClient();
  await admin.from('native_push_tokens').delete().eq('user_id', user.id).eq('token', parsed.data.token);
  const [{ count: web }, { count: native }] = await Promise.all([
    admin.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    admin.from('native_push_tokens').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ]);
  return NextResponse.json({ ok: true, remaining: (web ?? 0) + (native ?? 0) });
}
