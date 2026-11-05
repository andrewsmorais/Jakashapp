import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readBilling } from '@/lib/billingProfile';

const ASAAS_URL = process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3';

// Exclui a conta e os dados do usuário logado (LGPD). Exige confirmação digitada.
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (String(body.confirm ?? '').trim().toUpperCase() !== 'EXCLUIR') {
    return NextResponse.json({ error: 'Digite EXCLUIR para confirmar.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('asaas_subscription_id')
    .eq('id', user.id)
    .single();

  // Assinatura pela App Store: não dá para cancelar pelo servidor. Avisamos para cancelar em Ajustes do iPhone.
  const billing = await readBilling(admin, user.id);
  const appleSubscription = billing?.billing_provider === 'apple' && ['active', 'past_due'].includes(String(billing.subscription_status));

  // 1. Para a cobrança. A exclusão é definitiva: só segue se o Asaas confirmar o cancelamento
  //    (ou se a assinatura já estava cancelada). Se falhar, a conta fica e a pessoa tenta de novo.
  const asaasSub = profile?.asaas_subscription_id;
  const asaasLive = !appleSubscription && ['trial', 'active', 'past_due', 'unpaid'].includes(String(billing?.subscription_status));
  if (asaasSub) {
    const apiKey = process.env.ASAAS_API_KEY;
    let cancelled = false;
    if (apiKey) {
      try {
        const res = await fetch(`${ASAAS_URL}/subscriptions/${encodeURIComponent(asaasSub)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', access_token: apiKey },
        });
        const json = (await res.json().catch(() => ({}))) as { deleted?: boolean };
        // 404: a assinatura já não existe no Asaas (ex.: cancelada antes em Planos).
        cancelled = res.ok || json.deleted === true || res.status === 404;
        if (!cancelled) console.error('Delete account: Asaas recusou o cancelamento', res.status, json);
      } catch (error) {
        console.error('Delete account: falha ao cancelar assinatura', error);
      }
    } else {
      console.error('Delete account: ASAAS_API_KEY ausente; assinatura não cancelada');
    }
    if (!cancelled && asaasLive) {
      return NextResponse.json(
        { error: 'Não foi possível cancelar sua assinatura agora. A conta não foi excluída; tente de novo em instantes.' },
        { status: 502 },
      );
    }
  }

  // 2. Comprovantes anexados (arquivos no armazenamento; melhor esforço)
  try {
    for (let i = 0; i < 50; i++) {
      const { data } = await admin.storage.from('receipts').list(user.id, { limit: 100 });
      if (!data?.length) break;
      await admin.storage.from('receipts').remove(data.map((o) => `${user.id}/${o.name}`));
    }
  } catch (e) {
    console.error('Delete account: falha ao apagar comprovantes', e);
  }

  // 3. Remove o usuário (as tabelas ligadas ao usuário apagam em cascata)
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error('Delete account: falha ao excluir usuário', error);
    return NextResponse.json({ error: 'Não foi possível excluir agora. Tente novamente.' }, { status: 500 });
  }
  return NextResponse.json({ success: true, appleSubscription });
}
