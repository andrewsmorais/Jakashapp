import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { handleReferralPayment } from '@/lib/referrals';
import { PLANS, canonicalPlan } from '@/lib/plans';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

const EVENT_KIND: Record<string, 'paid' | 'overdue' | 'refunded' | 'canceled'> = {
  PAYMENT_RECEIVED: 'paid',
  PAYMENT_CONFIRMED: 'paid',
  PAYMENT_OVERDUE: 'overdue',
  PAYMENT_REFUNDED: 'refunded',
  SUBSCRIPTION_DELETED: 'canceled',
  SUBSCRIPTION_INACTIVATED: 'canceled',
};

async function recordBillingEvent(
  supabase: ReturnType<typeof createAdminClient>,
  event: string,
  customerId: string,
  body: { payment?: { id?: string; value?: number; netValue?: number | null }; subscription?: { id?: string } },
) {
  const kind = EVENT_KIND[event];
  if (!kind) return;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, subscription_plan')
    .eq('asaas_customer_id', customerId)
    .maybeSingle();

  // A conta do Asaas é compartilhada com outros projetos: cobrança de cliente que não é do Jakash não entra nas métricas.
  if (!profile) return;

  // 'familia' (plano antigo, não é mais vendido) conta como 'cpf'; valores desconhecidos (zap, piloto...) ficam como estão.
  const stored = (profile.subscription_plan as string | null) ?? null;
  const known = canonicalPlan(stored);
  const plan = known ?? stored;
  const planValue = known ? PLANS[known].value : 0;
  const amount = Number(body.payment?.value ?? planValue) || 0;

  const row = {
    user_id: profile.id,
    asaas_customer_id: customerId,
    payment_id: body.payment?.id ?? null,
    kind,
    plan,
    // Só cobranças carregam valor; cancelamento de assinatura não é dinheiro.
    amount: kind === 'canceled' || kind === 'overdue' ? 0 : amount,
  };
  // Valor líquido (já sem a taxa do Asaas): a diferença para `amount` é a taxa real.
  const net = kind === 'paid' && body.payment?.netValue != null ? Number(body.payment.netValue) : null;

  let { error } = await supabase.from('billing_events').insert({ ...row, net_amount: net });
  // Coluna net_amount ainda não existe (migration pendente): grava sem ela para nunca perder o evento.
  if (error && (error.code === '42703' || error.code === 'PGRST204')) {
    ({ error } = await supabase.from('billing_events').insert(row));
  }
  // 23505 = o Asaas reenviou o mesmo pagamento (PAYMENT_RECEIVED + PAYMENT_CONFIRMED): ignorar.
  if (error && error.code !== '23505') throw new Error(error.message);
}

export async function POST(request: Request) {
  try {
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;
    const received = request.headers.get('asaas-access-token') ?? '';

    if (!expected || !safeEqual(received, expected)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const event: string = body.event;
    const supabase = createAdminClient();

    // Eventos de cobrança trazem body.payment; eventos de assinatura trazem body.subscription
    const customerId: string | undefined = body.payment?.customer ?? body.subscription?.customer;
    if (!customerId) {
      return NextResponse.json({ received: true, ignored: 'sem customer' }, { status: 200 });
    }

    let update: Record<string, unknown> | null = null;

    if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      update = { subscription_status: 'active', subscription_expires_at: expiresAt.toISOString() };
    } else if (event === 'PAYMENT_OVERDUE') {
      update = { subscription_status: 'past_due' };
    } else if (event === 'PAYMENT_REFUNDED' || event === 'SUBSCRIPTION_DELETED' || event === 'SUBSCRIPTION_INACTIVATED') {
      update = { subscription_status: 'canceled' };
    }

    if (update) {
      const { error } = await supabase
        .from('profiles')
        .update(update)
        .eq('asaas_customer_id', customerId);

      // Erro => 500 para o Asaas tentar de novo
      if (error) {
        console.error('Asaas webhook: falha ao atualizar perfil', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
      }
    }

    // Histórico de cobrança para o painel admin (receita/churn por mês). Nunca pode derrubar o webhook.
    await recordBillingEvent(supabase, event, customerId, body).catch((e: unknown) => console.error('[billing_events]', (e as Error).message));

    // Indicação de amigos: nunca pode fazer o webhook falhar (o Asaas reenviaria o evento).
    if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
      await handleReferralPayment(supabase, customerId).catch((e: unknown) => console.error('[referral] webhook', (e as Error).message));
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: unknown) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
