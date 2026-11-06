import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { aiDailyLimit } from '@/lib/plans';
import { getEntitlement, isEntitled } from '@/lib/entitlements';
import { SUPPORT_SYSTEM_PROMPT } from '@/lib/supportPrompt';

export const maxDuration = 30;

// O chat de ajuda usa a API da Claude (Anthropic), com chave própria: SUPPORT_ANTHROPIC_API_KEY. Modelo: SUPPORT_CHAT_MODEL (padrão claude-haiku-5-5).
const apiKey = () => process.env.SUPPORT_ANTHROPIC_API_KEY || '';

type Turn = { role: 'user' | 'assistant'; content: string };
// A API exige começar pelo usuário e alternar as vozes: tira o que vier fora de ordem.
function alternate(history: Turn[], message: string): Turn[] {
  const out: Turn[] = [];
  for (const t of [...history, { role: 'user' as const, content: message }]) {
    const last = out[out.length - 1];
    if (!out.length && t.role !== 'user') continue;
    if (last && last.role === t.role) last.content += `\n${t.content}`; else out.push({ ...t });
  }
  return out;
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

const bodySchema = z.object({
  message: z.string().trim().min(1).max(500),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1200) })).max(8).default([]),
});

export async function GET() {
  return NextResponse.json({ enabled: Boolean(apiKey()) });
}

// O chat de suporte só explica o app (não lê dados da pessoa). Mesmo assim exige login e assinatura, e conta no limite diário de IA.
export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Faça login para usar o chat.' }, { status: 401 });
    if (!apiKey()) return NextResponse.json({ error: 'O chat de ajuda ainda não está ativado. Fale com a gente por WhatsApp ou e-mail.' }, { status: 503 });

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Mensagem inválida (até 500 caracteres).' }, { status: 400 });
    const { message, history } = parsed.data;

    const admin = createAdminClient();
    const ent = await getEntitlement(admin, user.id);
    if (!ent) return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
    if (!isEntitled(ent)) return NextResponse.json({ error: 'Sua assinatura não está ativa.' }, { status: 402 });

    const day = today();
    const limit = aiDailyLimit(ent.plan);
    const { data: used, error: usageError } = await admin.rpc('ai_usage_hit', { p_user: user.id, p_day: day, p_limit: limit });
    if (usageError) return NextResponse.json({ error: 'Não foi possível verificar seu limite agora.' }, { status: 500 });
    if (used === -1) return NextResponse.json({ error: `Você usou as ${limit} mensagens de IA de hoje. Amanhã tem mais!` }, { status: 429 });

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey(), 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: process.env.SUPPORT_CHAT_MODEL || 'claude-haiku-5-5',
          max_tokens: 600,
          system: SUPPORT_SYSTEM_PROMPT,
          messages: alternate(history, message),
        }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}`);
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      const reply = data.content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim();
      if (!reply) throw new Error('resposta vazia');
      return NextResponse.json({ reply });
    } catch (err) {
      console.error('[suporte] falha ao chamar a IA', err);
      await admin.rpc('ai_usage_refund', { p_user: user.id, p_day: day });
      return NextResponse.json({ error: 'Não consegui responder agora. Tente de novo em instantes.' }, { status: 502 });
    }
  } catch (error) {
    console.error('[suporte] erro', error);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
