// Plano para sair do vermelho. TODA conta é feita aqui, em código. A IA (opcional) só escreve a explicação com
// os números já calculados e o texto dela é descartado se tiver número que não esteja no plano.
// Conteúdo educativo: não indica banco, empréstimo ou produto de crédito e não promete "limpar o nome".

export type DebtStatus = "em_dia" | "atrasada" | "negativada" | "negociada" | "quitada";

export type PlanDebt = {
  id: string;
  name: string;
  kind: string;
  balance: number;
  monthly_rate: number; // % ao mês
  min_payment: number;
  status: DebtStatus;
  essential: boolean;
  creditor?: string | null;
  cash_offer?: number | null;
  agreement_installments?: number | null;
  agreement_amount?: number | null;
};

export type PlanStep = { id: string; name: string; rank: number; balance: number; rate: number; minPayment: number; essential: boolean; reason: string };
export type MonthPay = { id: string; name: string; amount: number };
export type Sim = { ok: boolean; months: number; totalInterest: number; order: string[]; first: MonthPay[]; reason?: string };
export type AgreementCompare = {
  id: string; name: string; balance: number; cashOffer: number; installments: number; installmentAmount: number; installmentsTotal: number;
  /** Quanto a mais se paga parcelando em vez de pagar à vista. */
  extraIfInstallments: number;
  /** Desconto da proposta à vista sobre o saldo. */
  cashDiscount: number;
};
export type DebtPlan = {
  budget: number;
  minTotal: number;
  ok: boolean;
  reason?: string;
  order: PlanStep[];
  thisMonth: MonthPay[];
  priority: Sim;
  avalanche: Sim;
  snowball: Sim;
  /** Método de pagamento que o plano segue: prioridade (essenciais primeiro, depois juros altos). */
  method: "prioridade";
  agreements: AgreementCompare[];
  totalDebt: number;
};

const EPS = 0.005;
const r2 = (n: number) => Math.round(n * 100) / 100;

const active = (d: PlanDebt) => d.status !== "quitada" && d.balance > EPS;
const effMin = (d: PlanDebt) => (d.status === "negociada" && d.agreement_amount ? d.agreement_amount : d.min_payment);
const effRate = (d: PlanDebt) => (d.status === "negociada" && d.agreement_amount ? 0 : d.monthly_rate);

type Cmp = (a: SimDebt, b: SimDebt) => number;
type SimDebt = { id: string; name: string; balance: number; rate: number; min: number; essential: boolean };

const byPriority: Cmp = (a, b) => Number(b.essential) - Number(a.essential) || b.rate - a.rate || a.balance - b.balance;
const byAvalanche: Cmp = (a, b) => b.rate - a.rate || a.balance - b.balance;
const bySnowball: Cmp = (a, b) => a.balance - b.balance;

/** Simula mês a mês: juros, parcelas mínimas e o que sobra do orçamento vai para a dívida de maior prioridade. */
export function simulate(debts: SimDebt[], budget: number, cmp: Cmp): Sim {
  const ds = debts.map((d) => ({ ...d }));
  if (ds.length === 0) return { ok: true, months: 0, totalInterest: 0, order: [], first: [] };
  const minTotal = ds.reduce((s, d) => s + d.min, 0);
  if (budget + EPS < minTotal) return { ok: false, months: 0, totalInterest: 0, order: [], first: [], reason: "O valor mensal é menor que a soma das parcelas mínimas." };

  let months = 0;
  let interestTotal = 0;
  const order: string[] = [];
  let first: MonthPay[] = [];
  while (ds.some((d) => d.balance > EPS) && months < 600) {
    months++;
    let available = budget;
    const paid = new Map<string, number>();
    for (const d of ds) if (d.balance > EPS) { const i = (d.balance * d.rate) / 100; d.balance += i; interestTotal += i; }
    for (const d of ds) {
      if (d.balance <= EPS) continue;
      const pay = Math.min(d.min, d.balance, available);
      d.balance -= pay; available -= pay; paid.set(d.id, (paid.get(d.id) ?? 0) + pay);
    }
    for (const d of ds.filter((x) => x.balance > EPS).sort(cmp)) {
      if (available <= EPS) break;
      const pay = Math.min(d.balance, available);
      d.balance -= pay; available -= pay; paid.set(d.id, (paid.get(d.id) ?? 0) + pay);
    }
    if (months === 1) first = ds.filter((d) => (paid.get(d.id) ?? 0) > EPS).map((d) => ({ id: d.id, name: d.name, amount: r2(paid.get(d.id) ?? 0) }));
    for (const d of ds) if (d.balance <= EPS && !order.includes(d.name)) { d.balance = 0; order.push(d.name); }
  }
  const ok = !ds.some((d) => d.balance > EPS);
  return { ok, months, totalInterest: r2(interestTotal), order, first, reason: ok ? undefined : "Com esse valor mensal os juros superam os pagamentos: as dívidas não são quitadas." };
}

function reasonFor(d: SimDebt, index: number, firstNonEssential: number): string {
  if (d.essential) return "Essencial (como água, luz, gás ou aluguel): atrasar pode cortar o serviço. Mantenha em dia primeiro.";
  if (index === firstNonEssential) return d.rate > 0 ? `Tem os juros mais altos entre as dívidas não essenciais (${String(r2(d.rate)).replace(".", ",")}% ao mês): quitar primeiro economiza mais.` : "Menor saldo entre as dívidas sem juros informados: quitar primeiro libera a parcela mais rápido.";
  return "Entra na fila: ao quitar a anterior, o valor dela passa para esta.";
}

export function buildDebtPlan(debtsIn: PlanDebt[], budget: number): DebtPlan {
  const debts = debtsIn.filter(active);
  const sim: SimDebt[] = debts.map((d) => ({ id: d.id, name: d.name, balance: d.balance, rate: effRate(d), min: effMin(d), essential: d.essential }));
  const minTotal = r2(sim.reduce((s, d) => s + d.min, 0));
  const priority = simulate(sim, budget, byPriority);
  const avalanche = simulate(sim, budget, byAvalanche);
  const snowball = simulate(sim, budget, bySnowball);

  const sorted = [...sim].sort(byPriority);
  const firstNonEssential = sorted.findIndex((d) => !d.essential);
  const order: PlanStep[] = sorted.map((d, i) => ({ id: d.id, name: d.name, rank: i + 1, balance: r2(d.balance), rate: d.rate, minPayment: r2(d.min), essential: d.essential, reason: reasonFor(d, i, firstNonEssential) }));

  const agreements: AgreementCompare[] = debts
    .filter((d) => (d.cash_offer ?? 0) > 0 && (d.agreement_installments ?? 0) > 0 && (d.agreement_amount ?? 0) > 0)
    .map((d) => {
      const n = d.agreement_installments as number;
      const a = d.agreement_amount as number;
      const cash = d.cash_offer as number;
      return { id: d.id, name: d.name, balance: r2(d.balance), cashOffer: r2(cash), installments: n, installmentAmount: r2(a), installmentsTotal: r2(n * a), extraIfInstallments: r2(n * a - cash), cashDiscount: r2(Math.max(d.balance - cash, 0)) };
    });

  return {
    budget: r2(budget), minTotal, ok: priority.ok, reason: priority.reason, order, thisMonth: priority.first, priority, avalanche, snowball,
    method: "prioridade", agreements, totalDebt: r2(sim.reduce((s, d) => s + d.balance, 0)),
  };
}

/** Reserva inicial: um mês de gastos essenciais. Null se não há base para calcular. */
export const miniReserveTarget = (essentialMonthly: number): number | null => (essentialMonthly > 0 ? Math.round(essentialMonthly) : null);

export const NEGOTIATION_SCRIPT: string[] = [
  "Peça o valor total atualizado da dívida, com juros e multa separados.",
  "Pergunte quanto fica à vista (com desconto) e quanto ficam as parcelas, se parcelar.",
  "Pergunte se o acordo inclui a retirada do seu nome dos cadastros de proteção ao crédito e em quanto tempo isso acontece.",
  "Peça o acordo por escrito (e-mail ou boleto com o número do acordo) antes de pagar.",
  "Pague só pelos canais oficiais do credor. Desconfie de links e contatos que chegam sem você ter pedido.",
  "Só feche parcelas que cabem no seu mês. Acordo que você não consegue pagar vira uma nova dívida.",
  "Guarde todos os comprovantes.",
];

// ---------- Texto do plano ----------

const money = (n: number) => `R$ ${r2(n).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

/** Resumo em código (sempre disponível, mesmo sem IA). */
export function summaryText(plan: DebtPlan): string {
  if (plan.order.length === 0) return "Você não tem dívidas em aberto cadastradas.";
  if (!plan.ok) return plan.reason ?? "Com esse valor mensal o plano não fecha.";
  const first = plan.order[0];
  const months = plan.priority.months;
  return `Separando ${money(plan.budget)} por mês, você quita tudo em ${months} ${months === 1 ? "mês" : "meses"}, com cerca de ${money(plan.priority.totalInterest)} de juros. Comece por "${first.name}".`;
}

export const EXPLAIN_SYSTEM = `Você é a Jaki, assistente financeira do Jakash. Explique em português do Brasil, com tom acolhedor e sem julgamento, o plano de pagamento de dívidas que recebeu em JSON.
REGRAS OBRIGATÓRIAS:
- Use SOMENTE números que estão no JSON, escritos no formato R$ 1.234,56. Nunca calcule, estime ou invente valores, prazos ou percentuais.
- Não indique banco, financeira, empréstimo, portabilidade nem qualquer produto de crédito.
- Não prometa "limpar o nome" nem garanta resultado; o que o credor faz depende do acordo.
- Não cite leis nem prazos legais. Não peça CPF nem dados pessoais.
- No máximo 120 palavras, parágrafos curtos, sem listas longas. Termine incentivando o próximo passo do mês.`;

/** Dados que a IA enxerga: só números do plano e nomes das dívidas. */
export function explainPayload(plan: DebtPlan) {
  return {
    valor_mensal: plan.budget,
    total_devido: plan.totalDebt,
    meses_para_quitar: plan.priority.months,
    juros_totais_estimados: plan.priority.totalInterest,
    ordem: plan.order.map((s) => ({ posicao: s.rank, nome: s.name, saldo: s.balance, essencial: s.essential })),
    pagar_este_mes: plan.thisMonth.map((m) => ({ nome: m.name, valor: m.amount })),
    avalanche: { meses: plan.avalanche.months, juros: plan.avalanche.totalInterest },
    bola_de_neve: { meses: plan.snowball.months, juros: plan.snowball.totalInterest },
    acordos: plan.agreements.map((a) => ({ nome: a.name, a_vista: a.cashOffer, parcelas: a.installments, valor_parcela: a.installmentAmount, total_parcelado: a.installmentsTotal, a_mais_se_parcelar: a.extraIfInstallments })),
  };
}

const NUM = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g;
const BANNED = /limp(ar|o|e|a)\s+(o\s+|seu\s+)*nome|nome\s+limpo|garant(e|imos|ido|ia|o)\b|empr[eé]stimo|portabilidade|consignado|\bcpf\b|\bfinanceira\b/i;

function numbersIn(text: string): number[] {
  return (text.match(NUM) ?? []).map((t) => Number(t.replace(/\./g, "").replace(",", "."))).filter((n) => Number.isFinite(n));
}

/** Aceita o texto da IA só se todo número dele estiver no plano e nenhuma frase proibida aparecer. */
export function validateExplanation(text: string | null | undefined, plan: DebtPlan): string | null {
  const t = (text ?? "").trim();
  if (!t || t.length > 1200 || BANNED.test(t)) return null;
  const allowed = numbersIn(JSON.stringify(explainPayload(plan)).replace(/(\d)\.(\d)/g, "$1,$2"));
  for (const n of numbersIn(t)) {
    if (Number.isInteger(n) && n <= 10) continue;
    if (!allowed.some((a) => Math.abs(a - n) < 0.011 || (Number.isInteger(n) && Math.round(a) === n))) return null;
  }
  return t;
}
