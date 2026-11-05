import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { todayInSaoPaulo } from '@/lib/reminders';
import { ELIGIBLE_STATUS, generateInsight, insightMonthFor, planAllows } from '@/lib/insightsServer';

// Insight mensal: todo dia 1 (vercel.json) gera o resumo do mês anterior de quem tem assinatura em dia e lançamentos suficientes.
// Quem ficar de fora (limite de tempo/volume por execução) é atendido ao abrir o painel (/api/insights). Resposta só com contagens.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PAGE = 1000;
const BATCH = 5;
const MAX_PER_RUN = 300;
const TIME_BUDGET_MS = 50_000;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(request.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET não configurada.' }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dry = new URL(request.url).searchParams.get('dry') === '1';
  const started = Date.now();
  try {
    const admin = createAdminClient();
    const month = insightMonthFor(todayInSaoPaulo());

    const done = new Set<string>();
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin.from('monthly_insights').select('user_id').eq('month', `${month}-01`).order('user_id').range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      (data ?? []).forEach((r) => done.add(r.user_id));
      if (!data || data.length < PAGE) break;
    }

    const todo: string[] = [];
    for (let from = 0; todo.length < MAX_PER_RUN; from += PAGE) {
      const { data, error } = await admin.from('profiles').select('id,subscription_status,subscription_expires_at').in('subscription_status', ELIGIBLE_STATUS).order('id').range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      (data ?? []).forEach((p) => { if (!done.has(p.id) && planAllows(p) && todo.length < MAX_PER_RUN) todo.push(p.id); });
      if (!data || data.length < PAGE) break;
    }

    let generated = 0, skipped = 0, timedOut = false;
    if (!dry) {
      for (let i = 0; i < todo.length; i += BATCH) {
        if (Date.now() - started > TIME_BUDGET_MS) { timedOut = true; break; }
        const results = await Promise.all(todo.slice(i, i + BATCH).map((id) => generateInsight(admin, id, month).catch((e) => { console.error('[insights] usuário', (e as Error).message); return null; })));
        results.forEach((r) => { if (r) generated++; else skipped++; });
      }
    }
    const result = { ok: true, dry, month, pending: todo.length, generated, skipped, timedOut, ms: Date.now() - started };
    console.log('[insights]', JSON.stringify(result));
    return NextResponse.json(result);
  } catch (e) {
    console.error('[insights] erro', (e as Error).message);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
