import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingLite } from '@/lib/appleIap';

// Leitura tolerante dos campos de cobrança: enquanto a migration do app iOS (billing_provider) não foi aplicada,
// a coluna não existe; nesse caso lê sem ela em vez de quebrar o fluxo de quem paga pelo Asaas.
const BASE = 'asaas_subscription_id, subscription_status, subscription_plan, subscription_expires_at';

export type BillingRow = BillingLite & { subscription_plan?: string | null };

export async function readBilling(admin: SupabaseClient, userId: string): Promise<BillingRow | null> {
  const full = await admin.from('profiles').select(`${BASE}, billing_provider`).eq('id', userId).maybeSingle();
  if (!full.error) return (full.data as BillingRow | null) ?? null;
  if (full.error.code !== '42703' && full.error.code !== 'PGRST204') return null;
  const base = await admin.from('profiles').select(BASE).eq('id', userId).maybeSingle();
  return (base.data as BillingRow | null) ?? null;
}

export type BillingKind = 'paid' | 'overdue' | 'refunded' | 'canceled';

/** Registro para o painel do dono (billing_events). Repetido (mesmo payment_id + kind) é ignorado; nunca derruba o fluxo. */
export async function recordAppleBillingEvent(
  admin: SupabaseClient,
  e: { userId: string; transactionId: string; kind: BillingKind; plan: string | null; amount: number; occurredAt?: string },
): Promise<void> {
  const { error } = await admin.from('billing_events').insert({
    user_id: e.userId,
    payment_id: `apple:${e.transactionId}`,
    kind: e.kind,
    plan: e.plan,
    amount: e.amount,
    ...(e.occurredAt ? { occurred_at: e.occurredAt } : {}),
  });
  if (error && error.code !== '23505') console.error('[apple] billing_events', error.message);
}
