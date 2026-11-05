// Incentivo a guardar (regras puras): sequência de meses, conquistas e sobra do mês. Tudo é sugestão: nada move dinheiro sozinho.

const ym = (iso: string) => iso.slice(0, 7);
function shiftYM(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Meses seguidos guardando. O mês atual sem aporte ainda não zera a sequência (o mês não acabou). */
export function streakMonths(contributionDates: string[], today: string): number {
  const months = new Set(contributionDates.map(ym));
  const cur = ym(today);
  let m = months.has(cur) ? cur : shiftYM(cur, -1);
  let n = 0;
  while (months.has(m) && n < 600) { n++; m = shiftYM(m, -1); }
  return n;
}

export type GoalLite = { id: string; name: string; target_amount: number; current_amount: number };
export type Milestone = { key: string; label: string };

/** Conquistas já alcançadas: primeiros R$ 100 guardados e, por objetivo, o maior marco atingido (25%, 50%, 75%, 100%). */
export function milestones(goals: GoalLite[]): Milestone[] {
  const out: Milestone[] = [];
  const saved = goals.reduce((s, g) => s + g.current_amount, 0);
  if (saved >= 100) out.push({ key: "first100", label: "Primeiros R$ 100 guardados" });
  for (const g of goals) {
    if (!(g.target_amount > 0)) continue;
    const pct = (g.current_amount / g.target_amount) * 100;
    const step = [100, 75, 50, 25].find((p) => pct >= p);
    if (step) out.push({ key: `${g.id}:${step}`, label: step === 100 ? `${g.name}: objetivo concluído` : `${g.name}: ${step}% do caminho` });
  }
  return out;
}

/** Quanto sobrou no mês (receitas − despesas). Null se não sobrou nada. */
export function monthLeftover(income: number, expense: number): number | null {
  const v = r2(income - expense);
  return v >= 1 ? v : null;
}
