import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { LINK_DEFAULT_DAYS, LINK_MAX_ACTIVE, hashToken, newToken } from '@/lib/accountant';

// Cria e revoga links de leitura para o contador. O token completo só é devolvido na criação.

const createSchema = z.object({
  label: z.string().trim().max(60).optional(),
  days: z.number().int().min(1).max(90).optional(),
});

async function currentUser() {
  const { data: { user } } = await createClient().auth.getUser();
  return user;
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  const admin = createAdminClient();
  const { count } = await admin.from('accountant_links').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).is('revoked_at', null).gt('expires_at', new Date().toISOString());
  if ((count ?? 0) >= LINK_MAX_ACTIVE) {
    return NextResponse.json({ error: `Você já tem ${LINK_MAX_ACTIVE} links ativos. Revogue algum para criar outro.` }, { status: 409 });
  }

  const token = newToken();
  const expiresAt = new Date(Date.now() + (parsed.data.days ?? LINK_DEFAULT_DAYS) * 86400000).toISOString();
  const { data, error } = await admin.from('accountant_links')
    .insert({ user_id: user.id, token_hash: hashToken(token), label: parsed.data.label || null, expires_at: expiresAt })
    .select('id').single();
  if (error || !data) return NextResponse.json({ error: 'Não foi possível criar o link' }, { status: 500 });

  const site = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '');
  return NextResponse.json({ id: data.id, url: `${site}/contador/${token}`, expiresAt }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Link inválido' }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from('accountant_links').update({ revoked_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id).is('revoked_at', null);
  if (error) return NextResponse.json({ error: 'Não foi possível revogar' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
