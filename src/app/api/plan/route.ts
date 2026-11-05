import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEntitlement } from '@/lib/entitlements';
import { canonicalPlan } from '@/lib/plans';
import { hasLiveAsaasSubscription } from '@/lib/appleIap';
import { readBilling } from '@/lib/billingProfile';

// Plano efetivo do usuário (o próprio ou o do dono da casa). Só para a interface decidir o que mostrar;
// a proteção de verdade continua nas rotas do servidor.
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 });

  const admin = createAdminClient();
  const [ent, billing] = await Promise.all([
    getEntitlement(admin, user.id),
    readBilling(admin, user.id),
  ]);

  // 'familia' (plano antigo, não é mais vendido) volta como 'cpf'.
  const plan = canonicalPlan(ent?.plan);
  return NextResponse.json({
    plan,
    status: ent?.status ?? null,
    viaOwner: ent?.viaOwner ?? false,
    // Como a própria conta paga: 'apple' (App Store), 'asaas' (site) ou null. asaasLive = tem assinatura do site valendo (não oferece compra no app).
    billingProvider: billing?.billing_provider === 'apple' ? 'apple' : billing?.asaas_subscription_id ? 'asaas' : null,
    asaasLive: hasLiveAsaasSubscription(billing),
  });
}
