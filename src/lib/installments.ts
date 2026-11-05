// Parcelamentos no cartão (regras puras, sem acesso ao banco).
// Cada parcela é uma linha de `transactions` (installment_group/number/total + invoice_month); aqui só agrupamos e projetamos.
import { addMonthsClamped, dueDateFor, shiftInvoiceMonth, type CardCfg } from "@/lib/cards";

export type InstallmentRow = {
  id: string;
  user_id: string;
  card_id: string | null;
  description: string;
  amount: number | string;
  date: string;
  invoice_month: string | null;
  installment_group: string | null;
  installment_number: number | null;
  installment_total: number | null;
  category_id?: string | null;
  is_business?: boolean | null;
};

export type PlanItem = {
  group: string;
  userId: string;
  cardId: string | null;
  /** Produto/compra: a descrição sem o sufixo " (3/10)". */
  name: string;
  /** Valor de cada parcela (a mais recente lançada). */
  perInstallment: number;
  total: number;
  /** Parcelas que já venceram (fatura passada). */
  paidCount: number;
  remainingCount: number;
  remainingAmount: number;
  /** Mês ("AAAA-MM-01") da fatura da próxima parcela a vencer. */
  nextInvoiceMonth: string | null;
  /** Mês ("AAAA-MM-01") da fatura da última parcela. */
  lastInvoiceMonth: string;
  /** Vencimento da última parcela (quando se conhece o cartão). */
  lastDueDate: string | null;
  /** Parcelas lançadas que faltam existir no banco (compra importada com número parcial, por exemplo). */
  missingRows: number;
};

export type TimelineMonth = {
  /** "AAAA-MM-01" */
  month: string;
  total: number;
  count: number;
  /** Parcelamentos cuja última parcela cai neste mês (o valor some a partir do mês seguinte). */
  ending: PlanItem[];
  /** Quanto a parcela total do mês cai em relação ao mês anterior (0 se não cai). */
  drop: number;
};

const SUFFIX = /\s*\(\s*\d+\s*\/\s*\d+\s*\)\s*$/;
export const baseName = (description: string): string => description.replace(SUFFIX, "").trim() || description.trim();
const round2 = (n: number) => Math.round(n * 100) / 100;
const monthKey = (invoiceMonth: string) => `${invoiceMonth.slice(0, 7)}-01`;

/** Mês da fatura que contém `today` para fins de "já venceu": o 1º dia do mês corrente. */
const monthStart = (today: string) => `${today.slice(0, 7)}-01`;

/**
 * Agrupa as parcelas por compra e calcula o que falta.
 * `cards` (opcional) permite usar o vencimento real da fatura: a parcela conta como paga depois que a fatura venceu.
 * Sem o cartão, vale o mês: faturas de meses anteriores ao atual contam como vencidas.
 */
export function buildPlans(rows: InstallmentRow[], today: string, cards: (CardCfg & { id: string })[] = []): PlanItem[] {
  const byGroup = new Map<string, InstallmentRow[]>();
  for (const r of rows) {
    if (!r.installment_group || !r.invoice_month || !r.installment_total || r.installment_total < 2) continue;
    byGroup.set(r.installment_group, [...(byGroup.get(r.installment_group) ?? []), r]);
  }

  const plans: PlanItem[] = [];
  for (const [group, list] of byGroup) {
    list.sort((a, b) => (a.installment_number ?? 0) - (b.installment_number ?? 0) || a.invoice_month!.localeCompare(b.invoice_month!));
    const first = list[0];
    const last = list[list.length - 1];
    const total = Math.max(...list.map((r) => r.installment_total ?? 0));
    const card = cards.find((c) => c.id === first.card_id);
    const isPast = (invoiceMonth: string) => (card ? dueDateFor(card, monthKey(invoiceMonth)) < today : monthKey(invoiceMonth) < monthStart(today));

    const upcoming = list.filter((r) => !isPast(r.invoice_month!));
    const per = Number(last.amount);
    const lastInvoiceMonth = monthKey(last.invoice_month!);
    // Parcelas que a compra prevê além das lançadas (ex.: compra importada "3/10" sem as 7 seguintes).
    const lastNumber = last.installment_number ?? list.length;
    const missingRows = Math.max(total - lastNumber, 0);

    plans.push({
      group,
      userId: first.user_id,
      cardId: first.card_id,
      name: baseName(first.description),
      perInstallment: per,
      total,
      paidCount: list.length - upcoming.length,
      remainingCount: upcoming.length,
      remainingAmount: round2(upcoming.reduce((s, r) => s + Number(r.amount), 0)),
      nextInvoiceMonth: upcoming.length ? monthKey(upcoming[0].invoice_month!) : null,
      lastInvoiceMonth,
      lastDueDate: card ? dueDateFor(card, lastInvoiceMonth) : null,
      missingRows,
    });
  }

  // Os que ainda têm parcelas a vencer primeiro, pelo fim mais próximo.
  return plans.sort((a, b) => {
    if ((a.remainingCount > 0) !== (b.remainingCount > 0)) return a.remainingCount > 0 ? -1 : 1;
    return a.lastInvoiceMonth.localeCompare(b.lastInvoiceMonth) || a.name.localeCompare(b.name, "pt-BR");
  });
}

/** Só os parcelamentos que ainda têm parcelas por vir. */
export const activePlans = (plans: PlanItem[]): PlanItem[] => plans.filter((p) => p.remainingCount > 0);

/**
 * Linha do tempo de `months` meses a partir do mês de `today`: soma das parcelas que vencem em cada mês
 * e quais parcelamentos terminam ali.
 */
export function buildTimeline(rows: InstallmentRow[], plans: PlanItem[], today: string, months = 12): TimelineMonth[] {
  const start = monthStart(today);
  const keys = Array.from({ length: months }, (_, i) => shiftInvoiceMonth(start, i));
  const totals = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    if (!r.installment_group || !r.invoice_month || !r.installment_total || r.installment_total < 2) continue;
    const k = monthKey(r.invoice_month);
    const cur = totals.get(k) ?? { total: 0, count: 0 };
    totals.set(k, { total: cur.total + Number(r.amount), count: cur.count + 1 });
  }
  const out: TimelineMonth[] = [];
  let prev = 0;
  for (const month of keys) {
    const t = totals.get(month) ?? { total: 0, count: 0 };
    const total = round2(t.total);
    const ending = activePlans(plans).filter((p) => p.lastInvoiceMonth === month);
    out.push({ month, total, count: t.count, ending, drop: out.length > 0 && total < prev ? round2(prev - total) : 0 });
    prev = total;
  }
  return out;
}

/** Quanto o orçamento ganha por mês quando `plan` termina (o valor da parcela). */
export const freedPerMonth = (plan: PlanItem): number => plan.perInstallment;

/** Total das parcelas ainda por vir (todos os parcelamentos). */
export const totalRemaining = (plans: PlanItem[]): number => round2(plans.reduce((s, p) => s + p.remainingAmount, 0));

/** Parcela mensal comprometida hoje: soma das parcelas do mês corrente. */
export const monthlyCommitted = (timeline: TimelineMonth[]): number => timeline[0]?.total ?? 0;

/** Primeiro mês em que a parcela mensal total cai, e quanto cai (para a mensagem "a partir de X você libera Y"). */
export function nextRelief(timeline: TimelineMonth[]): { month: string; amount: number; products: string[] } | null {
  for (let i = 1; i < timeline.length; i++) {
    const t = timeline[i];
    if (t.drop > 0.004) {
      const prevEnding = timeline[i - 1].ending.map((p) => p.name);
      return { month: t.month, amount: t.drop, products: prevEnding };
    }
  }
  return null;
}

/**
 * Linhas das parcelas que faltam de uma compra (a partir da última lançada). A chave `inst:grupo:n` é a mesma
 * da importação, então lançar de novo ou importar a fatura do mês seguinte não duplica.
 */
export function missingInstallmentRows(last: InstallmentRow, group: string, total: number) {
  const from = last.installment_number ?? 0;
  const name = baseName(last.description);
  const out = [];
  for (let k = from + 1; k <= total && out.length < 48; k++) {
    const delta = k - from;
    out.push({
      user_id: last.user_id,
      card_id: last.card_id,
      description: `${name} (${k}/${total})`,
      amount: Number(last.amount),
      type: "expense" as const,
      date: addMonthsClamped(last.date, delta),
      category_id: last.category_id ?? null,
      is_business: last.is_business ?? false,
      invoice_month: shiftInvoiceMonth(last.invoice_month!, delta),
      installment_group: group,
      installment_number: k,
      installment_total: total,
      origin: "manual" as const,
      import_key: `inst:${group}:${k}`,
    });
  }
  return out;
}
