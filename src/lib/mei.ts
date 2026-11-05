// Regras do MEI (puras, sem acesso ao banco). Valores e datas conforme o Simples Nacional / Portal do Empreendedor:
// confirme com seu contador, pois podem mudar (há projeto de lei para elevar o limite, ainda não aprovado).

export const MEI_DEFAULT_LIMIT = 81000;

export type MeiActivity = "servicos" | "comercio" | "industria";
export const ACTIVITY_LABEL: Record<MeiActivity, string> = {
  servicos: "Prestação de serviços",
  comercio: "Comércio",
  industria: "Indústria",
};

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();

/** Meses de atividade no ano: 12, ou do mês de abertura (inclusive) até dezembro quando abriu no próprio ano. */
export function activeMonths(year: number, openedOn: string | null): number {
  if (!openedOn) return 12;
  const [y, m] = openedOn.split("-").map(Number);
  if (y > year) return 0;
  return y === year ? 13 - m : 12;
}

/** Limite do ano: o valor anual, proporcional aos meses de atividade no ano de abertura. */
export function limitForYear(year: number, annual: number, openedOn: string | null): number {
  return Math.round((annual / 12) * activeMonths(year, openedOn) * 100) / 100;
}

export type LimitLevel = "ok" | "atencao" | "perigo" | "excedido";
export type LimitStatus = { limit: number; revenue: number; pct: number; remaining: number; excess: number; excessPct: number; level: LimitLevel };

export function limitStatus(revenue: number, limit: number): LimitStatus {
  const pct = limit > 0 ? (revenue / limit) * 100 : 0;
  const level: LimitLevel = pct > 100 ? "excedido" : pct >= 90 ? "perigo" : pct >= 70 ? "atencao" : "ok";
  const excess = Math.max(revenue - limit, 0);
  return { limit, revenue, pct, remaining: Math.max(limit - revenue, 0), excess, excessPct: limit > 0 ? (excess / limit) * 100 : 0, level };
}

/** Receita projetada até dezembro, mantendo a média mensal dos meses de atividade já decorridos. */
export function projectYearRevenue(revenueSoFar: number, today: string, openedOn: string | null): number {
  const [y, m] = today.split("-").map(Number);
  const total = activeMonths(y, openedOn);
  const startMonth = openedOn && openedOn.slice(0, 4) === String(y) ? Number(openedOn.slice(5, 7)) : 1;
  const elapsed = Math.max(m - startMonth + 1, 1);
  if (total <= 0) return revenueSoFar;
  return Math.round((revenueSoFar / elapsed) * Math.min(total, 12) * 100) / 100;
}

/** Soma os 12 meses a partir da lista devolvida por mei_monthly(ano). */
export function monthlySeries(rows: { month: number; revenue: number; expenses: number }[]): { revenue: number[]; expenses: number[] } {
  const revenue = Array.from({ length: 12 }, () => 0);
  const expenses = Array.from({ length: 12 }, () => 0);
  rows.forEach((r) => {
    if (r.month >= 1 && r.month <= 12) { revenue[r.month - 1] = Number(r.revenue); expenses[r.month - 1] = Number(r.expenses); }
  });
  return { revenue, expenses };
}

export type Obligation = { key: "das" | "relatorio" | "dasn"; title: string; due: string; daysLeft: number; detail: string };

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Próximas obrigações do MEI a partir de `today` (AAAA-MM-DD), da mais próxima para a mais distante. */
export function meiObligations(today: string): Obligation[] {
  const [y, m, d] = today.split("-").map(Number);
  // dia 20: DAS e relatório do mês anterior; se já passou, o do mês seguinte
  const [dy, dm] = d <= 20 ? [y, m] : m === 12 ? [y + 1, 1] : [y, m + 1];
  const due20 = `${dy}-${pad(dm)}-20`;
  const prevIdx = (dm + 10) % 12; // índice do mês anterior ao do vencimento
  const prevName = MONTH_NAMES[prevIdx];
  // DASN-SIMEI: 31/05 (referente ao ano anterior); depois de maio, o do ano seguinte
  const dasnYear = m < 5 || (m === 5 && d <= 31) ? y : y + 1;
  const dasnDue = `${dasnYear}-05-31`;
  const list: Obligation[] = [
    { key: "das", title: "Pagar o DAS", due: due20, daysLeft: daysBetween(today, due20), detail: `Referente a ${prevName}. Vence todo dia 20 (se cair em fim de semana ou feriado, vai para o próximo dia útil).` },
    { key: "relatorio", title: "Relatório mensal de receitas brutas", due: due20, daysLeft: daysBetween(today, due20), detail: `Registro do faturamento de ${prevName}. Prazo: até o dia 20 do mês seguinte.` },
    { key: "dasn", title: "Declaração anual (DASN-SIMEI)", due: dasnDue, daysLeft: daysBetween(today, dasnDue), detail: `Informa o faturamento de ${dasnYear - 1}. Prazo: 31 de maio. É obrigatória mesmo sem faturamento.` },
  ];
  return list.sort((a, b) => a.daysLeft - b.daysLeft);
}

// ---------- Tipo de receita (DASN-SIMEI) ----------

/** Mesmos valores da atividade: a DASN pede a receita separada em comércio/indústria e serviços. */
export type RevenueKind = MeiActivity;
export const KIND_LABEL: Record<RevenueKind, string> = {
  comercio: "Comércio (revenda de mercadorias)",
  industria: "Indústria (produtos industrializados)",
  servicos: "Prestação de serviços",
};

export type YearSummary = { rev_comercio: number; rev_industria: number; rev_servicos: number; expenses: number; draws: number; das_paid: number };
export const EMPTY_SUMMARY: YearSummary = { rev_comercio: 0, rev_industria: 0, rev_servicos: 0, expenses: 0, draws: 0, das_paid: 0 };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Normaliza a linha da função mei_year_summary (o Postgres devolve numeric como texto). */
export function toSummary(row: Partial<Record<keyof YearSummary, number | string | null>> | null | undefined): YearSummary {
  const n = (v: number | string | null | undefined) => r2(Number(v ?? 0) || 0);
  if (!row) return { ...EMPTY_SUMMARY };
  return { rev_comercio: n(row.rev_comercio), rev_industria: n(row.rev_industria), rev_servicos: n(row.rev_servicos), expenses: n(row.expenses), draws: n(row.draws), das_paid: n(row.das_paid) };
}

export function dasnTotals(s: YearSummary) {
  const goods = r2(s.rev_comercio + s.rev_industria);
  return { goods, services: s.rev_servicos, total: r2(goods + s.rev_servicos) };
}

// ---------- Lucro e retiradas (pró-labore) ----------

/** Percentual de lucro presumido isento de IR para o MEI (8% comércio/indústria, 32% serviços). Confirme com o contador. */
export function presumedRate(kind: RevenueKind): number {
  return kind === "servicos" ? 0.32 : 0.08;
}

export type ProfitSummary = {
  revenue: number;
  expenses: number;
  profit: number;          // receita - despesas da empresa (retiradas não entram)
  margin: number;          // % do lucro sobre a receita
  draws: number;           // quanto já foi retirado
  realAvailable: number;   // lucro real ainda não retirado
  presumed: number;        // lucro presumido do ano (receita x percentual)
  exemptTotal: number;     // presumido - DAS pago: teto da retirada isenta sem escrituração contábil
  exemptAvailable: number; // quanto ainda dá para retirar nessa faixa
  needsAccounting: number; // parte do lucro real que só se retira como isenta com contabilidade
};

export function profitSummary(s: YearSummary): ProfitSummary {
  const revenue = r2(s.rev_comercio + s.rev_industria + s.rev_servicos);
  const profit = r2(revenue - s.expenses);
  const presumed = r2((s.rev_comercio + s.rev_industria) * presumedRate("comercio") + s.rev_servicos * presumedRate("servicos"));
  const exemptTotal = Math.max(r2(presumed - s.das_paid), 0);
  const realAvailable = Math.max(r2(profit - s.draws), 0);
  const exemptAvailable = Math.max(r2(exemptTotal - s.draws), 0);
  return {
    revenue, expenses: s.expenses, profit, margin: revenue > 0 ? r2((profit / revenue) * 100) : 0, draws: s.draws,
    realAvailable, presumed, exemptTotal, exemptAvailable,
    needsAccounting: Math.max(r2(realAvailable - exemptAvailable), 0),
  };
}

// ---------- Planejador do limite ----------

/** Faixa de tolerância: excesso de até 20% do limite no ano não desenquadra de imediato (paga-se a diferença do DAS). */
export const MEI_TOLERANCE = 0.2;

export type LimitPlan = {
  monthsLeft: number;        // meses que ainda faltam no ano, contando o atual
  perMonth: number;          // quanto dá para faturar por mês até dezembro sem passar do limite
  paceNow: number;           // média mensal até agora
  projected: number;         // fechamento do ano mantendo o ritmo
  toleranceLimit: number;    // limite + 20%
  toleranceLeft: number;     // quanto falta para o limite + 20%
  hitMonth: number | null;   // mês (1-12) em que o limite é atingido no ritmo atual; null se não atinge no ano
  status: "ok" | "ritmo_alto" | "no_limite" | "tolerancia" | "desenquadra";
};

export function planLimit(revenue: number, limit: number, today: string, openedOn: string | null): LimitPlan {
  const [y, m] = today.split("-").map(Number);
  const total = activeMonths(y, openedOn);
  const startMonth = openedOn && openedOn.slice(0, 4) === String(y) ? Number(openedOn.slice(5, 7)) : 1;
  const elapsed = Math.max(m - startMonth + 1, 1);
  const monthsLeft = Math.max(13 - m, 0);
  const remaining = Math.max(limit - revenue, 0);
  const paceNow = total > 0 ? r2(revenue / elapsed) : 0;
  const projected = total > 0 ? r2(paceNow * Math.min(total, 12)) : revenue;
  const toleranceLimit = r2(limit * (1 + MEI_TOLERANCE));

  let hitMonth: number | null = null;
  if (revenue >= limit) hitMonth = m;
  else if (paceNow > 0) {
    const monthsToHit = Math.ceil(remaining / paceNow); // contando o mês atual como já faturado até aqui
    const hit = m + monthsToHit;
    hitMonth = hit <= 12 ? hit : null;
  }

  let status: LimitPlan["status"] = "ok";
  if (revenue > toleranceLimit) status = "desenquadra";
  else if (revenue > limit) status = "tolerancia";
  else if (remaining <= limit * 0.05) status = "no_limite";
  else if (projected > limit) status = "ritmo_alto";

  return {
    monthsLeft,
    perMonth: monthsLeft > 0 ? r2(remaining / monthsLeft) : 0,
    paceNow, projected, toleranceLimit,
    toleranceLeft: Math.max(r2(toleranceLimit - revenue), 0),
    hitMonth, status,
  };
}

/** Mês de competência (AAAA-MM) do relatório que vence no dia 20 de `dueMonth` (AAAA-MM): o mês anterior. */
export function reportMonthFor(dueMonth: string): string {
  const [y, m] = dueMonth.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

/** Vencimento (dia 20) do mês `ym` já ajustado ao tamanho do mês (sempre existe) — usado ao criar a conta recorrente do DAS. */
export function dasDueDate(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const [dy, dm] = d <= 20 ? [y, m] : m === 12 ? [y + 1, 1] : [y, m + 1];
  return `${dy}-${pad(dm)}-${pad(Math.min(20, daysIn(dy, dm)))}`;
}
