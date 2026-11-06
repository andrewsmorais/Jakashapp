import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readBilling } from '@/lib/billingProfile';

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
  // Assinatura pela App Store: não dá para cancelar pelo servidor. Avisamos para cancelar em Ajustes do iPhone.
  const billing = await readBilling(admin, user.id);
  const appleSubscription = billing?.billing_provider === 'apple' && ['active', 'past_due'].includes(String(billing.subscription_status));

  // 1. Comprovantes anexados (arquivos no armazenamento; melhor esforço)
  try {
    for (let i = 0; i < 50; i++) {
      const { data } = await admin.storage.from('receipts').list(user.id, { limit: 100 });
      if (!data?.length) break;
      await admin.storage.from('receipts').remove(data.map((o) => `${user.id}/${o.name}`));
    }
  } catch (e) {
    console.error('Delete account: falha ao apagar comprovantes', e);
  }

  // 2. Remove o usuário (as tabelas ligadas ao usuário apagam em cascata)
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error('Delete account: falha ao excluir usuário', error);
    return NextResponse.json({ error: 'Não foi possível excluir agora. Tente novamente.' }, { status: 500 });
  }
  return NextResponse.json({ success: true, appleSubscription });
}
