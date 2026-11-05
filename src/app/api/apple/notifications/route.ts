import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { appleBundleId, appleIapConfigured, billingEventFor, decodeTransaction, fetchAppleSubscriptionStatuses, profilePatchFromStatuses } from '@/lib/appleIap';
import { recordAppleBillingEvent } from '@/lib/billingProfile';
import { decodeJwsPayload } from '@/lib/jwtEs256';
import { planFromAppleProduct } from '@/lib/plans';

// App Store Server Notifications V2 (URL configurada na App Store Connect).
// O corpo da notificação NÃO é confiável: serve só para descobrir de qual assinatura se trata.
// O estado de verdade vem de uma consulta à Apple (Get All Subscription Statuses), e só ele altera o perfil.
// Repetir a mesma notificação não muda nada além do que a Apple já informa (idempotente).

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type NotificationPayload = { notificationType?: string; data?: { bundleId?: string; environment?: string; signedTransactionInfo?: string } };

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 100_000) return NextResponse.json({ error: 'grande demais' }, { status: 413 });
    let body: { signedPayload?: unknown } = {};
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'inválido' }, { status: 400 }); }

    const payload = decodeJwsPayload<NotificationPayload>(body.signedPayload);
    if (!payload) return NextResponse.json({ error: 'inválido' }, { status: 400 });

    // Teste da App Store Connect e eventos sem transação: nada a fazer.
    const info = decodeTransaction(payload.data?.signedTransactionInfo);
    const originalId = info?.originalTransactionId;
    if (!originalId || !/^\d{1,20}$/.test(originalId)) return NextResponse.json({ ok: true });
    if (payload.data?.bundleId && payload.data.bundleId !== appleBundleId()) return NextResponse.json({ ok: true });
    if (!appleIapConfigured()) return NextResponse.json({ error: 'não configurado' }, { status: 503 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from('profiles').select('id').eq('apple_original_transaction_id', originalId).maybeSingle();
    // Ainda não ligada a nenhuma conta (a confirmação do app chega depois e grava o estado). Não é erro.
    if (!profile) return NextResponse.json({ ok: true });

    let statuses;
    try {
      statuses = await fetchAppleSubscriptionStatuses(originalId, payload.data?.environment);
    } catch (e) {
      console.error('[apple/notifications] consulta', (e as Error).message);
      return NextResponse.json({ error: 'tente de novo' }, { status: 502 }); // a Apple reenvia
    }
    if (!statuses) return NextResponse.json({ ok: true });

    const result = profilePatchFromStatuses(statuses, originalId);
    if (!result) return NextResponse.json({ ok: true });

    const { error } = await admin.from('profiles').update(result.patch).eq('id', profile.id);
    if (error) {
      console.error('[apple/notifications] gravar perfil', error.message);
      return NextResponse.json({ error: 'tente de novo' }, { status: 500 });
    }

    const plan = planFromAppleProduct(result.tx.productId);
    const ev = billingEventFor(result.status, plan);
    if (ev && result.tx.transactionId) await recordAppleBillingEvent(admin, { userId: profile.id, transactionId: result.tx.transactionId, kind: ev.kind, plan, amount: ev.amount });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[apple/notifications] erro', (error as Error).message);
    return NextResponse.json({ error: 'erro' }, { status: 500 });
  }
}
