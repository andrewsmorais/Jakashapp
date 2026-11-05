import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { aiDailyLimit } from '@/lib/plans';
import { getEntitlement, isEntitled } from '@/lib/entitlements';

// Parte comum das rotas de voz (/api/voice/transcribe e /api/voice/parse): sessão, assinatura ativa e o limite diário de IA
// (mesmo contador do Chat IA e da leitura de PDF/foto: funções ai_usage_hit / ai_usage_refund, sem migração nova).

export function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export type VoiceCtx = { userId: string; admin: SupabaseClient; today: string; limit: number };

/** Confere login, chave da OpenAI e assinatura ativa. Devolve o contexto ou a resposta de erro pronta. */
export async function authorizeVoice(): Promise<VoiceCtx | NextResponse> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Faça login para usar a voz.' }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'A voz por IA ainda não está ativada neste ambiente.' }, { status: 503 });

  const admin = createAdminClient();
  const ent = await getEntitlement(admin, user.id);
  if (!ent) return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
  if (!isEntitled(ent)) return NextResponse.json({ error: 'Sua assinatura não está ativa. Renove em Configurações › Planos.' }, { status: 402 });
  return { userId: user.id, admin, today: todayInSaoPaulo(), limit: aiDailyLimit(ent.plan) };
}

/** Reserva 1 uso do limite diário antes de gastar com a IA. Devolve null se deu certo, ou a resposta de erro. */
export async function reserveAiUse(ctx: VoiceCtx, label: string): Promise<NextResponse | null> {
  const { data: used, error } = await ctx.admin.rpc('ai_usage_hit', { p_user: ctx.userId, p_day: ctx.today, p_limit: ctx.limit });
  if (error) {
    console.error(`[${label}] ai_usage_hit`, error.message);
    return NextResponse.json({ error: 'Não foi possível verificar seu limite agora.' }, { status: 500 });
  }
  if (used === -1) {
    return NextResponse.json({ error: `Você usou o limite diário de IA (${ctx.limit}). Amanhã tem mais, ou digite o lançamento.`, remaining: 0 }, { status: 429 });
  }
  return null;
}

export async function refundAiUse(ctx: VoiceCtx): Promise<void> {
  await ctx.admin.rpc('ai_usage_refund', { p_user: ctx.userId, p_day: ctx.today });
}
