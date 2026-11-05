import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CLAIM_WINDOW_DAYS, REFERRAL_CODE_RE } from '@/lib/referrals';

// Registra que o usuário logado chegou por um código de indicação. Vale uma vez por conta, só para conta recém-criada e nunca para o próprio código.
// A resposta não diz o motivo de uma recusa (não revela quais códigos existem).
const schema = z.object({ code: z.string().max(20) });

export async function POST(request: Request) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  const code = parsed.success ? parsed.data.code.trim().toUpperCase() : '';
  if (!REFERRAL_CODE_RE.test(code)) return NextResponse.json({ ok: false });

  const ageDays = (Date.now() - new Date(user.created_at).getTime()) / 86400000;
  if (!(ageDays <= CLAIM_WINDOW_DAYS)) return NextResponse.json({ ok: false });

  const admin = createAdminClient();
  const { data: referrer } = await admin.from('profiles').select('id').eq('referral_code', code).maybeSingle();
  if (!referrer || referrer.id === user.id) return NextResponse.json({ ok: false });

  const { error } = await admin.from('referrals').insert({ referrer_id: referrer.id, referred_id: user.id });
  return NextResponse.json({ ok: !error }); // erro 23505 = esta conta já tinha uma indicação
}
