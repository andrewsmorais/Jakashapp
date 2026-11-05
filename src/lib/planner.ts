// Motor de planejamento: tudo é conta em código (custo zero, sem IA).
// Conteúdo educativo: não é recomendação de investimento ou de crédito.

export type GoalType =
  | "custom" | "viagem" | "bebe" | "reserva" | "casamento" | "carro" | "imovel" | "curso" | "reforma";

export const GOAL_TYPES: Record<GoalType, { label: string; icon: string; tips: string[] }> = {
  custom: { label: "Outro objetivo", icon: "🎯", tips: ["Defina um valor e uma data realistas.", "Guarde um valor fixo todo mês, mesmo que pequeno."] },
  viagem: {
    label: "Viagem", icon: "✈️",
    tips: [
      "Liste transporte, hospedagem, alimentação e passeios.",
      "Some uma folga de 10% a 15% para imprevistos (você pode ajustar).",
      "Comparar datas diferentes costuma ajudar a baixar o custo.",
    ],
  },
  bebe: {
    label: "Chegada do bebê", icon: "👶",
    tips: [
      "Considere pré-natal, parto, enxoval, quarto e itens de segurança.",
      "Planeje a renda durante a licença e os primeiros meses, quando os gastos aumentam.",
      "MEI: mantenha o DAS em dia. O salário-maternidade tem regras e carência: confirme no INSS.",
    ],
  },
  reserva: {
    label: "Reserva de emergência", icon: "🛡️",
    tips: [
      "Comece pelas despesas essenciais de um mês.",
      "Referência comum: 3 a 6 meses de despesas; 6 a 12 se a renda varia (MEI/autônomo).",
      "A reserva precisa de liquidez: dinheiro fácil de resgatar quando precisar.",
    ],
  },
  casamento: { label: "Casamento", icon: "💍", tips: ["Defina o que é essencial e o que é opcional.", "Peça orçamentos e guarde uma folga para imprevistos."] },
  carro: { label: "Carro", icon: "🚗", tips: ["Some entrada, documentação, seguro e manutenção.", "Compare o custo total, não só a parcela."] },
  imovel: { label: "Entrada de imóvel", icon: "🏠", tips: ["Some entrada, documentação e mudança.", "Simule o financiamento antes de decidir (veja o Simulador)."] },
  curso: { label: "Curso ou estudo", icon: "📚", tips: ["Inclua material e possíveis reduções de renda durante o curso."] },
  reforma: { label: "Reforma", icon: "🔨", tips: ["Peça mais de um orçamento.", "Reserve uma folga: reformas costumam passar do previsto."] },
};

export function monthsBetween(from: Date, toISO: string): number {
  const to = new Date(toISO + "T00:00:00");
  const m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return Math.max(m, 1);
}

export function requiredMonthly(target: number, current: number, months: number): number {
  return Math.max(target - current, 0) / Math.max(months, 1);
}

// ---------- Dívidas ----------
export type DebtInput = { id: string; name: string; kind: string; balance: number; monthly_rate: number; min_payment: number };
export type PayoffMethod = "avalanche" | "snowball";
export type PayoffResult = { months: number; totalInterest: number; order: string[]; ok: boolean; reason?: string };

// monthly_rate em % ao mês. monthlyBudget = quanto o usuário consegue pagar por mês no total.
export function projectPayoff(debtsIn: DebtInput[], method: PayoffMethod, monthlyBudget: number): PayoffResult {
  const debts = debtsIn.filter((d) => d.balance > 0).map((d) => ({ ...d }));
  if (debts.length === 0) return { months: 0, totalInterest: 0, order: [], ok: true };

  const minTotal = debts.reduce((s, d) => s + d.min_payment, 0);
  if (monthlyBudget < minTotal) {
    return { months: 0, totalInterest: 0, order: [], ok: false, reason: "O valor mensal é menor que a soma das parcelas mínimas." };
  }

  let months = 0;
  let totalInterest = 0;
  const order: string[] = [];
  const EPS = 0.005;

  while (debts.some((d) => d.balance > EPS) && months < 600) {
    months++;
    let available = monthlyBudget;

    for (const d of debts) {
      if (d.balance > EPS) {
        const interest = (d.balance * d.monthly_rate) / 100;
        d.balance += interest;
        totalInterest += interest;
      }
    }
    for (const d of debts) {
      if (d.balance > EPS) {
        const pay = Math.min(d.min_payment, d.balance, available);
        d.balance -= pay;
        available -= pay;
      }
    }
    const active = debts
      .filter((d) => d.balance > EPS)
      .sort(method === "avalanche"
        ? (a, b) => b.monthly_rate - a.monthly_rate || a.balance - b.balance
        : (a, b) => a.balance - b.balance);
    for (const d of active) {
      if (available <= EPS) break;
      const pay = Math.min(d.balance, available);
      d.balance -= pay;
      available -= pay;
    }
    for (const d of debts) {
      if (d.balance <= EPS && !order.includes(d.name)) {
        d.balance = 0;
        order.push(d.name);
      }
    }
  }

  const ok = !debts.some((d) => d.balance > EPS);
  return {
    months,
    totalInterest: Math.round(totalInterest * 100) / 100,
    order,
    ok,
    reason: ok ? undefined : "Com esse valor mensal as dívidas não são quitadas em 50 anos: os juros superam os pagamentos.",
  };
}
