// Simulador de viagem (puro). Os valores são ESTIMATIVAS que a pessoa digita: o app não consulta preço real de passagem,
// hotel ou pacote. Todas as contas são feitas aqui, em código.
import { monthsBetween, requiredMonthly } from "@/lib/planner";

export const TRIP_CATEGORIES = [
  { key: "transporte", label: "Transporte (passagem, combustível, pedágio)", perDay: false },
  { key: "hospedagem", label: "Hospedagem", perDay: true },
  { key: "alimentacao", label: "Alimentação", perDay: true },
  { key: "passeios", label: "Passeios e ingressos", perDay: true },
  { key: "seguro", label: "Seguro viagem", perDay: false },
  { key: "outros", label: "Outros", perDay: false },
] as const;
export type TripCategory = (typeof TRIP_CATEGORIES)[number]["key"];

export type TripInput = {
  costs: Record<TripCategory, number>;
  /** Folga para imprevistos, em % (sugestão: 10 a 15). */
  bufferPct: number;
  days: number;
  /** Data de ida (AAAA-MM-DD). */
  startDate: string;
  saved: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
export const costsTotal = (c: Record<TripCategory, number>): number => TRIP_CATEGORIES.reduce((s, k) => s + (c[k.key] || 0), 0);

export type TripResult = { subtotal: number; buffer: number; total: number; months: number; monthly: number; gap: number };

export function planTrip(i: TripInput, today: Date = new Date()): TripResult {
  const subtotal = r2(costsTotal(i.costs));
  const buffer = r2(subtotal * (Math.max(0, i.bufferPct) / 100));
  const total = r2(subtotal + buffer);
  const months = monthsBetween(today, i.startDate);
  const monthly = r2(requiredMonthly(total, i.saved, months));
  return { subtotal, buffer, total, months, monthly, gap: r2(Math.max(total - i.saved, 0)) };
}

/** Parte dos custos que depende dos dias de viagem (hospedagem, alimentação, passeios). */
function scaleDays(costs: Record<TripCategory, number>, from: number, to: number): Record<TripCategory, number> {
  const f = from > 0 ? Math.max(to, 1) / from : 1;
  const out = { ...costs };
  for (const k of TRIP_CATEGORIES) if (k.perDay) out[k.key] = r2(costs[k.key] * f);
  return out;
}

export type Scenario = { label: string; hint: string; total: number; months: number; monthly: number };

/** Cenários lado a lado: o escolhido, um mês depois, menos dias e uma versão enxuta (-20%). */
export function tripScenarios(i: TripInput, today: Date = new Date()): Scenario[] {
  const mk = (label: string, hint: string, input: TripInput): Scenario => {
    const r = planTrip(input, today);
    return { label, hint, total: r.total, months: r.months, monthly: r.monthly };
  };
  const later = new Date(`${i.startDate}T00:00:00`);
  later.setMonth(later.getMonth() + 1);
  const laterISO = `${later.getFullYear()}-${String(later.getMonth() + 1).padStart(2, "0")}-${String(later.getDate()).padStart(2, "0")}`;
  const fewer = Math.max(1, i.days - 2);
  const lean = Object.fromEntries(TRIP_CATEGORIES.map((k) => [k.key, r2((i.costs[k.key] || 0) * 0.8)])) as Record<TripCategory, number>;
  const out = [mk("Como planejado", "Seus números", i)];
  out.push(mk("Um mês depois", "Mais tempo para guardar", { ...i, startDate: laterISO }));
  if (i.days > 2) out.push(mk(`${fewer} dias`, "2 dias a menos", { ...i, days: fewer, costs: scaleDays(i.costs, i.days, fewer) }));
  out.push(mk("Versão enxuta", "20% a menos nos custos", { ...i, costs: lean }));
  return out;
}

export type FitResult = { fits: boolean | null; capacity: number | null; diff: number | null };

/** Cabe na sobra média? `capacity` é a sobra mensal média (receitas − despesas); null quando não há histórico. */
export function tripFit(monthly: number, capacity: number | null): FitResult {
  if (capacity === null) return { fits: null, capacity: null, diff: null };
  return { fits: monthly <= capacity + 0.005, capacity: r2(capacity), diff: r2(capacity - monthly) };
}

/** Parcelas da viagem no cartão: `n` parcelas iguais a partir do mês seguinte à compra, somadas às parcelas já existentes. */
export function tripInstallmentLoad(total: number, n: number, existingByMonth: { month: string; total: number }[]): { month: string; existing: number; trip: number; sum: number }[] {
  const parts = Math.max(1, Math.min(24, Math.floor(n)));
  const each = r2(total / parts);
  return existingByMonth.map((m, idx) => {
    const trip = idx < parts ? (idx === parts - 1 ? r2(total - each * (parts - 1)) : each) : 0;
    return { month: m.month, existing: m.total, trip, sum: r2(m.total + trip) };
  });
}
