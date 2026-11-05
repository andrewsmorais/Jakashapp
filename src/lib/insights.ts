// Insight mensal ("3 coisas que mudaram no seu mês"). Os NÚMEROS saem sempre do cálculo abaixo; a IA (quando ligada) só reescreve a
// dica de cada item, sem poder citar valores. Sem chave da OpenAI, ou se a resposta vier fora do combinado, valem as dicas por regra.
import { brl } from "@/lib/format";

export type CatMini = { id: string; name: string; parent_id: string | null };
export type TxMini = { amount: number; type: string; date: string; category_id: string | null };

export type CatDelta = { name: string; amount: number; prev: number };
export type MonthStats = {
  month: string; // AAAA-MM
  prevMonth: string;
  income: number; expense: number; prevIncome: number; prevExpense: number;
  result: number; prevResult: number;
  topCategories: CatDelta[]; // por gasto, do maior para o menor
  biggestRise: (CatDelta & { delta: number }) | null;
  biggestDrop: (CatDelta & { delta: number }) | null;
  txCount: number;
};

export type InsightItem = { topic: "saldo" | "categoria" | "destaque"; title: string; fact: string; tip: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function prevMonthOf(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Totais do mês e do anterior, e as categorias principais (subcategorias somam na principal). */
export function computeMonthStats(txs: TxMini[], cats: CatMini[], month: string): MonthStats {
  const prevMonth = prevMonthOf(month);
  const rootName = (id: string | null): string => {
    if (!id) return "Sem categoria";
    const c = cats.find((x) => x.id === id);
    if (!c) return "Sem categoria";
    const p = c.parent_id ? cats.find((x) => x.id === c.parent_id) : undefined;
    return (p ?? c).name;
  };
  let income = 0, expense = 0, prevIncome = 0, prevExpense = 0, txCount = 0;
  const cur: Record<string, number> = {};
  const prev: Record<string, number> = {};
  txs.forEach((t) => {
    const ym = t.date.slice(0, 7);
    if (ym !== month && ym !== prevMonth) return;
    const amount = Number(t.amount);
    if (ym === month) {
      txCount++;
      if (t.type === "income") income += amount; else { expense += amount; const k = rootName(t.category_id); cur[k] = (cur[k] ?? 0) + amount; }
    } else if (t.type === "income") prevIncome += amount; else { prevExpense += amount; const k = rootName(t.category_id); prev[k] = (prev[k] ?? 0) + amount; }
  });
  const names = Array.from(new Set(Object.keys(cur).concat(Object.keys(prev))));
  const deltas = names.map((name) => ({ name, amount: round2(cur[name] ?? 0), prev: round2(prev[name] ?? 0), delta: round2((cur[name] ?? 0) - (prev[name] ?? 0)) }));
  const topCategories = deltas.filter((d) => d.amount > 0).sort((a, b) => b.amount - a.amount).map(({ name, amount, prev: p }) => ({ name, amount, prev: p }));
  // Variação só conta se for relevante: pelo menos R$ 50 e 20% sobre o mês anterior.
  const rises = deltas.filter((d) => d.prev > 0 && d.delta >= 50 && d.delta / d.prev >= 0.2).sort((a, b) => b.delta - a.delta);
  const drops = deltas.filter((d) => d.prev > 0 && -d.delta >= 50 && -d.delta / d.prev >= 0.2).sort((a, b) => a.delta - b.delta);
  return {
    month, prevMonth, income: round2(income), expense: round2(expense), prevIncome: round2(prevIncome), prevExpense: round2(prevExpense),
    result: round2(income - expense), prevResult: round2(prevIncome - prevExpense), topCategories,
    biggestRise: rises[0] ?? null, biggestDrop: drops[0] ?? null, txCount,
  };
}

const pct = (n: number) => `${Math.round(n)}%`;

/** Os três itens, com título e fato (números exatos) e dicas padrão por regra. */
export function buildInsightItems(s: MonthStats): InsightItem[] {
  const items: InsightItem[] = [];

  const hadPrev = s.prevIncome + s.prevExpense > 0;
  const saved = s.income > 0 ? (s.result / s.income) * 100 : 0;
  items.push({
    topic: "saldo",
    title: "Como fechou o mês",
    fact: `Entrou ${brl(s.income)} e saiu ${brl(s.expense)}: ${s.result >= 0 ? "sobrou" : "faltou"} ${brl(Math.abs(s.result))}${hadPrev ? ` (mês anterior: ${s.prevResult >= 0 ? "sobrou" : "faltou"} ${brl(Math.abs(s.prevResult))})` : ""}.`,
    tip: s.result < 0 ? "Gastou mais do que entrou. Olhe seus maiores gastos e evite fechar o próximo mês no cartão."
      : saved >= 10 ? "Ótimo ritmo. Que tal separar parte do que sobrou para a reserva ou para um objetivo?"
        : "Fechou no azul, mas apertado. Separe um valor fixo para guardar logo que o dinheiro entrar.",
  });

  const top = s.topCategories[0];
  if (s.biggestRise) {
    const r = s.biggestRise;
    items.push({ topic: "categoria", title: "O que mais subiu", fact: `${r.name}: ${brl(r.amount)} (antes ${brl(r.prev)}, ${pct((r.delta / r.prev) * 100)} a mais).`, tip: "Veja se foi algo pontual ou se virou hábito. Se virou, um limite mensal para essa categoria ajuda." });
  } else if (s.biggestDrop) {
    const r = s.biggestDrop;
    items.push({ topic: "categoria", title: "O que mais caiu", fact: `${r.name}: ${brl(r.amount)} (antes ${brl(r.prev)}, ${pct((-r.delta / r.prev) * 100)} a menos).`, tip: "Boa redução. Continue acompanhando para manter o resultado nos próximos meses." });
  } else if (s.topCategories[1]) {
    const c = s.topCategories[1];
    items.push({ topic: "categoria", title: "Segundo maior gasto", fact: `${c.name}: ${brl(c.amount)}${c.prev > 0 ? ` (antes ${brl(c.prev)})` : ""}.`, tip: "Dê uma olhada nos lançamentos dessa categoria para ver se algum gasto pode esperar." });
  } else {
    items.push({ topic: "categoria", title: "Seus registros", fact: `${s.txCount} lançamentos registrados no mês.`, tip: "Quanto mais completo o registro, mais fiel fica o seu resumo." });
  }

  if (top && s.expense > 0) {
    items.push({ topic: "destaque", title: "Maior gasto do mês", fact: `${top.name}: ${brl(top.amount)}, ${pct((top.amount / s.expense) * 100)} das despesas.`, tip: "Defina um limite mensal para essa categoria em Limites e acompanhe ao longo do mês." });
  } else {
    items.push({ topic: "destaque", title: "Receitas do mês", fact: `Entraram ${brl(s.income)} neste mês.`, tip: "Registre também os gastos para ver para onde o dinheiro vai." });
  }
  return items;
}

/** Instruções para a IA reescrever só as dicas. Os valores já estão nos fatos; a resposta não pode ter números. */
export function aiPrompt(items: InsightItem[]): { system: string; user: string } {
  return {
    system:
      "Você escreve dicas curtas de finanças pessoais em português do Brasil, em tom amigável e direto. " +
      "Para cada item recebido, escreva UMA dica prática de até 140 caracteres. " +
      "Regras: NÃO escreva nenhum número, valor ou porcentagem (os números já aparecem à parte); não recomende investimentos, produtos ou empréstimos; " +
      "não prometa resultados; não julgue a pessoa. Responda somente JSON no formato {\"tips\":[\"...\",\"...\",\"...\"]}, na mesma ordem dos itens.",
    user: items.map((i, n) => `${n + 1}. ${i.title}: ${i.fact}`).join("\n"),
  };
}

/** Valida a resposta da IA: JSON com 3 dicas curtas e sem dígitos. Retorna null se algo estiver fora do combinado. */
export function parseAiTips(text: string, expected = 3): string[] | null {
  try {
    const tips = (JSON.parse(text) as { tips?: unknown }).tips;
    if (!Array.isArray(tips) || tips.length !== expected) return null;
    const out = tips.map((t) => (typeof t === "string" ? t.replace(/\s+/g, " ").trim() : ""));
    return out.every((t) => t.length >= 10 && t.length <= 160 && !/\d/.test(t)) ? out : null;
  } catch {
    return null;
  }
}
