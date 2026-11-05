import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppleApiError, appleIapConfigured, checkTransaction, fetchAppleTransaction, hasLiveAsaasSubscription, iapFlagOn } from '@/lib/appleIap';
import { readBilling, recordAppleBillingEvent } from '@/lib/billingProfile';
import { PLANS } from '@/lib/plans';

// Confirma uma compra feita no app iOS. O app só manda o número da transação; tudo o que vale vem da Apple:
// consultamos a App Store Server API (TLS) e só então liberamos o plano. Nada do que o aparelho diz é confiável.

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ transactionId: z.string().regex(/^\d{1,20}$/) });

const REASON_MESSAGE: Record<string, string> = {
  bundle: 'Esta compra não é do app Jakash.',
  product: 'Produto desconhecido.',
  account: 'Esta assinatura foi feita em outra conta Jakash. Entre nessa conta para usá-la.',
  revoked: 'Esta compra foi estornada pela Apple.',
  expired: 'Esta assinatura já expirou.',
  incomplete: 'Não foi possível ler a compra.',
};

export async function POST(request: Request) {
  try {
    if (!iapFlagOn()) return NextResponse.json({ error: 'Compra pelo app ainda não está disponível.' }, { status: 404 });
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 });
    if (!appleIapConfigured()) return NextResponse.json({ error: 'A compra pelo app ainda não está configurada.' }, { status: 503 });

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });

    const admin = createAdminClient();
    const billing = await readBilling(admin, user.id);
    if (hasLiveAsaasSubscription(billing)) return NextResponse.json({ error: 'Você já tem uma assinatura ativa.' }, { status: 409 });

    let found;
    try {
      found = await fetchAppleTransaction(parsed.data.transactionId);
    } catch (e) {
      console.error('[apple/verify] consulta', (e as Error).message);
      return NextResponse.json({ error: 'Não foi possível falar com a Apple agora. Tente de novo.' }, { status: 502 });
    }
    if (!found) return NextResponse.json({ error: 'Compra não encontrada na Apple.' }, { status: 404 });

    const check = checkTransaction(found.tx, user.id);
    if (!check.ok) return NextResponse.json({ error: REASON_MESSAGE[check.reason] ?? 'Compra inválida.' }, { status: check.reason === 'account' ? 403 : 422 });

    const { error } = await admin.from('profiles').update({
      subscription_plan: check.plan,
      subscription_status: 'active',
      subscription_expires_at: check.expiresAt,
      billing_provider: 'apple',
      apple_original_transaction_id: check.originalTransactionId,
    }).eq('id', user.id);
    if (error) {
      // 23505: a mesma assinatura da Apple já está ligada a outra conta (índice único).
      if (error.code === '23505') return NextResponse.json({ error: 'Esta assinatura já está ligada a outra conta Jakash.' }, { status: 409 });
      console.error('[apple/verify] gravar perfil', error.message);
      return NextResponse.json({ error: 'Não foi possível liberar o plano agora. Tente restaurar a compra.' }, { status: 500 });
    }

    await recordAppleBillingEvent(admin, { userId: user.id, transactionId: check.transactionId, kind: 'paid', plan: check.plan, amount: PLANS[check.plan].value });
    return NextResponse.json({ ok: true, plan: check.plan, expiresAt: check.expiresAt });
  } catch (error) {
    if (error instanceof AppleApiError) console.error('[apple/verify]', error.message);
    else console.error('[apple/verify] erro', (error as Error).message);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
