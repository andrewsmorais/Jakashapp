import type { SupabaseClient } from '@supabase/supabase-js';

// Quem tem acesso pago: teste, ativa ou com pagamento atrasado (mesma regra de antes).
export const LIVE_STATUS = ['trial', 'active', 'past_due'];

export type Entitlement = {
  plan: string | null;
  status: string | null;
  expiresAt: string | null;
  // true quando o acesso vem da assinatura de quem convidou (gestão compartilhada).
  viaOwner: boolean;
};

type ProfileRow = { subscription_status: string | null; subscription_plan: string | null; subscription_expires_at: string | null };
const COLS = 'subscription_status, subscription_plan, subscription_expires_at';

// Teste grátis que já passou do prazo não vale (status continua 'trial' no banco depois de vencer).
const trialExpired = (status: string | null, expiresAt: string | null, now: number) =>
  status === 'trial' && Boolean(expiresAt) && new Date(expiresAt as string).getTime() < now;

const isLive = (p: ProfileRow | null | undefined, now = Date.now()) =>
  Boolean(p && LIVE_STATUS.includes(String(p.subscription_status)) && !trialExpired(p.subscription_status, p.subscription_expires_at, now));

// Plano e status que valem para o usuário: o próprio; se ele não tem assinatura ativa mas é membro
// de uma casa cujo dono tem, vale a do dono (o convidado não paga de novo). Só servidor (service role).
export async function getEntitlement(admin: SupabaseClient, userId: string): Promise<Entitlement | null> {
  const { data: own } = await admin.from('profiles').select(COLS).eq('id', userId).maybeSingle();
  if (!own) return null;
  const ownEnt: Entitlement = { plan: own.subscription_plan, status: own.subscription_status, expiresAt: own.subscription_expires_at, viaOwner: false };
  if (isLive(own)) return ownEnt;

  const { data: link } = await admin.from('partnerships').select('owner_id').eq('partner_id', userId).eq('status', 'accepted').maybeSingle();
  if (link?.owner_id) {
    const { data: owner } = await admin.from('profiles').select(COLS).eq('id', link.owner_id).maybeSingle();
    if (owner && isLive(owner)) {
      return { plan: owner.subscription_plan, status: owner.subscription_status, expiresAt: owner.subscription_expires_at, viaOwner: true };
    }
  }
  return ownEnt;
}

// Acesso válido agora: status pago e, se for teste, ainda dentro do prazo.
export function isEntitled(ent: Entitlement | null | undefined, now = Date.now()): boolean {
  if (!ent || !LIVE_STATUS.includes(String(ent.status))) return false;
  return !trialExpired(ent.status, ent.expiresAt, now);
}
