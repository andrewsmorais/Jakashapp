// Filtro de período padrão do app: Hoje, Esta semana, Este mês ou Escolher datas (de um dia até outro).
// Datas sempre "AAAA-MM-DD", com as duas pontas INCLUÍDAS (use .gte(from) e .lte(to) nas consultas).
import { todayISO } from "@/lib/format";

export type PeriodPreset = "hoje" | "semana" | "mes" | "custom" | "tudo";
export type Period = { from: string; to: string };

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Período de um atalho. "semana" = de segunda-feira até hoje; "mes" = do dia 1 até hoje; "tudo" = sem limite. */
export function periodFor(p: PeriodPreset, custom: Period, today = todayISO()): Period {
  const [y, m, d] = today.split("-").map(Number);
  if (p === "hoje") return { from: today, to: today };
  if (p === "semana") { const dow = (new Date(y, m - 1, d).getDay() + 6) % 7; return { from: iso(new Date(y, m - 1, d - dow)), to: today }; }
  if (p === "mes") return { from: `${today.slice(0, 7)}-01`, to: today };
  if (p === "tudo") return { from: "1900-01-01", to: "9999-12-31" };
  return custom.from <= custom.to ? custom : { from: custom.to, to: custom.from };
}

/** Começo do mês atual até hoje (valor inicial do "Escolher datas"). */
export const defaultCustom = (today = todayISO()): Period => ({ from: `${today.slice(0, 7)}-01`, to: today });
