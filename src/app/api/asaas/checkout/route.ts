import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLANS, isPlanId } from '@/lib/plans';
import { readBilling } from '@/lib/billingProfile';

// Sandbox por padrão. Em produção defina ASAAS_API_URL=https://api.asaas.com/v3
const ASAAS_URL = process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3';

type AsaasError = { description?: string };
type AsaasResponse = {
  id?: string;
  data?: Array<{ id?: string; invoiceUrl?: string }>;
  errors?: AsaasError[];
};

async function asaas(path: string, apiKey: string, init?: RequestInit): Promise<AsaasResponse> {
  const res = await fetch(`${ASAAS_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: apiKey,
      ...(init?.headers || {}),
    },
  });
  return (await res.json()) as AsaasResponse;
}

export async function POST(request: Request) {
  try {
    // 1. Exige usuário logado
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !user.email) {
      return NextResponse.json({ error: 'Faça login para assinar' }, { status: 401 });
    }

    const apiKey = process.env.ASAAS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Configuração do Asaas ausente no servidor' }, { status: 500 });
    }

    // 2. Plano e CPF/CNPJ (o valor NUNCA vem do navegador)
    const body = await request.json();
    const planId: unknown = body.plan;
    if (!isPlanId(planId)) {
      return NextResponse.json({ error: 'Plano inválido' }, { status: 400 });
    }
    const plan = PLANS[planId];
    const cpfCnpj = String(body.cpfCnpj ?? '').replace(/\D/g, '');
    if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
      return NextResponse.json({ error: 'Informe um CPF ou CNPJ válido' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, asaas_customer_id, asaas_subscription_id, subscription_status, subscription_plan')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
    }

    // Assinatura feita pela App Store: quem gerencia é a Apple (Ajustes do iPhone), não o Asaas.
    const billing = await readBilling(admin, user.id);
    if (billing?.billing_provider === 'apple' && ['active', 'past_due'].includes(String(profile.subscription_status))) {
      return NextResponse.json({ error: 'Sua assinatura é gerenciada pela App Store (Ajustes do iPhone › Assinaturas).' }, { status: 409 });
    }

    // Troca de plano (upgrade/downgrade) de quem já tem assinatura: atualiza o valor da MESMA assinatura no Asaas,
    // sem criar cobrança nova. Em teste ou com cobrança em aberto, a cobrança pendente também passa para o novo valor;
    // em conta ativa, vale a partir da próxima renovação.
    const hasSub = Boolean(profile.asaas_subscription_id) && ['trial', 'active', 'past_due', 'unpaid'].includes(String(profile.subscription_status));
    if (hasSub && profile.subscription_plan !== planId) {
      const updated = await asaas(`/subscriptions/${profile.asaas_subscription_id}`, apiKey, {
        method: 'PUT',
        body: JSON.stringify({ value: plan.value, description: `Assinatura ${plan.name}`, updatePendingPayments: true }),
      });
      if (updated.errors?.length || !updated.id) {
        return NextResponse.json({ error: updated.errors?.[0]?.description || 'Não foi possível trocar o plano agora.' }, { status: 400 });
      }
      const { error: planError } = await admin.from('profiles').update({ subscription_plan: planId }).eq('id', user.id);
      if (planError) {
        console.error('Checkout: plano trocado no Asaas mas não salvo no perfil', planError);
        return NextResponse.json({ error: 'Erro interno ao processar assinatura.' }, { status: 500 });
      }
      return NextResponse.json({ success: true, changed: true, plan: planId });
    }
    if (profile.subscription_status === 'active') {
      return NextResponse.json({ error: 'Você já tem esse plano ativo' }, { status: 409 });
    }

    // 3. Cliente no Asaas (reaproveita o do perfil; senão busca por externalReference; senão cria)
    let customerId: string | undefined = profile.asaas_customer_id ?? undefined;
    if (!customerId) {
      const found = await asaas(`/customers?externalReference=${encodeURIComponent(user.id)}`, apiKey);
      customerId = found.data?.[0]?.id;
    }
    if (!customerId) {
      const created = await asaas('/customers', apiKey, {
        method: 'POST',
        body: JSON.stringify({
          name: profile.full_name,
          email: user.email,
          cpfCnpj,
          externalReference: user.id,
        }),
      });
      if (created.errors?.length || !created.id) {
        return NextResponse.json({ error: created.errors?.[0]?.description || 'Não foi possível criar o cliente' }, { status: 400 });
      }
      customerId = created.id;
    }

    // 4. Grava o vínculo ANTES de criar a assinatura (o webhook acha o perfil por asaas_customer_id)
    const { error: saveError } = await admin
      .from('profiles')
      .update({ asaas_customer_id: customerId, cpf_cnpj: cpfCnpj, subscription_plan: planId })
      .eq('id', user.id);
    if (saveError) {
      console.error('Checkout: falha ao salvar perfil', saveError);
      return NextResponse.json({ error: 'Erro interno ao processar assinatura.' }, { status: 500 });
    }

    // Já existe assinatura em teste ou em aberto: devolve o link da cobrança em vez de criar outra
    if (profile.asaas_subscription_id && ['trial', 'past_due', 'unpaid'].includes(String(profile.subscription_status))) {
      const existing = await asaas(`/subscriptions/${profile.asaas_subscription_id}/payments`, apiKey);
      const existingUrl = existing.data?.[0]?.invoiceUrl;
      if (existingUrl) return NextResponse.json({ success: true, paymentUrl: existingUrl });
    }

    // 5. Assinatura mensal. Teste grátis só uma vez por conta: quem já teve assinatura no Asaas
    //    (o cancelamento mantém asaas_subscription_id) ou pela App Store paga desde o primeiro dia.
    const trialUsed = Boolean(profile.asaas_subscription_id) || Boolean(billing?.billing_provider === 'apple');
    const trialDays = trialUsed ? 0 : 7;
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + trialDays);
    const subscription = await asaas('/subscriptions', apiKey, {
      method: 'POST',
      body: JSON.stringify({
        customer: customerId,
        billingType: 'UNDEFINED', // usuário escolhe Pix, cartão ou boleto
        value: plan.value,
        nextDueDate: nextDueDate.toISOString().split('T')[0],
        cycle: 'MONTHLY',
        description: `Assinatura ${plan.name}`,
        externalReference: user.id,
      }),
    });
    if (subscription.errors?.length || !subscription.id) {
      return NextResponse.json({ error: subscription.errors?.[0]?.description || 'Não foi possível criar a assinatura' }, { status: 400 });
    }

    // Guarda a assinatura. Primeiro teste: 'trial' até a data da cobrança. Sem teste: 'unpaid' (sem acesso)
    // até o webhook marcar 'active' no pagamento.
    const { error: subSaveError } = await admin
      .from('profiles')
      .update({
        asaas_subscription_id: subscription.id,
        subscription_status: trialDays > 0 ? 'trial' : 'unpaid',
        subscription_expires_at: nextDueDate.toISOString(),
      })
      .eq('id', user.id);
    if (subSaveError) {
      console.error('Checkout: assinatura criada mas não salva no perfil', subSaveError);
      await fetch(`${ASAAS_URL}/subscriptions/${encodeURIComponent(subscription.id as string)}`, {
        method: 'DELETE',
        headers: { access_token: apiKey },
      }).catch(() => undefined);
      return NextResponse.json({ error: 'Erro interno ao processar assinatura.' }, { status: 500 });
    }

    // 6. Link real da primeira cobrança (invoiceUrl)
    const payments = await asaas(`/subscriptions/${subscription.id}/payments`, apiKey);
    const paymentUrl = payments.data?.[0]?.invoiceUrl;
    if (!paymentUrl) {
      return NextResponse.json({ error: 'Cobrança ainda sendo gerada. Tente novamente em instantes.' }, { status: 502 });
    }

    return NextResponse.json({ success: true, subscriptionId: subscription.id, paymentUrl });
  } catch (error: unknown) {
    console.error('Asaas Checkout Error:', error);
    return NextResponse.json({ error: 'Erro interno ao processar assinatura.' }, { status: 500 });
  }
}
