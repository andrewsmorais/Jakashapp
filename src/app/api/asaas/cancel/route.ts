import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ASAAS_URL = process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3';

// Cancela a renovação da assinatura. O acesso continua até o fim do período já pago/teste.
export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 });

  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Configuração do Asaas ausente no servidor' }, { status: 500 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('asaas_subscription_id, subscription_status').eq('id', user.id).single();
  if (!profile?.asaas_subscription_id) {
    return NextResponse.json({ error: 'Nenhuma assinatura encontrada.' }, { status: 404 });
  }

  try {
    const res = await fetch(`${ASAAS_URL}/subscriptions/${encodeURIComponent(profile.asaas_subscription_id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', access_token: apiKey },
    });
    const json = (await res.json().catch(() => ({}))) as { deleted?: boolean; errors?: { description?: string }[] };
    if (!res.ok && !json.deleted) {
      return NextResponse.json({ error: json.errors?.[0]?.description || 'Não foi possível cancelar agora.' }, { status: 400 });
    }
    await admin.from('profiles').update({ subscription_status: 'canceled' }).eq('id', user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Asaas cancel error:', error);
    return NextResponse.json({ error: 'Não foi possível cancelar agora.' }, { status: 502 });
  }
}
