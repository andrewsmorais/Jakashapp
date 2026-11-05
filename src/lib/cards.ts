// Regras de fatura de cartão de crédito (puras, sem acesso ao banco).
//
// A fatura é identificada pelo MÊS DE VENCIMENTO (guardado como "AAAA-MM-01"):
// com fechamento no dia 25 e vencimento no dia 5, a compra de 10/10 cai na fatura que vence em 05/11;
// a compra de 26/10 cai na que vence em 05/12.

export type CardCfg = { closing_day: number; due_day: number };

export type InvoiceRow = { card_id: string; invoice_month: string; total: number; paid: number };

export type InvoiceStatus = "paga" | "vencida" | "fechada" | "aberta" | "vazia";

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate(); // m: 1..12
const clamp = (y: number, m: number, day: number) => Math.min(day, daysIn(y, m));
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parts = (s: string): [number, number, number] => {
  const [y, m, d] = s.split("-").map(Number);
  return [y, m, d || 1];
};
function addM(y: number, m: number, delta: number): [number, number] {
  const d = new Date(y, m - 1 + delta, 1);
  return [d.getFullYear(), d.getMonth() + 1];
}

/** Mês (1º dia) em que vence a fatura que recebe uma compra feita em `dateISO`. */
export function invoiceMonthFor(card: CardCfg, dateISO: string): string {
  const [y, m, d] = parts(dateISO);
  const [cy, cm] = d > clamp(y, m, card.closing_day) ? addM(y, m, 1) : [y, m];
  const [vy, vm] = card.due_day > card.closing_day ? [cy, cm] : addM(cy, cm, 1);
  return `${vy}-${pad(vm)}-01`;
}

/** Soma `delta` meses a um mês de fatura ("AAAA-MM-01"). */
export function shiftInvoiceMonth(invoiceMonth: string, delta: number): string {
  const [y, m] = parts(invoiceMonth);
  const [ny, nm] = addM(y, m, delta);
  return `${ny}-${pad(nm)}-01`;
}

/** Data de vencimento da fatura. */
export function dueDateFor(card: CardCfg, invoiceMonth: string): string {
  const [y, m] = parts(invoiceMonth);
  return iso(y, m, clamp(y, m, card.due_day));
}

/** Data de fechamento da fatura (último dia que entra nela). */
export function closingDateFor(card: CardCfg, invoiceMonth: string): string {
  const [y, m] = parts(invoiceMonth);
  const [cy, cm] = card.due_day > card.closing_day ? [y, m] : addM(y, m, -1);
  return iso(cy, cm, clamp(cy, cm, card.closing_day));
}

/** Soma `delta` meses a uma data mantendo o dia (31/01 + 1 mês = 28/02). */
export function addMonthsClamped(dateISO: string, delta: number): string {
  const [y, m, d] = parts(dateISO);
  const [ny, nm] = addM(y, m, delta);
  return iso(ny, nm, clamp(ny, nm, d));
}

export function addDays(dateISO: string, days: number): string {
  const [y, m, d] = parts(dateISO);
  const t = new Date(y, m - 1, d + days);
  return iso(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

/** Situação da fatura em `today` ("AAAA-MM-DD"). */
export function invoiceStatus(card: CardCfg, invoiceMonth: string, total: number, paid: number, today: string): InvoiceStatus {
  if (total <= 0.004) return paid > 0 ? "paga" : "vazia";
  if (paid + 0.004 >= total) return "paga";
  if (today <= closingDateFor(card, invoiceMonth)) return "aberta";
  if (today <= dueDateFor(card, invoiceMonth)) return "fechada";
  return "vencida";
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  paga: "Paga",
  vencida: "Vencida",
  fechada: "Fechada",
  aberta: "Aberta",
  vazia: "Sem compras",
};

/** Divide o total em parcelas em centavos; as sobras vão para as primeiras parcelas. */
export function splitInstallments(total: number, n: number): number[] {
  const count = Math.max(1, Math.floor(n));
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const rest = cents - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i < rest ? 1 : 0)) / 100);
}

export type PurchaseInput = {
  userId: string;
  description: string;
  total: number;
  installments: number;
  date: string;
  category_id: string | null;
};

/** Linhas de `transactions` para uma compra no cartão (uma por parcela). */
export function buildCardPurchase(card: CardCfg & { id: string }, input: PurchaseInput) {
  const n = Math.min(48, Math.max(1, Math.floor(input.installments) || 1));
  const amounts = splitInstallments(input.total, n);
  const base = invoiceMonthFor(card, input.date);
  const group = n > 1 ? crypto.randomUUID() : null;
  return amounts.map((amount, i) => ({
    user_id: input.userId,
    card_id: card.id,
    description: n > 1 ? `${input.description} (${i + 1}/${n})` : input.description,
    amount,
    type: "expense" as const,
    date: addMonthsClamped(input.date, i),
    category_id: input.category_id,
    invoice_month: shiftInvoiceMonth(base, i),
    installment_group: group,
    installment_number: n > 1 ? i + 1 : null,
    installment_total: n > 1 ? n : null,
    origin: "manual" as const,
  }));
}

/** Quanto do limite está comprometido: compras (inclusive parcelas futuras) ainda não pagas. */
export function cardUsed(rows: InvoiceRow[], cardId: string): number {
  return rows.filter((r) => r.card_id === cardId).reduce((s, r) => s + Math.max(r.total - r.paid, 0), 0);
}

/** Faturas em aberto de todos os cartões que vencem até `end` (exclusive). Com `from`, só as que vencem a partir dele. */
export function openInvoicesDue(cards: (CardCfg & { id: string })[], rows: InvoiceRow[], end: string, from?: string): number {
  let sum = 0;
  for (const r of rows) {
    const card = cards.find((c) => c.id === r.card_id);
    if (!card) continue;
    const remaining = r.total - r.paid;
    if (remaining <= 0.004) continue;
    const due = dueDateFor(card, r.invoice_month);
    if (due < end && (!from || due >= from)) sum += remaining;
  }
  return Math.round(sum * 100) / 100;
}

export const BRANDS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  elo: "Elo",
  amex: "American Express",
  hipercard: "Hipercard",
  outro: "Outro",
};
