import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureReferralCode, rewardsEnabled } from '@/lib/referrals';

export const dynamic = 'force-dynamic';

// Código e link de indicação do usuário + andamento das indicações.
export async function GET() {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 });
  const admin = createAdminClient();
  const code = await ensureReferralCode(admin, user.id);
  if (!code) return NextResponse.json({ error: 'Não foi possível gerar seu código' }, { status: 500 });

  const { data } = await admin.from('referrals').select('status').eq('referrer_id', user.id).limit(1000);
  const rows = data ?? [];
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.jakash.app').replace(/\/$/, '');
  return NextResponse.json({
    code,
    link: `${site}/?ref=${code}`,
    stats: {
      signedUp: rows.length,
      subscribed: rows.filter((r) => r.status === 'subscribed' || r.status === 'rewarded').length,
      rewarded: rows.filter((r) => r.status === 'rewarded').length,
    },
    autoReward: rewardsEnabled(),
  });
}
