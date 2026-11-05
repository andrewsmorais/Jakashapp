import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { todayInSaoPaulo } from '@/lib/reminders';
import { generateInsight, getInsight, insightMonthFor, planAllows } from '@/lib/insightsServer';

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

    const { data: profile } = await admin.from('profiles').select('subscription_status,subscription_expires_at').eq('id', user.id).maybeSingle();
    if (!planAllows(profile)) return NextResponse.json({ insight: null, reason: 'plan' });
    return NextResponse.json({ insight: await generateInsight(admin, user.id, month), reason: 'data' });
  } catch (e) {
    console.error('[insights]', (e as Error).message);
    return NextResponse.json({ insight: null, reason: 'error' });
  }
}
