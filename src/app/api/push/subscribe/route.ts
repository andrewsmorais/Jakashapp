import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isValidPushEndpoint } from '@/lib/push';

// Inscrições de push (um registro por navegador/aparelho). O endpoint é único no mundo: se o mesmo navegador
// passar a outra conta, a inscrição muda de dono (por isso a gravação é feita com a service role).

const MAX_PER_USER = 10;

const subscribeSchema = z.object({
  endpoint: z.string().max(2048),
  keys: z.object({ p256dh: z.string().min(10).max(256), auth: z.string().min(8).max(128) }),
});
const removeSchema = z.object({ endpoint: z.string().max(2048) });

async function currentUser() {
  const { data: { user } } = await createClient().auth.getUser();
  return user;
}

export async function POST(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 });

    const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !isValidPushEndpoint(parsed.data.endpoint)) {
      return NextResponse.json({ error: 'Inscrição inválida' }, { status: 400 });
    }
    const { endpoint, keys } = parsed.data;
    const admin = createAdminClient();

    const { error } = await admin.from('push_subscriptions').upsert(
      { user_id: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: (request.headers.get('user-agent') ?? '').slice(0, 200) },
      { onConflict: 'endpoint' },
    );
    if (error) {
      console.error('[push] subscribe', error.message);
      return NextResponse.json({ error: 'Não foi possível ativar agora.' }, { status: 500 });
    }

    // Mantém só os aparelhos mais recentes.
    const { data: all } = await admin.from('push_subscriptions').select('id').eq('user_id', user.id).order('created_at', { ascending: false });
    const extra = (all ?? []).slice(MAX_PER_USER).map((r) => r.id);
    if (extra.length) await admin.from('push_subscriptions').delete().in('id', extra);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[push] erro', (error as Error).message);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}

// Remove a inscrição deste aparelho e informa quantas sobraram (zero = pode desligar o canal no perfil).
export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 });

  const parsed = removeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });

  const admin = createAdminClient();
  await admin.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', parsed.data.endpoint);
  const [{ count }, { count: native }] = await Promise.all([
    admin.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    admin.from('native_push_tokens').select('id', { count: 'exact', head: true }).eq('user_id', user.id), // app iOS (tabela pode não existir ainda: conta 0)
  ]);
  return NextResponse.json({ ok: true, remaining: (count ?? 0) + (native ?? 0) });
}
