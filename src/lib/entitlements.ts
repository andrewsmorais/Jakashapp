import type { SupabaseClient } from '@supabase/supabase-js';

// Status que podem dar acesso (cada um com sua regra de prazo em isLiveStatus).
export const LIVE_STATUS = ['trial', 'active', 'past_due'];

// Folga depois do fim do período pago, para a renovação da Apple chegar antes de bloquear.
export const RENEWAL_GRACE_MS = 3 * 86_400_000;

export type Entitlement = {
  plan: string | null;
  status: string | null;
  expiresAt: string | null;
  // true quando o acesso vem da assinatura de quem convidou (gestão compartilhada).
  viaOwner: boolean;
};

type ProfileRow = { subscription_status: string | null; subscription_plan: string | null; subscription_expires_at: string | null; is_admin?: boolean | null };
const COLS = 'subscription_status, subscription_plan, subscription_expires_at, is_admin';

/**
 * Assinatura valendo agora. MESMA regra da função do banco public.subscription_is_live (migração assinatura_obrigatoria):
 *  - trial (7 dias grátis da Apple): só dentro do prazo;
 *  - active / past_due: até 3 dias depois do fim do período (ou sem data);
 *  - qualquer outro ('none', 'canceled', 'unpaid'): não.
 */
export function isLiveStatus(status: string | null | undefined, expiresAt: string | null | undefined, now = Date.now()): boolean {
  const exp = expiresAt ? new Date(expiresAt).getTime() : null;
  if (status === 'trial') return exp !== null && exp > now;
  if (status === 'active' || status === 'past_due') return exp === null || exp > now - RENEWAL_GRACE_MS;
  return false;
}

const isLive = (p: ProfileRow | null | undefined, now = Date.now()) => Boolean(p && isLiveStatus(p.subscription_status, p.subscription_expires_at, now));

// Plano e status que valem para o usuário: o próprio; se ele não tem assinatura valendo mas é membro
// de uma casa cujo dono tem, vale a do dono (o convidado não paga de novo). Só servidor (service role).
export async function getEntitlement(admin: SupabaseClient, userId: string): Promise<Entitlement | null> {
  const { data: own } = await admin.from('profiles').select(COLS).eq('id', userId).maybeSingle();
  if (!own) return null;
  // O dono do app (is_admin) sempre tem acesso, mesmo sem assinatura.
  if (own.is_admin === true) return { plan: own.subscription_plan ?? 'mensal', status: 'active', expiresAt: null, viaOwner: false };
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

// Acesso válido agora.
export function isEntitled(ent: Entitlement | null | undefined, now = Date.now()): boolean {
  return Boolean(ent && isLiveStatus(ent.status, ent.expiresAt, now));
}
