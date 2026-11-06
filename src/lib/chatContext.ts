import type { SupabaseClient } from '@supabase/supabase-js';
import { cardUsed, dueDateFor, invoiceMonthFor, type InvoiceRow } from '@/lib/cards';
import { limitForYear, limitStatus, planLimit, profitSummary, toSummary } from '@/lib/mei';
import { MAINT_COLUMNS, SHIFT_COLUMNS, VEHICLE_COLUMNS, VEHICLE_KINDS, maintenanceCost, maintenanceTotal, normalizeMaintenance, normalizeShift, normalizeVehicle, plateLabel, shiftMetrics, summarize, withMaintenance } from '@/lib/driver';
import { listTotals, type ShopItem } from '@/lib/shopping';
import { coreOnlyFor, hiddenIds, type CatFull, type VisibilityRow } from '@/lib/categoryVisibility';

const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');

function monthsAgoStart(today: string, n: number): string {
  const [y, m] = today.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
}
function daysAgo(today: string, n: number): string {
  const [y, m, dd] = today.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, dd - n));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

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
  const twelveAgo = monthsAgoStart(today, 11);
  const [c, t, a, b, bd, g, d, k, s, iv, pf, vis, ds, sl, dm, hx, dv, dmAll, dsAll, sla] = await Promise.all([
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
    db.from('driver_shifts').select(SHIFT_COLUMNS).gte('date', start).lt('date', end).limit(400),
    db.from('shopping_lists').select('id,name,budget').eq('status', 'open').eq('is_business', false).order('created_at').limit(1),
    db.from('driver_maintenance').select(MAINT_COLUMNS).gte('date', start).lt('date', end).limit(400),
    // Para consultar qualquer menu sem abrir o relatório: histórico de 12 meses, veículos, toda a mecânica, turnos de 120 dias e as listas de supermercado recentes.
    db.from('transactions').select('amount,type,date,category_id').gte('date', twelveAgo).lt('date', end).limit(6000),
    db.from('driver_vehicles').select(VEHICLE_COLUMNS).order('created_at'),
    db.from('driver_maintenance').select(MAINT_COLUMNS).order('date', { ascending: false }).limit(150),
    db.from('driver_shifts').select(SHIFT_COLUMNS).gte('date', daysAgo(today, 120)).order('date', { ascending: false }).limit(300),
    db.from('shopping_lists').select('id,name,status,list_date,budget,transaction_id').eq('is_business', false).order('list_date', { ascending: false }).limit(20),
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
  const isMei = false as boolean; // app só pessoal desde 06/11/2026: a Jaki não recebe dados de MEI
  const mei = isMei && prof ? await meiContext(db, today, prof) : null;

  // Motorista: turnos do mês (só aparece para quem registrou turno).
  const shifts = ds.error ? [] : ((ds.data ?? []) as Record<string, unknown>[]).map(normalizeShift);
  const drv = shifts.length ? summarize(shifts) : null;
  const mech = dm.error ? 0 : maintenanceTotal(((dm.data ?? []) as Record<string, unknown>[]).map(normalizeMaintenance));
  if (drv) drv.total = withMaintenance(drv.total, mech);
  const motorista = drv ? {
    gasto_com_mecanica: mech,
    turnos_no_mes: drv.shifts, dias_trabalhados: drv.days, corridas: drv.total.trips, km: drv.total.km, horas: drv.total.hours,
    lucro_bruto: drv.total.gross, despesas: drv.total.expenses, lucro_liquido: drv.total.net,
    lucro_liquido_por_hora: drv.total.netPerHour, lucro_liquido_por_km: drv.total.netPerKm,
    por_plataforma: drv.byPlatform.map((p) => ({ plataforma: p.platform, lucro_bruto: p.metrics.gross, lucro_liquido: p.metrics.net })),
  } : null;

  // Supermercado: a lista aberta (o que falta pegar e a meta da compra).
  const list = sl.error ? null : ((sl.data ?? []) as { id: string; name: string; budget: number | string | null }[])[0] ?? null;
  let supermercado = null;
  if (list) {
    const it = await db.from('shopping_items').select('name,quantity,unit,est_price,checked').eq('list_id', list.id).limit(200);
    const rows = ((it.data ?? []) as Omit<ShopItem, 'id' | 'list_id' | 'created_by' | 'position'>[]).map((x) => ({ ...x, quantity: Number(x.quantity), est_price: x.est_price == null ? null : Number(x.est_price) }));
    if (rows.length) {
      const tt = listTotals(rows as ShopItem[]);
      supermercado = {
        meta_de_gasto: list.budget == null ? null : r2(Number(list.budget)),
        itens_na_lista: tt.total, ja_no_carrinho: tt.checked, total_do_carrinho: tt.cart,
        faltam_pegar: rows.filter((x) => !x.checked).slice(0, 30).map((x) => x.name),
      };
    }
  }

  // Histórico mensal (12 meses): receitas, despesas e as maiores categorias de cada mês.
  const hist = new Map<string, { receitas: number; despesas: number; cats: Record<string, number> }>();
  for (const x of (hx.error ? [] : (hx.data ?? [])) as { amount: number | string; type: 'income' | 'expense'; date: string; category_id: string | null }[]) {
    const key = x.date.slice(0, 7);
    const h = hist.get(key) ?? { receitas: 0, despesas: 0, cats: {} };
    const v = Number(x.amount);
    if (x.type === 'income') h.receitas += v; else { h.despesas += v; const n = rootName(x.category_id); h.cats[n] = (h.cats[n] ?? 0) + v; }
    hist.set(key, h);
  }
  const historico = Array.from(hist.entries()).sort((p, q) => q[0].localeCompare(p[0])).map(([mes, h]) => ({
    mes, receitas: r2(h.receitas), despesas: r2(h.despesas),
    maiores_categorias_de_despesa: Object.entries(h.cats).sort((p, q) => q[1] - p[1]).slice(0, 5).map(([nome, total]) => ({ nome, total: r2(total) })),
  }));

  // Veículos, mecânica e turnos (motorista), com o nome do veículo para a pessoa poder perguntar por ele.
  const vehicles = dv.error ? [] : ((dv.data ?? []) as Record<string, unknown>[]).map(normalizeVehicle);
  const vName = (id: string | null) => { const v = vehicles.find((x) => x.id === id); return v ? v.name : 'Veículo removido'; };
  const maintAll = dmAll.error ? [] : ((dmAll.data ?? []) as Record<string, unknown>[]).map(normalizeMaintenance);
  const shiftsAll = dsAll.error ? [] : ((dsAll.data ?? []) as Record<string, unknown>[]).map(normalizeShift);
  const garagem = vehicles.length ? {
    veiculos: vehicles.filter((v) => !v.archived).map((v) => ({ nome: v.name, tipo: VEHICLE_KINDS[v.kind], placa: v.plate ? plateLabel(v.plate) : null })),
    manutencoes_registradas: maintAll.map((m) => ({
      veiculo: vName(m.vehicle_id), data: m.date, mecanica: m.shop, valor_da_peca: m.part_cost, mao_de_obra: m.labor_cost, total: maintenanceCost(m),
      onde_a_peca_foi_comprada: m.bought_at, km_do_veiculo: m.km, ...(m.part && m.part !== 'Manutenção' ? { peca: m.part } : {}),
    })),
    turnos_dos_ultimos_120_dias: shiftsAll.map((sh) => { const m = shiftMetrics(sh); return { data: sh.date, veiculo: vName(sh.vehicle_id), lucro_bruto: m.gross, despesas: m.expenses, lucro_liquido: m.net, km: m.km }; }),
  } : null;

  // Supermercado: as últimas listas (nome, data, meta, gasto e o que foi pego ou faltou).
  const lists = sla.error ? [] : ((sla.data ?? []) as { id: string; name: string; status: string; list_date: string; budget: number | string | null; transaction_id: string | null }[]);
  let listas_de_supermercado: unknown[] | null = null;
  if (lists.length) {
    const ids = lists.map((l) => l.id);
    const txIds = lists.map((l) => l.transaction_id).filter((x): x is string => Boolean(x));
    const [li, lt] = await Promise.all([
      db.from('shopping_items').select('list_id,name,quantity,est_price,checked').in('list_id', ids).limit(800),
      txIds.length ? db.from('transactions').select('id,amount').in('id', txIds) : Promise.resolve({ data: [], error: null }),
    ]);
    const paid = new Map(((lt.data ?? []) as { id: string; amount: number | string }[]).map((x) => [x.id, Number(x.amount)]));
    const itemsBy = new Map<string, { name: string; quantity: number; est_price: number | null; checked: boolean }[]>();
    for (const x of (li.error ? [] : (li.data ?? [])) as { list_id: string; name: string; quantity: number | string; est_price: number | string | null; checked: boolean }[]) {
      const arr = itemsBy.get(x.list_id) ?? [];
      arr.push({ name: x.name, quantity: Number(x.quantity), est_price: x.est_price == null ? null : Number(x.est_price), checked: x.checked });
      itemsBy.set(x.list_id, arr);
    }
    listas_de_supermercado = lists.map((l) => {
      const its = itemsBy.get(l.id) ?? [];
      const cart = r2(its.filter((i) => i.checked).reduce((s2, i) => s2 + (i.est_price ?? 0) * i.quantity, 0));
      return {
        nome: l.name, data: l.list_date, situacao: l.status === 'done' ? 'finalizada' : 'em andamento',
        meta_de_gasto: l.budget == null ? null : r2(Number(l.budget)),
        gasto: l.transaction_id && paid.has(l.transaction_id) ? r2(paid.get(l.transaction_id)!) : cart,
        itens_pegos: its.filter((i) => i.checked).slice(0, 40).map((i) => i.name),
        itens_que_faltaram: its.filter((i) => !i.checked).slice(0, 40).map((i) => i.name),
      };
    });
  }

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
    historico_mensal_12_meses: historico,
    ...(garagem ? { motorista_veiculos_manutencoes_e_turnos: garagem } : {}),
    ...(listas_de_supermercado ? { supermercado_listas_recentes: listas_de_supermercado } : {}),
    ...(motorista ? { motorista_de_app_no_mes: motorista } : {}),
    ...(supermercado ? { supermercado_lista_aberta: supermercado } : {}),
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
