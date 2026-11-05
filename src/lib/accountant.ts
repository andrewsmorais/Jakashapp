// Acesso de leitura para o contador por link com validade. Só o hash do token fica no banco; o link completo aparece uma única vez.
// Uso exclusivo de servidor (usa a service role). O link mostra APENAS os lançamentos marcados como da empresa.
import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { KIND_LABEL, limitForYear, limitStatus, monthlySeries, type LimitStatus, type RevenueKind } from '@/lib/mei';

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const LINK_DEFAULT_DAYS = 30;
export const LINK_MAX_ACTIVE = 5;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

export type AccountantTx = { date: string; description: string; type: 'income' | 'expense'; amount: number; category: string; kind: RevenueKind | null; draw: boolean };
export type AccountantView = {
  year: number;
  label: string | null;
  expiresAt: string;
  owner: { name: string; businessName: string; cnpj: string; activity: string };
  limit: LimitStatus;
  monthly: { month: number; revenue: number; expenses: number }[];
  tx: AccountantTx[];
};
export type ViewResult = { status: 'ok'; view: AccountantView } | { status: 'invalid' | 'expired' | 'revoked' };

export async function loadAccountantView(admin: SupabaseClient, token: string, year: number): Promise<ViewResult> {
  if (!TOKEN_RE.test(token)) return { status: 'invalid' };
  const { data: link } = await admin.from('accountant_links').select('id,user_id,label,expires_at,revoked_at').eq('token_hash', hashToken(token)).maybeSingle();
  if (!link) return { status: 'invalid' };
  if (link.revoked_at) return { status: 'revoked' };
  if (new Date(link.expires_at).getTime() < Date.now()) return { status: 'expired' };
  await admin.from('accountant_links').update({ last_seen_at: new Date().toISOString() }).eq('id', link.id);

  const uid = link.user_id as string;
  const [p, t] = await Promise.all([
    admin.from('profiles').select('full_name,business_name,business_cnpj,mei_activity,mei_opened_on,mei_annual_limit').eq('id', uid).maybeSingle(),
    admin.from('transactions').select('date,description,amount,type,category_id,revenue_kind,is_owner_draw').eq('user_id', uid).eq('is_business', true)
      .gte('date', `${year}-01-01`).lt('date', `${year + 1}-01-01`).order('date', { ascending: true }).limit(5000),
  ]);
  const rows = t.data ?? [];
  const catIds = Array.from(new Set(rows.map((r) => r.category_id).filter(Boolean))) as string[];
  const cats = catIds.length ? (await admin.from('categories').select('id,name').in('id', catIds)).data ?? [] : [];
  const catName: Record<string, string> = {};
  cats.forEach((c) => { catName[c.id] = c.name; });

  const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, revenue: 0, expenses: 0 }));
  rows.forEach((r) => {
    const m = Number(String(r.date).slice(5, 7)) - 1;
    if (r.type === 'income') monthly[m].revenue += Number(r.amount); else if (!r.is_owner_draw) monthly[m].expenses += Number(r.amount);
  });
  const series = monthlySeries(monthly);
  const revenue = series.revenue.reduce((a, b) => a + b, 0);
  const prof = p.data;
  const limit = limitStatus(revenue, limitForYear(year, Number(prof?.mei_annual_limit ?? 81000), prof?.mei_opened_on ?? null));

  return {
    status: 'ok',
    view: {
      year,
      label: link.label ?? null,
      expiresAt: link.expires_at,
      owner: { name: prof?.full_name ?? '', businessName: prof?.business_name ?? '', cnpj: prof?.business_cnpj ?? '', activity: prof?.mei_activity ?? 'servicos' },
      limit,
      monthly: monthly.map((m) => ({ month: m.month, revenue: Math.round(m.revenue * 100) / 100, expenses: Math.round(m.expenses * 100) / 100 })),
      tx: rows.map((r) => ({ date: r.date, description: r.description, type: r.type, amount: Number(r.amount), category: r.category_id ? catName[r.category_id] ?? '' : '', kind: (r.revenue_kind as RevenueKind | null) ?? null, draw: Boolean(r.is_owner_draw) })),
    },
  };
}

// CSV para abrir direto no Excel brasileiro (separador ";", decimal com vírgula, UTF-8 com BOM).
// Texto que começaria com = + - @ ganha um apóstrofo para não virar fórmula na planilha.
const cell = (v: string) => {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const num = (n: number) => n.toFixed(2).replace('.', ',');

export function accountantCsv(view: AccountantView): string {
  const head = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Tipo de receita', 'Valor (R$)'].join(';');
  const lines = view.tx.map((t) => {
    const [y, m, d] = t.date.split('-');
    const kind = t.type === 'income' ? KIND_LABEL[t.kind ?? (view.owner.activity as RevenueKind)] ?? '' : '';
    return [`${d}/${m}/${y}`, t.type === 'income' ? 'Receita' : t.draw ? 'Retirada' : 'Despesa', cell(t.description), cell(t.category), cell(kind), num(t.amount)].join(';');
  });
  return '﻿' + [head, ...lines].join('\r\n') + '\r\n';
}
