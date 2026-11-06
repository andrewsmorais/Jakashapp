import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { todayInSaoPaulo } from '@/lib/reminders';
import { generateInsight, getInsight, insightMonthFor } from '@/lib/insightsServer';
import { getEntitlement, isEntitled } from '@/lib/entitlements';
import { aiDailyLimit } from '@/lib/plans';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// "3 coisas que mudaram no seu mês": devolve o insight do mês passado, gerando-o na primeira vez (uma chamada de IA por usuário por mês).
export async function GET() {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 });
  const admin = createAdminClient();
  const month = insightMonthFor(todayInSaoPaulo());
  try {
    const existing = await getInsight(admin, user.id, month);
    if (existing) return NextResponse.json({ insight: existing });

    const ent = await getEntitlement(admin, user.id);
    if (!isEntitled(ent)) return NextResponse.json({ insight: null, reason: 'plan' });
    // Conta no limite diário de IA: pedidos repetidos/simultâneos antes de o insight ser gravado não viram gasto sem fim.
    const day = todayInSaoPaulo();
    const { data: used, error: usageError } = await admin.rpc('ai_usage_hit', { p_user: user.id, p_day: day, p_limit: aiDailyLimit(ent?.plan) });
    if (usageError || used === -1) return NextResponse.json({ insight: null, reason: 'limit' });
    return NextResponse.json({ insight: await generateInsight(admin, user.id, month), reason: 'data' });
  } catch (e) {
    console.error('[insights]', (e as Error).message);
    return NextResponse.json({ insight: null, reason: 'error' });
  }
}
