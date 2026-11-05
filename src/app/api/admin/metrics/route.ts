import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/adminAuth';
import { buildDashboard, PLAN_LABEL, type RawPeriod, type CurrentMetrics, type PlanRow } from '@/lib/adminMetrics';
import { PLANS, PLAN_IDS, canonicalPlan, isPlanId } from '@/lib/plans';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const from = url.searchParams.get('from') || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const to = url.searchParams.get('to') || new Date().toISOString().split('T')[0];

  // Vendas por plano no período (horário de Brasília): pagamentos menos estornos.
  const startIso = `${from}T00:00:00-03:00`;
  const endIso = new Date(new Date(`${to}T00:00:00-03:00`).getTime() + 24 * 3600_000).toISOString();

  const admin = createAdminClient();
  const [period, syncState, snapshot, events] = await Promise.all([
    admin.rpc('admin_period', { p_from: from, p_to: to, p_grain: 'auto' }),
    admin.from('admin_sync_state').select('*').eq('id', 1).maybeSingle(),
    admin.from('profiles').select('subscription_status, subscription_plan').eq('is_admin', false),
    admin.from('billing_events').select('plan, kind, amount').in('kind', ['paid', 'refunded']).gte('occurred_at', startIso).lt('occurred_at', endIso).limit(10000),
  ]);

  if (period.error || !period.data) {
    console.error('admin_period error', period.error);
    return NextResponse.json({ error: 'Não foi possível carregar as métricas.' }, { status: 500 });
  }

  // Current snapshot metrics
  type SnapRow = { subscription_status: string | null; subscription_plan: string | null };
  const profiles = (snapshot.data || []) as SnapRow[];
  const live = (p: SnapRow) => p.subscription_status === 'active' || p.subscription_status === 'past_due' || p.subscription_status === 'trial';
  const paying = profiles.filter((p) => p.subscription_status === 'active' || p.subscription_status === 'past_due').length;
  const trial = profiles.filter((p) => p.subscription_status === 'trial').length;
  const active = profiles.filter((p) => p.subscription_status === 'active').length;
  const pastDue = profiles.filter((p) => p.subscription_status === 'past_due').length;

  const canceled = profiles.filter((p) => p.subscription_status === 'canceled').length;

  // 'familia' (plano antigo, não é mais vendido) entra como Pessoal; planos desconhecidos (zap, piloto...) ficam como estão.
  const keyOf = (plan: string | null | undefined): string => canonicalPlan(plan) ?? plan ?? '';

  // Calculate MRR from paying + trial (valores dos planos vêm de lib/plans)
  const mrr = PLAN_IDS.reduce((sum, id) => sum + PLANS[id].value * profiles.filter((p) => keyOf(p.subscription_plan) === id && live(p)).length, 0);

  // Receita do período por plano
  type EventRow = { plan: string | null; kind: string; amount: number | string | null };
  const revenueByPlan = new Map<string, number>();
  for (const e of (events.data || []) as EventRow[]) {
    const key = keyOf(e.plan) || 'outro';
    revenueByPlan.set(key, (revenueByPlan.get(key) ?? 0) + (e.kind === 'refunded' ? -1 : 1) * Number(e.amount ?? 0));
  }

  // Sempre mostra os 2 planos (mesmo zerados); planos antigos só se tiverem gente.
  const planKeys = Array.from(new Set<string>([...PLAN_IDS, ...profiles.map((p) => keyOf(p.subscription_plan)).filter((k) => k && !isPlanId(k)), ...Array.from(revenueByPlan.keys())]));
  const byPlan: PlanRow[] = planKeys.map((id) => ({
    plan: id,
    label: PLAN_LABEL[id] ?? id,
    subscribers: profiles.filter((p) => keyOf(p.subscription_plan) === id && (p.subscription_status === 'active' || p.subscription_status === 'past_due')).length,
    trial: profiles.filter((p) => keyOf(p.subscription_plan) === id && p.subscription_status === 'trial').length,
    revenuePeriod: Math.round((revenueByPlan.get(id) ?? 0) * 100) / 100,
  }));

  const current: CurrentMetrics = {
    paying,
    trial,
    active,
    pastDue,
    canceled,
    mrr,
    arr: mrr * 12,
    byPlan,
  };

  const dashboard = buildDashboard(
    period.data as RawPeriod,
    current,
    syncState.data ? { last_sync_at: syncState.data.last_sync_at, last_full_sync_at: syncState.data.last_full_sync_at, last_result: syncState.data.last_result } : null
  );

  return NextResponse.json(dashboard, { headers: { 'Cache-Control': 'no-store' } });
}
