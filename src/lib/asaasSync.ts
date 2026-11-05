import type { SupabaseClient } from '@supabase/supabase-js';
import { canonicalPlan, planFromValue } from '@/lib/plans';

// Sincroniza cobranças do Asaas -> public.billing_events (fonte da verdade do painel admin).
// Só LÊ do Asaas (GET). Usa ASAAS_REPORTS_API_KEY (chave só do painel); se não existir, cai para ASAAS_API_KEY.

const PAGE = 100; // máximo do Asaas
const PAID = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'] as const;
const REFUNDED = ['REFUNDED'] as const;

type AsaasPayment = {
  id: string; customer?: string; value?: number; netValue?: number | null; status?: string;
  dateCreated?: string; confirmedDate?: string | null; paymentDate?: string | null; clientPaymentDate?: string | null;
  deleted?: boolean;
};
type AsaasList = { data?: AsaasPayment[]; hasMore?: boolean; errors?: { description?: string }[] };

export type SyncResult = {
  ok: boolean; done: boolean; nextOffset?: number; scanned: number; inserted: number; feesFilled: number; error?: string;
};

export const asaasKey = () => process.env.ASAAS_REPORTS_API_KEY || process.env.ASAAS_API_KEY || '';
const asaasUrl = () => process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
// Data do Asaas (AAAA-MM-DD, horário de Brasília) -> instante ao meio-dia, para não cair no mês errado por fuso.
const at = (date: string | null | undefined) => (date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00-03:00` : new Date().toISOString());

// Descobre o plano pelo valor cobrado (Pessoal/Empresarial); se não bater (desconto, cupom, cobrança antiga do Família),
// usa o plano atual do perfil ('familia' vale como 'cpf').
function planOf(value: number, profilePlan: string | null): string | null {
  return planFromValue(value) ?? canonicalPlan(profilePlan) ?? profilePlan;
}

async function fetchPage(status: string, offset: number, dueFrom: string | null): Promise<AsaasList> {
  const qs = new URLSearchParams({ status, limit: String(PAGE), offset: String(offset) });
  if (dueFrom) qs.set('dueDate[ge]', dueFrom);
  const res = await fetch(`${asaasUrl()}/payments?${qs}`, {
    headers: { 'Content-Type': 'application/json', access_token: asaasKey() },
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => ({}))) as AsaasList;
  if (!res.ok) throw new Error(json.errors?.[0]?.description || `Asaas respondeu ${res.status}`);
  return json;
}

/**
 * full=true  -> todo o histórico (primeira vez).
 * full=false -> só cobranças com vencimento nos últimos 60 dias (conferência rápida).
 * `cursor` permite retomar se o tempo acabar: { s: índice do status, o: offset }.
 */
export async function syncAsaasPayments(
  admin: SupabaseClient,
  opts: { full: boolean; cursor?: { s: number; o: number }; budgetMs?: number },
): Promise<SyncResult & { cursor?: { s: number; o: number } }> {
  if (!asaasKey()) return { ok: false, done: true, scanned: 0, inserted: 0, feesFilled: 0, error: 'Chave do Asaas não configurada (ASAAS_REPORTS_API_KEY).' };

  const started = Date.now();
  const budget = opts.budgetMs ?? 45_000;
  const dueFrom = opts.full ? null : ymd(new Date(Date.now() - 60 * 86400000));
  const statuses = [...PAID.map((s) => ({ s, kind: 'paid' as const })), ...REFUNDED.map((s) => ({ s, kind: 'refunded' as const }))];

  let scanned = 0, inserted = 0, feesFilled = 0;
  let si = opts.cursor?.s ?? 0;
  let offset = opts.cursor?.o ?? 0;

  try {
    for (; si < statuses.length; si++, offset = 0) {
      const { s: status, kind } = statuses[si];
      for (;;) {
        if (Date.now() - started > budget) {
          return { ok: true, done: false, scanned, inserted, feesFilled, cursor: { s: si, o: offset } };
        }
        const page = await fetchPage(status, offset, dueFrom);
        const payments = (page.data ?? []).filter((p) => p.id && !p.deleted);
        scanned += payments.length;

        if (payments.length) {
          const customers = Array.from(new Set(payments.map((p) => p.customer).filter(Boolean))) as string[];
          const { data: profs } = await admin.from('profiles').select('id, asaas_customer_id, subscription_plan').in('asaas_customer_id', customers);
          const byCustomer = new Map((profs ?? []).map((p) => [p.asaas_customer_id as string, p]));

          // A conta do Asaas é compartilhada com outros projetos: só entram cobranças de clientes que são do Jakash.
          const mine = payments.filter((p) => p.customer && byCustomer.has(p.customer));
          const rows = mine.map((p) => {
            const prof = p.customer ? byCustomer.get(p.customer) : undefined;
            const value = Number(p.value) || 0;
            const when = kind === 'paid' ? (p.confirmedDate || p.paymentDate || p.clientPaymentDate || p.dateCreated) : (p.paymentDate || p.confirmedDate || p.dateCreated);
            return {
              user_id: prof?.id ?? null,
              asaas_customer_id: p.customer ?? null,
              payment_id: p.id,
              kind,
              plan: planOf(value, (prof?.subscription_plan as string | undefined) ?? null),
              amount: value,
              net_amount: kind === 'paid' && p.netValue != null ? Number(p.netValue) : null,
              occurred_at: at(when),
            };
          });

          // Insere só o que falta (o webhook pode já ter gravado: nesse caso a data dele é mantida).
          if (rows.length) {
            const { data: ins, error: insErr } = await admin
              .from('billing_events')
              .upsert(rows, { onConflict: 'payment_id,kind', ignoreDuplicates: true })
              .select('id');
            if (insErr) throw new Error(insErr.message);
            inserted += ins?.length ?? 0;
          }

          // Completa a taxa real (valor líquido) em eventos que o webhook gravou sem ela.
          if (kind === 'paid') {
            const withNet = rows.filter((r) => r.net_amount !== null);
            if (withNet.length) {
              const { data: missing } = await admin
                .from('billing_events').select('payment_id')
                .eq('kind', 'paid').is('net_amount', null).in('payment_id', withNet.map((r) => r.payment_id));
              for (const m of missing ?? []) {
                const r = withNet.find((x) => x.payment_id === m.payment_id);
                if (!r) continue;
                const { error } = await admin.from('billing_events').update({ net_amount: r.net_amount }).eq('payment_id', r.payment_id).eq('kind', 'paid');
                if (!error) feesFilled++;
              }
            }
          }
        }

        if (!page.hasMore || payments.length === 0 && (page.data ?? []).length === 0) break;
        offset += PAGE;
      }
    }
    return { ok: true, done: true, scanned, inserted, feesFilled };
  } catch (e) {
    return { ok: false, done: true, scanned, inserted, feesFilled, error: (e as Error).message };
  }
}
