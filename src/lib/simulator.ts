// Simulador (Ferramentas > Simulador). Só contas, feitas aqui em código com os números que a pessoa digita:
// nada é enviado a banco ou corretora, e o app não movimenta dinheiro. Conteúdo educativo, não é recomendação.
//
// Convenções:
//  - taxas em decimal ao mês (0,01 = 1% ao mês);
//  - depósitos e parcelas no FIM de cada mês (a primeira parcela/depósito vence daqui a 1 mês);
//  - financiamento na tabela Price (parcelas iguais).

const r2 = (n: number) => Math.round(n * 100) / 100;
const clean = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

// ---------------------------------------------------------------- taxas e datas

/** "% ao mês" ou "% ao ano" (equivalente: (1 + a)^(1/12) − 1) -> decimal ao mês. Vazio ou inválido = 0. */
export function monthlyRateFrom(pct: number, unit: "mes" | "ano"): number {
  const p = clean(pct) / 100;
  if (p === 0) return 0;
  return unit === "ano" ? Math.pow(1 + p, 1 / 12) - 1 : p;
}

/** Taxa ao mês (decimal) -> % ao ano equivalente. */
export const yearlyPctFrom = (monthly: number): number => (Math.pow(1 + clean(monthly), 12) - 1) * 100;

/** Quantos depósitos mensais cabem de hoje até a data (AAAA-MM ou AAAA-MM-DD). Ex.: hoje 06/11/2026 e meta 2027-11 -> 12. */
export function monthsUntil(todayISO: string, target: string): number {
  const [y1, m1, d1] = todayISO.split("-").map(Number);
  const [y2, m2, d2raw] = target.split("-").map(Number);
  if (![y1, m1, y2, m2].every(Number.isFinite)) return 0;
  const d2 = Number.isFinite(d2raw) ? d2raw : 31; // só mês/ano: conta até o fim do mês
  const m = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  return Math.max(m, 0);
}

/** AAAA-MM daqui a `n` meses. */
export function addMonthsYM(todayISO: string, n: number): string {
  const [y, m] = todayISO.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- guardar dinheiro

export type SaveResult = { total: number; deposited: number; interest: number };

/** Quanto vou ter: `initial` hoje + `monthly` no fim de cada um dos `months` meses, rendendo `rate` ao mês. */
export function futureValue(initial: number, monthly: number, months: number, rate: number): SaveResult {
  const P = clean(initial), A = clean(monthly), r = clean(rate);
  const n = Math.max(0, Math.floor(months));
  const g = Math.pow(1 + r, n);
  const total = r === 0 ? P + A * n : P * g + A * ((g - 1) / r);
  const deposited = P + A * n;
  return { total: r2(total), deposited: r2(deposited), interest: r2(total - deposited) };
}

/** Quanto preciso guardar por mês para chegar em `target` em `months` meses. 0 = já tem o suficiente; null = prazo inválido. */
export function monthlyNeeded(target: number, initial: number, months: number, rate: number): number | null {
  const T = clean(target), P = clean(initial), r = clean(rate);
  const n = Math.floor(months);
  if (n <= 0) return null;
  const g = Math.pow(1 + r, n);
  const gap = T - P * g;
  if (gap <= 0) return 0;
  return r2(r === 0 ? gap / n : (gap * r) / (g - 1));
}

/** Em quantos meses chego em `target` guardando `monthly`. 0 = já chegou; null = não chega em 100 anos. */
export function monthsToReach(target: number, initial: number, monthly: number, rate: number): number | null {
  const T = clean(target), A = clean(monthly), r = clean(rate);
  let bal = clean(initial);
  if (bal >= T) return 0;
  for (let n = 1; n <= 1200; n++) {
    bal = bal * (1 + r) + A;
    if (bal >= T - 0.005) return n;
  }
  return null;
}

// ---------------------------------------------------------------- objetivo com o custo de cada item

export type CostItem = { label: string; value: number };

/** Soma dos itens + folga para imprevistos (em %). */
export function goalCost(items: CostItem[], bufferPct: number): { subtotal: number; buffer: number; total: number } {
  const subtotal = r2(items.reduce((s, i) => s + clean(i.value), 0));
  const buffer = r2(subtotal * (Math.min(clean(bufferPct), 100) / 100));
  return { subtotal, buffer, total: r2(subtotal + buffer) };
}

/** Itens sugeridos por tipo de objetivo. Os VALORES ficam em branco: quem preenche é a pessoa (o app não inventa preços). */
export const GOAL_ITEMS: Record<string, string[]> = {
  viagem: ["Passagens ou combustível", "Hospedagem", "Alimentação", "Passeios e ingressos", "Seguro viagem"],
  bebe: ["Pré-natal e consultas", "Parto", "Enxoval", "Quarto e móveis", "Fraldas e higiene (primeiros meses)"],
  casamento: ["Cerimônia", "Festa e buffet", "Roupas", "Fotos e vídeo", "Lua de mel"],
  carro: ["Entrada", "Documentação e transferência", "Seguro", "Primeira revisão"],
  imovel: ["Entrada", "Escritura e registro", "Mudança", "Móveis"],
  curso: ["Mensalidades", "Material", "Inscrição"],
  reforma: ["Material", "Mão de obra", "Móveis e acabamento"],
  reserva: ["Despesas essenciais de um mês"],
  custom: [],
};

// ---------------------------------------------------------------- financiamento (tabela Price)

/** Parcela da tabela Price. */
export function pricePayment(principal: number, n: number, rate: number): number {
  const P = clean(principal), i = clean(rate), k = Math.floor(n);
  if (k <= 0) return 0;
  if (i === 0) return r2(P / k);
  return r2((P * i) / (1 - Math.pow(1 + i, -k)));
}

/** Valor presente de `n` parcelas iguais (o saldo devedor na Price). */
export function presentValue(payment: number, n: number, rate: number): number {
  const A = clean(payment), i = clean(rate), k = Math.max(0, Math.floor(n));
  if (i === 0) return A * k;
  return A * ((1 - Math.pow(1 + i, -k)) / i);
}

/**
 * Juros ao mês embutidos num contrato: valor financiado, número de parcelas e valor da parcela.
 * null = dados que não fecham (ex.: parcelas somando menos que o valor financiado). 0 = sem juros.
 */
export function impliedRate(principal: number, n: number, payment: number): number | null {
  const P = clean(principal), A = clean(payment), k = Math.floor(n);
  if (P <= 0 || A <= 0 || k <= 0) return null;
  const total = A * k;
  if (Math.abs(total - P) < 0.01) return 0;
  if (total < P) return null;
  let lo = 0, hi = 1; // até 100% ao mês
  if (presentValue(A, k, hi) > P) return null;
  for (let it = 0; it < 200; it++) {
    const mid = (lo + hi) / 2;
    if (presentValue(A, k, mid) > P) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export type Prepay = {
  /** Parcelas adiantadas (sempre as ÚLTIMAS do contrato). */
  count: number;
  /** Quanto pagaria hoje para quitar essas parcelas (valor presente). */
  payNow: number;
  /** Quanto essas parcelas somam pelo valor cheio. */
  nominal: number;
  /** Juros que deixa de pagar (nominal − payNow). */
  savings: number;
  /** Parcelas que continuam (as próximas, no valor normal). */
  remainingAfter: number;
};

/** Custo de hoje para adiantar as `k` últimas de `remaining` parcelas (a próxima vence em 1 mês). */
function lastKCost(payment: number, remaining: number, rate: number, k: number): number {
  let s = 0;
  for (let t = remaining - k + 1; t <= remaining; t++) s += payment / Math.pow(1 + rate, t);
  return s;
}

/** Adiantar as `k` últimas parcelas ("de trás para frente"). */
export function prepayLast(payment: number, remaining: number, rate: number, k: number): Prepay {
  const A = clean(payment), i = clean(rate), n = Math.max(0, Math.floor(remaining));
  const count = Math.max(0, Math.min(Math.floor(k), n));
  const payNow = lastKCost(A, n, i, count);
  const nominal = A * count;
  return { count, payNow: r2(payNow), nominal: r2(nominal), savings: r2(nominal - payNow), remainingAfter: n - count };
}

/** Com `amount` em mãos: quantas das últimas parcelas dá para adiantar (e quanto sobra). */
export function prepayWithAmount(payment: number, remaining: number, rate: number, amount: number): Prepay & { leftover: number } {
  const A = clean(payment), i = clean(rate), n = Math.max(0, Math.floor(remaining)), cash = clean(amount);
  let k = 0;
  while (k < n && lastKCost(A, n, i, k + 1) <= cash + 0.005) k++;
  const p = prepayLast(A, n, i, k);
  return { ...p, leftover: r2(Math.max(cash - p.payNow, 0)) };
}

/**
 * Adiantar ou guardar? Compara as duas escolhas no fim do contrato, com o mesmo dinheiro (`p.payNow`):
 *  - adiantar: nos meses em que as parcelas sumiriam, a pessoa guarda o valor delas rendendo `saveRate`;
 *  - guardar: o dinheiro fica rendendo `saveRate` até o fim e todas as parcelas são pagas normalmente.
 * `advantage` > 0 = adiantar deixa a pessoa com mais dinheiro no fim. Empate quando a taxa do contrato = rendimento.
 */
export function prepayVsSave(payment: number, remaining: number, p: Prepay, saveRate: number): { adiantar: number; guardar: number; advantage: number } {
  const A = clean(payment), s = clean(saveRate), n = Math.max(0, Math.floor(remaining));
  let adiantar = 0;
  for (let t = n - p.count + 1; t <= n; t++) adiantar += A * Math.pow(1 + s, n - t);
  const guardar = p.payNow * Math.pow(1 + s, n);
  return { adiantar: r2(adiantar), guardar: r2(guardar), advantage: r2(adiantar - guardar) };
}

// ---------------------------------------------------------------- ordem sugerida

export type DebtLite = { name: string; monthly_rate: number; balance: number };

/** Dívidas com juros, da maior taxa para a menor (para o aviso "quite primeiro os juros altos"). */
export function costlyDebts(debts: DebtLite[]): DebtLite[] {
  return debts.filter((d) => clean(d.monthly_rate) > 0 && clean(d.balance) > 0).sort((a, b) => b.monthly_rate - a.monthly_rate);
}
