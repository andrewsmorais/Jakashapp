// Planejamento com os dados que o app já tem (puro, sem acesso ao banco): compromissos futuros, quanto posso gastar hoje,
// fluxo de caixa projetado e recorrências detectadas. Tudo considera SÓ o que está cadastrado: faturas, contas a pagar/receber e dívidas.
import { addDays, addMonthsClamped, dueDateFor, openInvoicesDue, type CardCfg, type InvoiceRow } from "@/lib/cards";
import { lightNorm, merchantKeys, prettyDesc } from "@/lib/importer";

export type BillIn = { description: string; amount: number; due_date: string; type: "income" | "expense"; recurrence: "none" | "monthly" };
export type DebtIn = { name: string; balance: number; min_payment: number };
export type CardIn = CardCfg & { id: string; name: string };

const pad = (n: number) => String(n).padStart(2, "0");
const ymOf = (iso: string) => iso.slice(0, 7);
const round2 = (n: number) => Math.round(n * 100) / 100;

function addMonthYM(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// ---------- 1. compromissos dos próximos meses ----------

export type CommitMonth = { month: string; invoices: number; bills: number; debts: number; total: number; pct: number | null };

/** Quanto já está comprometido em cada mês (faturas em aberto, contas a pagar e parcelas mínimas de dívidas) e quanto isso pesa na renda média. */
export function commitments(o: { today: string; months?: number; cards: CardIn[]; invoices: InvoiceRow[]; bills: BillIn[]; debts: DebtIn[]; avgIncome: number }): CommitMonth[] {
  const n = o.months ?? 6;
  const first = ymOf(o.today);
  const list = Array.from({ length: n }, (_, i) => addMonthYM(first, i));
  const out: Record<string, CommitMonth> = {};
  list.forEach((m) => { out[m] = { month: m, invoices: 0, bills: 0, debts: 0, total: 0, pct: null }; });
  const last = list[list.length - 1];
  const slot = (iso: string) => (ymOf(iso) < first ? first : ymOf(iso)); // atrasado entra no mês atual

  o.invoices.forEach((r) => {
    const card = o.cards.find((c) => c.id === r.card_id);
    const remaining = r.total - r.paid;
    if (!card || remaining <= 0.004) return;
    const m = slot(dueDateFor(card, r.invoice_month));
    if (out[m]) out[m].invoices += remaining;
  });

  o.bills.filter((b) => b.type === "expense").forEach((b) => {
    for (let k = 0; k < (b.recurrence === "monthly" ? 60 : 1); k++) {
      const due = k === 0 ? b.due_date : addMonthsClamped(b.due_date, k);
      if (k > 0 && ymOf(due) < first) continue;
      const m = slot(due);
      if (m > last) break;
      if (out[m]) out[m].bills += b.amount;
    }
  });

  o.debts.forEach((d) => {
    if (d.balance <= 0 || d.min_payment <= 0) return;
    const count = Math.ceil(d.balance / d.min_payment); // sem juros: quantas parcelas mínimas até quitar
    list.slice(0, count).forEach((m) => { out[m].debts += Math.min(d.min_payment, d.balance); });
  });

  return list.map((m) => {
    const c = out[m];
    const total = round2(c.invoices + c.bills + c.debts);
    return { month: m, invoices: round2(c.invoices), bills: round2(c.bills), debts: round2(c.debts), total, pct: o.avgIncome > 0 ? (total / o.avgIncome) * 100 : null };
  });
}

// ---------- 2. quanto posso gastar hoje ----------

export type Allowance = { cash: number; toPay: number; cardsDue: number; toReceive: number; daysLeft: number; free: number; perDay: number; perDayWithReceivables: number };

/** Dinheiro em conta menos o que vence até o fim do mês (contas e faturas), dividido pelos dias que faltam (hoje incluído). */
export function allowance(o: { today: string; cash: number; bills: BillIn[]; cards: CardIn[]; invoices: InvoiceRow[] }): Allowance {
  const [y, m, d] = o.today.split("-").map(Number);
  const end = `${m === 12 ? y + 1 : y}-${pad(m === 12 ? 1 : m + 1)}-01`;
  const daysLeft = new Date(y, m, 0).getDate() - d + 1;
  const toPay = round2(o.bills.filter((b) => b.type === "expense" && b.due_date < end).reduce((s, b) => s + b.amount, 0));
  const toReceive = round2(o.bills.filter((b) => b.type === "income" && b.due_date < end).reduce((s, b) => s + b.amount, 0));
  const cardsDue = openInvoicesDue(o.cards, o.invoices, end);
  const free = round2(o.cash - toPay - cardsDue);
  return {
    cash: round2(o.cash), toPay, cardsDue, toReceive, daysLeft, free,
    perDay: round2(Math.max(free, 0) / daysLeft),
    perDayWithReceivables: round2(Math.max(free + toReceive, 0) / daysLeft),
  };
}

// ---------- 3. fluxo de caixa projetado ----------

export type FlowEvent = { date: string; label: string; amount: number };
export type FlowPoint = { date: string; balance: number };
export type Cashflow = { points: FlowPoint[]; events: FlowEvent[]; min: FlowPoint; firstNegative: string | null; end: number };

/** Saldo dia a dia a partir do caixa de hoje, com contas a pagar/receber (inclusive as mensais que se repetem) e faturas de cartão. */
export function projectCashflow(o: { today: string; days?: number; cash: number; bills: BillIn[]; cards: CardIn[]; invoices: InvoiceRow[] }): Cashflow {
  const days = o.days ?? 60;
  const last = addDays(o.today, days);
  const events: FlowEvent[] = [];
  const at = (due: string) => (due < o.today ? o.today : due); // atrasado cai hoje

  o.bills.forEach((b) => {
    for (let k = 0; k < (b.recurrence === "monthly" ? 3 + Math.ceil(days / 28) : 1); k++) {
      const due = k === 0 ? b.due_date : addMonthsClamped(b.due_date, k);
      if (k > 0 && due < o.today) continue;
      const date = at(due);
      if (date > last) break;
      events.push({ date, label: b.description, amount: b.type === "income" ? b.amount : -b.amount });
    }
  });
  o.invoices.forEach((r) => {
    const card = o.cards.find((c) => c.id === r.card_id);
    const remaining = r.total - r.paid;
    if (!card || remaining <= 0.004) return;
    const date = at(dueDateFor(card, r.invoice_month));
    if (date <= last) events.push({ date, label: `Fatura ${card.name}`, amount: -round2(remaining) });
  });
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.amount - b.amount));

  const points: FlowPoint[] = [];
  let balance = o.cash;
  let firstNegative: string | null = null;
  let min: FlowPoint = { date: o.today, balance: round2(o.cash) };
  for (let i = 0; i <= days; i++) {
    const date = addDays(o.today, i);
    events.filter((e) => e.date === date).forEach((e) => { balance += e.amount; });
    const p = { date, balance: round2(balance) };
    points.push(p);
    if (p.balance < min.balance) min = p;
    if (firstNegative === null && p.balance < -0.004) firstNegative = date;
  }
  return { points, events, min, firstNegative, end: round2(balance) };
}

// ---------- 4. recorrências (assinaturas, mensalidades) ----------

export type TxIn = { description: string; amount: number; date: string; type: string; installment_group: string | null };
export type Recurring = {
  key: string; name: string; monthly: number; annual: number; last: string; lastAmount: number; count: number;
  priceUpPct: number | null; isNew: boolean; active: boolean; hasBill: boolean; nextDue: string;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const h = Math.floor(s.length / 2);
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

/**
 * Cobranças que se repetem todo mês com valor estável: pelo menos 3 meses diferentes, intervalo de ~30 dias e variação de valor menor que 10%.
 * Parcelas de compra parcelada ficam de fora. `active` = cobrada nos últimos 45 dias.
 */
export function detectRecurring(txs: TxIn[], today: string, bills: BillIn[]): Recurring[] {
  const groups: Record<string, TxIn[]> = {};
  txs.forEach((t) => {
    if (t.type !== "expense" || t.installment_group || t.amount <= 0 || /\(\d+\/\d+\)/.test(t.description)) return;
    const k = merchantKeys(t.description)[0]?.k;
    if (!k) return;
    (groups[k] = groups[k] || []).push(t);
  });

  const out: Recurring[] = [];
  Object.keys(groups).forEach((key) => {
    const g = groups[key].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const months = new Set(g.map((t) => ymOf(t.date))).size;
    if (months < 3 || g.length > months * 1.5) return;
    const amounts = g.map((t) => t.amount);
    // Valor estável = os últimos 3 variam menos de 10%; um reajuste na última cobrança não descarta a recorrência.
    const cv = (xs: number[]) => {
      const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
      return mean > 0 ? Math.sqrt(xs.reduce((s, x) => s + (x - mean) * (x - mean), 0) / xs.length) / mean : Infinity;
    };
    const lastAmt = amounts[amounts.length - 1];
    const prior = amounts.slice(-4, -1);
    const repriced = amounts.length >= 4 && cv(prior) <= 0.1 && lastAmt / median(prior) <= 2 && lastAmt / median(prior) >= 0.5;
    if (cv(amounts.slice(-3)) > 0.1 && !repriced) return;
    const gaps = g.slice(1).map((t, i) => daysBetween(g[i].date, t.date)).filter((d) => d > 0);
    if (gaps.length < 2 || median(gaps) < 24 || median(gaps) > 38) return;

    const lastTx = g[g.length - 1];
    const before = amounts.slice(0, -1);
    const prev = median(before);
    const up = lastTx.amount > prev * 1.05 ? ((lastTx.amount - prev) / prev) * 100 : null;
    const current = round2(up !== null ? lastTx.amount : median(amounts.slice(-3)));
    let next = addMonthsClamped(lastTx.date, 1);
    while (next < today) next = addMonthsClamped(next, 1);
    out.push({
      key, name: prettyDesc(lastTx.description), monthly: current, annual: round2(current * 12),
      last: lastTx.date, lastAmount: lastTx.amount, count: g.length, priceUpPct: up,
      isNew: daysBetween(g[0].date, today) <= 100, active: daysBetween(lastTx.date, today) <= 45,
      hasBill: bills.some((b) => b.type === "expense" && merchantKeys(b.description).some((mk) => mk.k === key || lightNorm(b.description).indexOf(key) >= 0)),
      nextDue: next,
    });
  });
  return out.sort((a, b) => Number(b.active) - Number(a.active) || b.monthly - a.monthly);
}
