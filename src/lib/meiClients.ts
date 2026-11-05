// Regras puras de clientes e contas a receber do MEI (sem acesso ao banco).

/** Link do WhatsApp para falar com o cliente. Sem telefone válido, abre o WhatsApp para escolher o contato. */
export function waLink(phone: string | null | undefined, text: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const full = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits.length >= 12 && digits.length <= 13 ? digits : "";
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** Dias de atraso (0 se ainda não venceu). */
export function daysLate(due: string, today: string): number {
  return Math.max(dayNumber(today) - dayNumber(due), 0);
}

export type ReceivableLevel = "atrasada" | "vence_hoje" | "a_vencer";
export function receivableLevel(due: string, today: string): ReceivableLevel {
  if (due < today) return "atrasada";
  return due === today ? "vence_hoje" : "a_vencer";
}

export type Receivable = { amount: number; due_date: string };
export function receivableTotals(list: Receivable[], today: string) {
  let open = 0;
  let late = 0;
  let lateCount = 0;
  for (const b of list) {
    open += b.amount;
    if (b.due_date < today) { late += b.amount; lateCount += 1; }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { open: r2(open), late: r2(late), lateCount, count: list.length };
}
