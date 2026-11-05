// Cálculos do painel admin. Funções puras: recebem o JSON de public.admin_period() e devolvem números prontos.
//
// Definições (as mesmas mostradas no painel):
//  - Receita            = pagamentos confirmados no período (eventos do webhook do Asaas)
//  - Custos diretos     = taxas de pagamento + Vercel + Supabase + IA
//  - Lucro bruto        = receita - reembolsos - custos diretos
//  - Custo operacional  = tudo que foi lançado, menos impostos (diretos + domínio + outros)
//  - Lucro líquido      = lucro bruto - domínio - outros - impostos

export type CostRow = {
  month: string; vercel: number; supabase: number; ai: number;
  domain: number; payment_fees: number; taxes: number; other: number; notes: string | null;
};

export type PeriodTotals = {
  revenue: number; revenue_cpf: number; revenue_mei: number;
  refunds: number; payments: number; new_customers: number; churned: number;
  fees: number; fees_known: number; payers: number;
};

export type SeriesBucket = {
  bucket: string; from: string; to: string; totals: PeriodTotals;
};

export type SyncState = {
  last_sync_at: string | null; last_full_sync_at: string | null;
  last_result: { scanned: number; inserted: number; feesFilled: number } | null;
} | null;

export type RawPeriod = {
  from: string; to: string; days: number; grain: 'day' | 'month';
  totals: PeriodTotals; prev: { from: string; to: string; totals: PeriodTotals };
  series: SeriesBucket[]; costs: CostRow[]; costs_prev: CostRow[];
};

// Uma linha por plano: pagantes (ativos + em atraso), em teste e o que foi vendido no período escolhido.
export type PlanRow = { plan: string; label: string; subscribers: number; trial: number; revenuePeriod: number };

export type CurrentMetrics = {
  paying: number; trial: number; active: number; pastDue: number; canceled: number;
  mrr: number; arr: number;
  byPlan: PlanRow[];
};

export type PeriodFinance = PeriodTotals & {
  directCosts: number; operatingCost: number; grossProfit: number; netProfit: number;
};

export type SeriesPoint = PeriodFinance & { from: string };

export type Dashboard = {
  from: string; to: string; days: number; grain: 'day' | 'month';
  current: PeriodFinance;
  previous: PeriodFinance;
  series: SeriesPoint[];
  costs: CostRow[];
  sync: SyncState;
  // "Now" metrics (current snapshot, independent of period):
  paying: number; trial: number; active: number; pastDue: number;
  canceled: number;
  byPlan: PlanRow[];
  mrr: number; arr: number; arpu: number;
  churnRate: number; ltv: number | null;
};

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
export const r2 = (x: number): number => Math.round(x * 100) / 100;

export const PLAN_LABEL: Record<string, string> = {
  cpf: 'Jakash Pessoal', mei: 'Jakash Empresarial', cnpj: 'CNPJ (legado)', zap: 'Zap (teste)', piloto: 'Piloto',
};

/** Prorate costs (Vercel, Supabase, etc.) to a fraction of a month. */
function prorateMonthCosts(cost: CostRow, fromDate: string, toDate: string): Partial<CostRow> {
  if (!cost) return {};
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const daysInPeriod = Math.ceil((to.getTime() - from.getTime()) / 86400000) + 1;
  const daysInMonth = 30; // approximation
  const ratio = daysInPeriod / daysInMonth;
  return {
    vercel: n(cost.vercel) * ratio,
    supabase: n(cost.supabase) * ratio,
    ai: n(cost.ai) * ratio,
    payment_fees: n(cost.payment_fees) * ratio,
    taxes: n(cost.taxes) * ratio,
    domain: n(cost.domain) * ratio, // domain is fixed, prorate too
    other: n(cost.other) * ratio,
  };
}

function finance(totals: PeriodTotals, costs: CostRow[], fromDate: string, toDate: string): PeriodFinance {
  // Sum all prorated costs in the period
  const costSum: Partial<CostRow> = {};
  for (const cost of costs) {
    const prorated = prorateMonthCosts(cost, fromDate, toDate);
    costSum.vercel = (costSum.vercel ?? 0) + (prorated.vercel ?? 0);
    costSum.supabase = (costSum.supabase ?? 0) + (prorated.supabase ?? 0);
    costSum.ai = (costSum.ai ?? 0) + (prorated.ai ?? 0);
    costSum.payment_fees = (costSum.payment_fees ?? 0) + (prorated.payment_fees ?? 0);
    costSum.taxes = (costSum.taxes ?? 0) + (prorated.taxes ?? 0);
    costSum.domain = (costSum.domain ?? 0) + (prorated.domain ?? 0);
    costSum.other = (costSum.other ?? 0) + (prorated.other ?? 0);
  }

  // Taxa automática (vem do Asaas) tem prioridade sobre o valor lançado à mão.
  const fees = n(totals.fees_known) > 0 ? n(totals.fees) : n(costSum.payment_fees);
  const direct = fees + n(costSum.vercel) + n(costSum.supabase) + n(costSum.ai);
  const other = n(costSum.domain) + n(costSum.other);
  const revenue = n(totals.revenue);
  const refunds = n(totals.refunds);
  const gross = revenue - refunds - direct;

  return {
    revenue: r2(revenue),
    revenue_cpf: r2(n(totals.revenue_cpf)),
    revenue_mei: r2(n(totals.revenue_mei)),
    refunds: r2(refunds),
    payments: n(totals.payments),
    new_customers: n(totals.new_customers),
    churned: n(totals.churned),
    fees: r2(fees),
    fees_known: n(totals.fees_known),
    payers: n(totals.payers),
    directCosts: r2(direct),
    operatingCost: r2(direct + other),
    grossProfit: r2(gross),
    netProfit: r2(gross - other - n(costSum.taxes)),
  };
}

export function buildDashboard(raw: RawPeriod, current: CurrentMetrics, sync: SyncState): Dashboard {
  // Main period calculations
  const cur = finance(raw.totals, raw.costs, raw.from, raw.to);
  const prev = finance(raw.prev.totals, raw.costs_prev, raw.prev.from, raw.prev.to);

  // Series for charts
  const series = raw.series.map((bucket) => {
    const [from, to] = [bucket.from, bucket.to];
    const costForPeriod = raw.costs.filter((c) => c.month >= from && c.month <= to);
    return { ...finance(bucket.totals, costForPeriod, from, to), from } as SeriesPoint;
  });

  // Current-state metrics (snapshot, not period-based)
  const paying = current.paying;
  const arpu = paying > 0 ? r2(current.mrr / paying) : 0;
  const base = paying + cur.churned;
  const churnRate = base > 0 ? r2(((cur.churned / base) * 100)) : 0;
  const ltv = churnRate > 0 ? r2(arpu / (churnRate / 100)) : null;

  return {
    from: raw.from,
    to: raw.to,
    days: raw.days,
    grain: raw.grain,
    current: cur,
    previous: prev,
    series,
    costs: raw.costs,
    sync,
    paying: current.paying,
    trial: current.trial,
    active: current.active,
    pastDue: current.pastDue,
    canceled: current.canceled,
    byPlan: current.byPlan,
    mrr: current.mrr,
    arr: r2(current.mrr * 12),
    arpu,
    churnRate,
    ltv,
  };
}
