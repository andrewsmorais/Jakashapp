// Lembretes de vencimento (regras puras, sem acesso ao banco nem a canais de envio).
import { addDays, dueDateFor, type CardCfg } from "@/lib/cards";
import { baseName } from "@/lib/installments";
import { brl, formatDateBR } from "@/lib/format";
import { meiObligations } from "@/lib/mei";

// Valores de profiles.notify_when -> quantos dias antes do vencimento avisar.
const OFFSETS: Record<string, number> = { on_due: 0, "1_day": 1, "3_days": 3, "7_days": 7 };
export const offsetFor = (when: string | null | undefined): number => OFFSETS[String(when)] ?? 0;

export type DueItem = { kind: "pagar" | "receber" | "fatura" | "obrigacao" | "parcela"; label: string; amount: number; due: string };

export type BillLite = { user_id: string; description: string; amount: number | string; due_date: string; type: "income" | "expense" };
/** Linha de public.card_invoices_due_on(): fatura com valor em aberto que vence em `due_date`. */
export type CardDueRow = { card_id: string; user_id: string; card_name: string; due_date: string; remaining: number | string };

/** Data de hoje em São Paulo ("AAAA-MM-DD"), independente do fuso do servidor. */
export function todayInSaoPaulo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

/** Dia em que o vencimento cai para quem escolheu avisar `offset` dias antes. */
export const targetDateFor = (today: string, offset: number): string => addDays(today, offset);

/** Contas a pagar/receber pendentes que vencem em `target`. */
export function billItems(bills: BillLite[], target: string): DueItem[] {
  return bills
    .filter((b) => b.due_date === target)
    .map((b) => ({ kind: b.type === "income" ? ("receber" as const) : ("pagar" as const), label: b.description, amount: Number(b.amount), due: target }));
}

/** Faturas de cartão em aberto que vencem em `target` (o cálculo do valor em aberto fica no banco). */
export function cardItems(rows: CardDueRow[], target: string): DueItem[] {
  return rows
    .filter((r) => r.due_date === target && Number(r.remaining) > 0.004)
    .map((r) => ({ kind: "fatura" as const, label: `Fatura ${r.card_name}`, amount: Number(r.remaining), due: target }));
}

/** Linha de `transactions` de uma parcela (só as colunas que o aviso usa). */
export type InstallmentLite = { user_id: string; card_id: string | null; description: string; amount: number | string; invoice_month: string | null; installment_number: number | null; installment_total: number | null };

/** Última parcela de cada parcelamento cuja fatura vence em `target`: avisa que o valor mensal vai ser liberado. */
export function finalInstallmentItems(rows: InstallmentLite[], cards: (CardCfg & { id: string })[], target: string): DueItem[] {
  const out: DueItem[] = [];
  for (const r of rows) {
    if (!r.invoice_month || !r.card_id || !r.installment_total || r.installment_total < 2 || r.installment_number !== r.installment_total) continue;
    const card = cards.find((c) => c.id === r.card_id);
    if (!card || dueDateFor(card, `${r.invoice_month.slice(0, 7)}-01`) !== target) continue;
    out.push({ kind: "parcela", label: `Última parcela de ${baseName(r.description)}`, amount: Number(r.amount), due: target });
  }
  return out;
}

const MEI_LABEL = { das: "Pagar o DAS (MEI)", relatorio: "Relatório mensal de receitas brutas (MEI)", dasn: "Declaração anual DASN-SIMEI (MEI)" } as const;

/** Obrigações do MEI que vencem em `target`. O DAS só entra se o usuário não agendou a conta "DAS" (que já avisa sozinha). */
export function meiItems(target: string, hasDasBill: boolean): DueItem[] {
  return meiObligations(target)
    .filter((o) => o.due === target && !(o.key === "das" && hasDasBill))
    .map((o) => ({ kind: "obrigacao" as const, label: MEI_LABEL[o.key], amount: 0, due: target }));
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

function whenLabel(offset: number, target: string): string {
  if (offset === 0) return "hoje";
  if (offset === 1) return "amanhã";
  return `em ${offset} dias (${formatDateBR(target).slice(0, 5)})`;
}

export type Reminder = {
  title: string;
  /** Uma linha, sem quebras (cabe em notificação push). */
  summary: string;
  /** Linhas para o e-mail. */
  lines: string[];
  /** Total a pagar (contas + faturas), sem os recebimentos. */
  totalToPay: number;
};

/** Monta o texto do lembrete. Retorna null se não há nada a avisar. */
export function buildReminder(items: DueItem[], offset: number, target: string): Reminder | null {
  if (items.length === 0) return null;
  const pay = items.filter((i) => i.kind === "pagar" || i.kind === "fatura");
  const recv = items.filter((i) => i.kind === "receber");
  const tasks = items.filter((i) => i.kind === "obrigacao");
  const info = items.filter((i) => i.kind === "parcela");
  const when = whenLabel(offset, target);

  let title: string;
  if (pay.length + recv.length + tasks.length === 0) title = info.length === 1 ? `Acaba um parcelamento ${when}` : `${info.length} parcelamentos acabam ${when}`;
  else if (tasks.length > 0 && pay.length + recv.length > 0) title = `Vencimentos ${when}`;
  else if (tasks.length > 0) title = tasks.length === 1 ? `1 obrigação do MEI ${when}` : `${tasks.length} obrigações do MEI ${when}`;
  else if (recv.length === 0) title = pay.length === 1 ? `1 conta vence ${when}` : `${pay.length} contas vencem ${when}`;
  else if (pay.length === 0) title = recv.length === 1 ? `1 recebimento previsto ${when}` : `${recv.length} recebimentos previstos ${when}`;
  else title = `Contas e recebimentos ${when}`;

  // Pagamentos primeiro, do maior para o menor valor; depois recebimentos e obrigações (sem valor).
  const sorted = [...pay.sort((a, b) => b.amount - a.amount), ...recv.sort((a, b) => b.amount - a.amount), ...tasks, ...info];
  const text = (i: DueItem) => (i.kind === "obrigacao" ? cut(oneLine(i.label), 60) : i.kind === "parcela" ? `${cut(oneLine(i.label), 40)} (libera ${brl(i.amount)}/mês)` : `${cut(oneLine(i.label), 40)}${i.kind === "receber" ? " (a receber)" : ""} ${brl(i.amount)}`);
  const top = sorted.slice(0, 3).map(text).join("; ");
  const more = sorted.length - 3;
  const summary = oneLine(`${top}${more > 0 ? ` e mais ${more}` : ""}`);

  const lines = sorted.slice(0, 10).map((i) => (i.kind === "obrigacao" ? cut(oneLine(i.label), 60) : i.kind === "parcela" ? `${cut(oneLine(i.label), 60)}: libera ${brl(i.amount)} por mês` : `${i.kind === "receber" ? "A receber · " : ""}${cut(oneLine(i.label), 60)}: ${brl(i.amount)}`));
  if (sorted.length > 10) lines.push(`e mais ${sorted.length - 10}`);

  const totalToPay = Math.round(pay.reduce((s, i) => s + i.amount, 0) * 100) / 100;
  return { title, summary, lines, totalToPay };
}
