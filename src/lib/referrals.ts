// Indicação de amigos (servidor). O código fica no perfil (gerado só pelo servidor); a indicação vira "assinou" quando o amigo paga a
// primeira mensalidade (webhook do Asaas). O mês grátis para os dois SÓ é aplicado com REFERRAL_APPLY_REWARDS=1: ele adia a próxima
// cobrança no Asaas, o que precisa ser testado no sandbox antes de ligar.
import { randomInt } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addMonthsClamped } from '@/lib/cards';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I
export const REFERRAL_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
export const CLAIM_WINDOW_DAYS = 7; // só vale para conta recém-criada

export const genReferralCode = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
export const rewardsEnabled = () => process.env.REFERRAL_APPLY_REWARDS === '1';

/** Devolve o código de indicação do usuário, criando um se ainda não tiver. */
export async function ensureReferralCode(admin: SupabaseClient, userId: string): Promise<string | null> {
  const read = async () => (await admin.from('profiles').select('referral_code').eq('id', userId).maybeSingle()).data?.referral_code as string | null | undefined;
  const existing = await read();
  if (existing) return existing;
  for (let i = 0; i < 5; i++) {
    const { data, error } = await admin.from('profiles').update({ referral_code: genReferralCode() }).eq('id', userId).is('referral_code', null).select('referral_code');
    if (!error) return data && data.length ? (data[0].referral_code as string) : (await read()) ?? null; // sem linha = outra chamada gravou antes
    // erro de código repetido (único): sorteia outro
  }
  return null;
}

const asaasUrl = () => process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3';

/** Adia em um mês a próxima cobrança da assinatura do usuário no Asaas e estende o acesso local. Retorna true só se tudo deu certo. */
export async function applyFreeMonth(admin: SupabaseClient, userId: string): Promise<boolean> {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) return false;
  const { data: p } = await admin.from('profiles').select('asaas_subscription_id,subscription_expires_at').eq('id', userId).maybeSingle();
  if (!p?.asaas_subscription_id) return false;
  const url = `${asaasUrl()}/subscriptions/${encodeURIComponent(p.asaas_subscription_id)}`;
  const headers = { 'Content-Type': 'application/json', access_token: apiKey };
  try {
    const cur = await fetch(url, { headers }).then((r) => (r.ok ? r.json() : null));
    if (!cur || cur.status !== 'ACTIVE' || !/^\d{4}-\d{2}-\d{2}$/.test(String(cur.nextDueDate))) return false;
    const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify({ nextDueDate: addMonthsClamped(cur.nextDueDate, 1), updatePendingPayments: true }) });
    if (!res.ok) return false;
    const base = Math.max(Date.now(), p.subscription_expires_at ? new Date(p.subscription_expires_at).getTime() : 0);
    await admin.from('profiles').update({ subscription_expires_at: new Date(base + 30 * 86400000).toISOString() }).eq('id', userId);
    return true;
  } catch (e) {
    console.error('[referral] falha ao aplicar mês grátis', (e as Error).message);
    return false;
  }
}

/** Chamada pelo webhook em PAYMENT_CONFIRMED/RECEIVED: marca a indicação como "assinou" (uma vez) e, se ligado, aplica o mês grátis. */
export async function handleReferralPayment(admin: SupabaseClient, customerId: string): Promise<void> {
  const { data: prof } = await admin.from('profiles').select('id').eq('asaas_customer_id', customerId).maybeSingle();
  if (!prof) return;
  const { data: claimed } = await admin.from('referrals').update({ status: 'subscribed', subscribed_at: new Date().toISOString() })
    .eq('referred_id', prof.id).eq('status', 'signed_up').select('id,referrer_id');
  const row = claimed?.[0];
  if (!row || !rewardsEnabled()) return;
  const [a, b] = await Promise.all([applyFreeMonth(admin, row.referrer_id), applyFreeMonth(admin, prof.id)]);
  if (a && b) await admin.from('referrals').update({ status: 'rewarded', rewarded_at: new Date().toISOString() }).eq('id', row.id);
  else console.error('[referral] recompensa não aplicada por completo', JSON.stringify({ referral: row.id, referrer: a, referred: b }));
}
