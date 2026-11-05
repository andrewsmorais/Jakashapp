import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { emailConfigured, reminderEmail, sendEmailResult } from '@/lib/email';

// Botão "Enviar teste" de e-mail em Configurações › Notificações. Só envia para o e-mail do próprio usuário.
export const dynamic = 'force-dynamic';

const lastSent = new Map<string, number>(); // proteção simples contra cliques repetidos (por instância)
const COOLDOWN_MS = 30_000;
const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.jakash.app').replace(/\/$/, '');
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { channel?: string };
  const channel = body.channel;
  if (channel !== 'email') return fail('Canal inválido.', 400);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Faça login para testar.', 401);

  const key = `${user.id}:${channel}`;
  const now = Date.now();
  if (now - (lastSent.get(key) ?? 0) < COOLDOWN_MS) return fail('Aguarde alguns segundos para testar de novo.', 429);
  lastSent.set(key, now);

  const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  const name = (prof?.full_name as string | null)?.split(' ')[0] || 'tudo bem';

  if (!emailConfigured()) { lastSent.delete(key); return fail('O envio de e-mail ainda não foi configurado neste ambiente.', 503); }
  if (!user.email) { lastSent.delete(key); return fail('Sua conta não tem e-mail cadastrado.', 400); }
  const { text, html } = reminderEmail({
    name, title: 'Teste de lembrete do Jakash',
    lines: ['Este é um e-mail de teste.', 'Se ele chegou, os lembretes de vencimento por e-mail estão funcionando.'],
    totalToPay: 0, totalLabel: '', siteUrl: siteUrl(),
  });
  const r = await sendEmailResult(user.email, 'Jakash · teste de e-mail', text, html);
  if (r.ok) return NextResponse.json({ ok: true });
  if (r.status === 401) return fail('A chave do serviço de e-mail está inválida. Revise o RESEND_API_KEY.', 502);
  if (r.status === 403 || r.status === 422) return fail('O serviço de e-mail recusou o envio. Confira se o domínio do remetente está verificado no Resend.', 502);
  if (r.status === 429) return fail('O limite de envios do serviço de e-mail foi atingido. Tente mais tarde.', 502);
  return fail('Não foi possível enviar o e-mail de teste agora.', 502);
}
