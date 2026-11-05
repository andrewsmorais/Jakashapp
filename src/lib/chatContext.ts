import type { SupabaseClient } from '@supabase/supabase-js';
import { cardUsed, dueDateFor, invoiceMonthFor, type InvoiceRow } from '@/lib/cards';
import { limitForYear, limitStatus, planLimit, profitSummary, toSummary } from '@/lib/mei';
import { coreOnlyFor, hiddenIds, type CatFull, type VisibilityRow } from '@/lib/categoryVisibility';

const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');

function bounds(today: string) {
  const [y, m] = today.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, 1));
  const prev = new Date(Date.UTC(y, m - 2, 1));
  const soon = new Date(Date.UTC(y, m - 1, Number(today.slice(8, 10)) + 30));
  return {
    start: `${y}-${pad(m)}-01`,
    end: `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-01`,
    prevStart: `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-01`,
    in30: `${soon.getUTCFullYear()}-${pad(soon.getUTCMonth() + 1)}-${pad(soon.getUTCDate())}`,
  };
}

type Cat = { id: string; name: string; type: 'income' | 'expense'; parent_id: string | null };
type Tx = { description: string; amount: number | string; type: 'income' | 'expense'; date: string; category_id: string | null };

// Resumo compacto das finanças do usuário (com a sessão dele, então respeita o RLS e a gestão compartilhada).
// `who` (opcional): para a Jaki só sugerir as categorias que a pessoa deixou à mostra em Categorias.
export async function buildChatContext(db: SupabaseClient, today: string, who?: { userId: string; createdAt?: string | null }) {
  const { start, end, prevStart, in30 } = bounds(today);
  const [c, t, a, b, bd, g, d, k, s, iv, pf, vis] = await Promise.all([
    db.from('categories').select('id,name,type,parent_id,is_default,user_id'),
    db.from('transactions').select('description,amount,type,date,category_id').gte('date', prevStart).lt('date', end).order('date', { ascending: false }).limit(1500),
    db.rpc('account_balances'),
    db.from('bills').select('description,amount,due_date,type').eq('status', 'pending').lte('due_date', in30).order('due_date').limit(15),
    db.from('budgets').select('category_id,amount_limit'),
    db.from('goals').select('name,target_amount,current_amount').eq('status', 'in_progress').limit(10),
    db.from('debts').select('name,balance,monthly_rate').eq('archived', false).limit(10),
    db.from('credit_cards').select('id,name,credit_limit,closing_day,due_day').eq('archived', false).eq('kind', 'credito'),
    db.rpc('card_invoice_summary'),
    db.from('investments').select('name,kind,invested,current_value').eq('archived', false).limit(15),
    db.from('profiles').select('usage_type,mei_activity,mei_opened_on,mei_annual_limit').maybeSingle(),
    who ? db.from('category_visibility').select('category_id,hidden') : Promise.resolve({ data: [], error: null }),
  ]);

  const cats = (c.data ?? []) as Cat[];
  const byId = new Map(cats.map((x) => [x.id, x]));
  const rootName = (id: string | null) => {
    if (!id) return 'Sem categoria';
    const x = byId.get(id);
    if (!x) return 'Outros';
    return x.parent_id ? byId.get(x.parent_id)?.name ?? x.name : x.name;
  };
  const rootOf = (id: string | null) => (id ? byId.get(id)?.parent_id ?? id : null);

  const txs = ((t.data ?? []) as Tx[]).map((x) => ({ ...x, amount: Number(x.amount) }));
  const cur = txs.filter((x) => x.date >= start);
  const prev = txs.filter((x) => x.date < start);
  const sum = (rows: typeof txs, type: 'income' | 'expense') => r2(rows.filter((x) => x.type === type).reduce((s2, x) => s2 + x.amount, 0));

  const byCategory: Record<string, number> = {};
  for (const x of cur) if (x.type === 'expense') byCategory[rootName(x.category_id)] = (byCategory[rootName(x.category_id)] ?? 0) + x.amount;
  const topCategories = Object.entries(byCategory).sort((p, q) => q[1] - p[1]).slice(0, 8).map(([nome, total]) => ({ nome, total: r2(total) }));

  const accounts = ((a.data ?? []) as { name: string; balance: number | string }[]).map((x) => ({ nome: x.name, saldo: r2(Number(x.balance)) }));

  const spentByRoot: Record<string, number> = {};
  for (const x of cur) if (x.type === 'expense') { const r = rootOf(x.category_id); if (r) spentByRoot[r] = (spentByRoot[r] ?? 0) + x.amount; }
  const budgets = ((bd.data ?? []) as { category_id: string | null; amount_limit: number | string }[]).map((x) =>
    x.category_id
      ? { categoria: rootName(x.category_id), limite: r2(Number(x.amount_limit)), gasto: r2(spentByRoot[x.category_id] ?? 0) }
      : { categoria: 'GERAL (todas as despesas)', limite: r2(Number(x.amount_limit)), gasto: sum(cur, 'expense') }
  );

  const summary = ((s.data ?? []) as { card_id: string; invoice_month: string; total: number | string; paid: number | string }[])
    .map((x): InvoiceRow => ({ card_id: x.card_id, invoice_month: x.invoice_month, total: Number(x.total), paid: Number(x.paid) }));
  const cards = ((k.data ?? []) as { id: string; name: string; credit_limit: number | string; closing_day: number; due_day: number }[]).map((card) => {
    const im = invoiceMonthFor(card, today);
    const row = summary.find((x) => x.card_id === card.id && x.invoice_month === im);
    const limit = Number(card.credit_limit);
    const used = cardUsed(summary, card.id);
    return {
      nome: card.name,
      fatura_atual: r2(row?.total ?? 0),
      vencimento_da_fatura_atual: dueDateFor(card, im),
      limite: r2(limit),
      limite_usado: r2(used),
      limite_disponivel: limit > 0 ? r2(Math.max(limit - used, 0)) : null,
    };
  });

  const investments = ((iv.data ?? []) as { name: string; kind: string; invested: number | string; current_value: number | string }[]).map((x) => ({
    nome: x.name, tipo: x.kind, aportado: r2(Number(x.invested)), valor_atual: r2(Number(x.current_value)),
  }));

  // Categorias escondidas pela pessoa não entram na lista que a Jaki usa para sugerir (os nomes antigos continuam no histórico).
  const hidden = who && !vis.error
    ? hiddenIds(cats as CatFull[], (vis.data ?? []) as VisibilityRow[], coreOnlyFor(who.createdAt), who.userId)
    : new Set<string>();
  const roots = (type: 'income' | 'expense') => cats.filter((x) => x.type === type && !x.parent_id && !hidden.has(x.id)).map((x) => x.name);

  const prof = pf.data as { usage_type: string; mei_activity: string; mei_opened_on: string | null; mei_annual_limit: number | string } | null;
  const isMei = prof?.usage_type === 'empresarial' || prof?.usage_type === 'ambos';
  const mei = isMei && prof ? await meiContext(db, today, prof) : null;

  return {
    hoje: today,
    CATEGORIAS: { despesa: roots('expense'), receita: roots('income') },
    contas: accounts,
    saldo_total_das_contas: r2(accounts.reduce((s2, x) => s2 + x.saldo, 0)),
    mes_atual: { receitas: sum(cur, 'income'), despesas: sum(cur, 'expense'), maiores_categorias_de_despesa: topCategories },
    mes_anterior: { receitas: sum(prev, 'income'), despesas: sum(prev, 'expense') },
    ultimos_lancamentos: cur.slice(0, 8).map((x) => ({ data: x.date, descricao: x.description, valor: r2(x.amount), tipo: x.type, categoria: rootName(x.category_id) })),
    contas_a_pagar_ou_receber_ate_30_dias: ((b.data ?? []) as { description: string; amount: number | string; due_date: string; type: string }[])
      .map((x) => ({ descricao: x.description, valor: r2(Number(x.amount)), vencimento: x.due_date, tipo: x.type })),
    limites_de_gasto: budgets,
    objetivos: ((g.data ?? []) as { name: string; target_amount: number | string; current_amount: number | string }[])
      .map((x) => ({ nome: x.name, meta: r2(Number(x.target_amount)), guardado: r2(Number(x.current_amount ?? 0)) })),
    dividas: ((d.data ?? []) as { name: string; balance: number | string; monthly_rate: number | string }[])
      .map((x) => ({ nome: x.name, saldo_devedor: r2(Number(x.balance)), juros_ao_mes_pct: Number(x.monthly_rate) })),
    cartoes_de_credito: cards,
    investimentos: investments,
    ...(mei ? { mei } : {}),
  };
}

// Números do Pacote MEI (só para quem usa o app para a empresa). Usa as mesmas regras da tela /mei.
async function meiContext(db: SupabaseClient, today: string, prof: { mei_activity: string; mei_opened_on: string | null; mei_annual_limit: number | string }) {
  const year = Number(today.slice(0, 4));
  const { data } = await db.rpc('mei_year_summary', { p_year: year });
  const sum = toSummary(((data ?? []) as Parameters<typeof toSummary>[0][])[0]);
  const limit = limitForYear(year, Number(prof.mei_annual_limit ?? 81000), prof.mei_opened_on ?? null);
  const p = profitSummary(sum);
  const st = limitStatus(p.revenue, limit);
  const plan = planLimit(p.revenue, limit, today, prof.mei_opened_on ?? null);
  return {
    atividade_principal: prof.mei_activity,
    limite_de_faturamento_do_ano: r2(limit),
    receita_da_empresa_no_ano: p.revenue,
    percentual_do_limite_usado: r2(st.pct),
    restante_do_limite: r2(st.remaining),
    receita_por_tipo: { comercio: sum.rev_comercio, industria: sum.rev_industria, servicos: sum.rev_servicos },
    despesas_da_empresa_no_ano: p.expenses,
    lucro_no_ano: p.profit,
    retiradas_ja_feitas: p.draws,
    retirada_isenta_disponivel: p.exemptAvailable,
    pode_faturar_por_mes_ate_dezembro: plan.perMonth,
    ritmo_atual_por_mes: plan.paceNow,
    faixa_de_tolerancia_20_por_cento_ate: plan.toleranceLimit,
  };
}
