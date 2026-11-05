import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { aiDailyLimit } from '@/lib/plans';
import { getEntitlement, isEntitled } from '@/lib/entitlements';
import { buildClassifier } from '@/lib/essentials';
import {
  buildDebtPlan, EXPLAIN_SYSTEM, explainPayload, miniReserveTarget, NEGOTIATION_SCRIPT, summaryText, validateExplanation,
  type PlanDebt,
} from '@/lib/debtPlan';

export const maxDuration = 30;

// Plano para sair do vermelho. As contas são feitas em código (lib/debtPlan). A IA só escreve a explicação e o texto dela
// é descartado se trouxer número que não está no plano. Sem IA (chave ausente, limite do dia), o resumo em código vale.

const bodySchema = z.object({ budget: z.number().positive().max(10_000_000) });

const todayInSaoPaulo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Faça login para montar o plano.' }, { status: 401 });

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Informe quanto você consegue pagar por mês.' }, { status: 400 });
    const { budget } = parsed.data;

    const admin = createAdminClient();
    const ent = await getEntitlement(admin, user.id);
    if (!isEntitled(ent)) return NextResponse.json({ error: 'Sua assinatura não está ativa. Renove em Configurações › Planos.' }, { status: 402 });

    const today = todayInSaoPaulo();
    const since = new Date(Date.parse(`${today}T00:00:00Z`) - 90 * 86400000).toISOString().slice(0, 10);

    // Com a sessão da pessoa: o RLS decide o que ela (e a casa) enxerga.
    const [d, c, f, t] = await Promise.all([
      supabase.from('debts').select('id,name,kind,balance,monthly_rate,min_payment,status,essential,creditor,cash_offer,agreement_installments,agreement_amount').eq('archived', false),
      supabase.from('categories').select('id,name,parent_id').eq('type', 'expense'),
      supabase.from('category_flags').select('category_id,is_essential,is_benefit'),
      supabase.from('transactions').select('amount,category_id').eq('type', 'expense').gte('date', since).limit(5000),
    ]);
    if (d.error) return NextResponse.json({ error: 'Não foi possível ler as dívidas.' }, { status: 500 });

    const debts: PlanDebt[] = (d.data ?? []).map((x) => ({
      id: x.id, name: x.name, kind: x.kind, balance: Number(x.balance), monthly_rate: Number(x.monthly_rate), min_payment: Number(x.min_payment),
      status: x.status, essential: Boolean(x.essential), creditor: x.creditor,
      cash_offer: x.cash_offer == null ? null : Number(x.cash_offer),
      agreement_installments: x.agreement_installments, agreement_amount: x.agreement_amount == null ? null : Number(x.agreement_amount),
    }));
    const plan = buildDebtPlan(debts, budget);

    // Reserva inicial = um mês de gastos essenciais (média dos últimos 90 dias).
    const cls = buildClassifier(c.data ?? [], f.data ?? []);
    const essential90 = (t.data ?? []).reduce((s, x) => s + (cls.isEssential(x.category_id) ? Number(x.amount) : 0), 0);
    const miniReserve = miniReserveTarget(r2(essential90 / 3));

    let explanation: string | null = null;
    if (process.env.OPENAI_API_KEY && plan.ok && plan.order.length > 0) {
      const limit = aiDailyLimit(ent?.plan);
      const { data: used } = await admin.rpc('ai_usage_hit', { p_user: user.id, p_day: today, p_limit: limit });
      if (typeof used === 'number' && used !== -1) {
        try {
          const completion = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat.completions.create({
            model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
            temperature: 0.3,
            max_tokens: 400,
            messages: [
              { role: 'system', content: EXPLAIN_SYSTEM },
              { role: 'user', content: JSON.stringify(explainPayload(plan)) },
            ],
          });
          explanation = validateExplanation(completion.choices[0]?.message?.content, plan);
        } catch (err) {
          console.error('[debts/plan] falha na IA', (err as Error).message);
          await admin.rpc('ai_usage_refund', { p_user: user.id, p_day: today });
        }
      }
    }

    return NextResponse.json({ plan, summary: summaryText(plan), explanation, miniReserve, script: NEGOTIATION_SCRIPT });
  } catch (error) {
    console.error('[debts/plan] erro', (error as Error).message);
    return NextResponse.json({ error: 'Erro interno ao montar o plano.' }, { status: 500 });
  }
}
