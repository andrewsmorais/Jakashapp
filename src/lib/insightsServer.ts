// Geração e leitura do insight mensal (servidor, service role). No máximo uma chamada de IA por usuário por mês:
// o resultado fica em monthly_insights (chave usuário + mês) e nunca é gerado de novo.
import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { aiPrompt, buildInsightItems, computeMonthStats, parseAiTips, prevMonthOf, type CatMini, type InsightItem } from '@/lib/insights';

export const MIN_TX = 8; // com menos lançamentos no mês o resumo não diz nada
export const ELIGIBLE_STATUS = ['trial', 'active', 'past_due'];

export type StoredInsight = { month: string; items: InsightItem[]; source: 'ai' | 'rules' };

const pad = (n: number) => String(n).padStart(2, '0');

/** Mês analisado (AAAA-MM) para uma data "AAAA-MM-DD": o mês anterior. */
export const insightMonthFor = (today: string) => prevMonthOf(today.slice(0, 7));

export function planAllows(p: { subscription_status: string | null; subscription_expires_at: string | null } | null | undefined, now = Date.now()): boolean {
  if (!p || !ELIGIBLE_STATUS.includes(String(p.subscription_status))) return false;
  if (p.subscription_status === 'trial' && p.subscription_expires_at && new Date(p.subscription_expires_at).getTime() < now) return false;
  return true;
}

export async function getInsight(admin: SupabaseClient, userId: string, month: string): Promise<StoredInsight | null> {
  const { data } = await admin.from('monthly_insights').select('month,items,source').eq('user_id', userId).eq('month', `${month}-01`).maybeSingle();
  return data ? { month: String(data.month).slice(0, 7), items: data.items as InsightItem[], source: data.source as 'ai' | 'rules' } : null;
}

async function loadCategories(admin: SupabaseClient, ids: string[]): Promise<CatMini[]> {
  if (ids.length === 0) return [];
  const first = ((await admin.from('categories').select('id,name,parent_id').in('id', ids)).data ?? []) as CatMini[];
  const parents = Array.from(new Set(first.map((c) => c.parent_id).filter((x): x is string => Boolean(x) && !ids.includes(x as string))));
  const more = parents.length ? (((await admin.from('categories').select('id,name,parent_id').in('id', parents)).data ?? []) as CatMini[]) : [];
  return first.concat(more);
}

/** Calcula, escreve (IA com validação, ou regras) e guarda o insight do mês. Retorna null quando há poucos lançamentos. */
export async function generateInsight(admin: SupabaseClient, userId: string, month: string): Promise<StoredInsight | null> {
  const [y, m] = month.split('-').map(Number);
  const end = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  const { data } = await admin.from('transactions').select('amount,type,date,category_id').eq('user_id', userId)
    .gte('date', `${prevMonthOf(month)}-01`).lt('date', end).limit(10000);
  const txs = (data ?? []).map((t) => ({ amount: Number(t.amount), type: t.type as string, date: t.date as string, category_id: (t.category_id ?? null) as string | null }));
  if (txs.filter((t) => t.date.slice(0, 7) === month).length < MIN_TX) return null;

  const ids = Array.from(new Set(txs.map((t) => t.category_id).filter((x): x is string => Boolean(x))));
  const stats = computeMonthStats(txs, await loadCategories(admin, ids), month);
  let items = buildInsightItems(stats);
  let source: 'ai' | 'rules' = 'rules';

  if (process.env.OPENAI_API_KEY) {
    try {
      const p = aiPrompt(items);
      const completion = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat.completions.create({
        model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini', temperature: 0.3, max_tokens: 300, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: p.system }, { role: 'user', content: p.user }],
      });
      const tips = parseAiTips(completion.choices[0]?.message?.content ?? '', items.length);
      if (tips) { items = items.map((it, i) => ({ ...it, tip: tips[i] })); source = 'ai'; }
    } catch (e) {
      console.error('[insights] IA indisponível, usando regras:', (e as Error).message);
    }
  }

  await admin.from('monthly_insights').upsert({ user_id: userId, month: `${month}-01`, items, source }, { onConflict: 'user_id,month', ignoreDuplicates: true });
  return { month, items, source };
}
