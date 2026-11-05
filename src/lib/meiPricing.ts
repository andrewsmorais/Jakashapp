// Cálculo de preço final considerando custos, DAS e margem desejada.
// Fórmula: Preço = (Custo Total) / (1 - Margem%)

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface PricingInput {
  /** Custo de material/produto, em reais */
  materialCost: number;
  /** Custo fixo mensal (aluguel, internet, etc.), em reais */
  fixedCost: number;
  /** Quanto você está trabalhando/produzindo por mês (horas, unidades, etc.) */
  workUnitsPerMonth: number;
  /** DAS mensal (valor computado da atividade), em reais */
  dasMonthly: number;
  /** Margem de lucro desejada, em % (ex: 30 para 30%) */
  desiredMarginPercent: number;
}

export interface PricingOutput {
  costPerUnit: number;          // Custo por hora/unidade (inclui fixo + DAS / quantidade)
  finalPrice: number;            // Preço final para atingir a margem desejada
  profitPerUnit: number;         // Lucro por hora/unidade
  breakEvenPrice: number;        // Preço mínimo para cobrir custos (margem 0%)
  monthlyRevenue: number;        // Receita total se trabalhar o mês inteiro a esse preço
  monthlyProfit: number;         // Lucro total se trabalhar o mês inteiro a esse preço
}

/**
 * Calcula o preço final de um serviço/produto dado os custos e margem desejada.
 *
 * Uso: você trabalha 160 horas/mês (4 semanas), tem custo de material de R$50/hora,
 * fixo de R$2000/mês e DAS de R$100/mês. Quer 40% de lucro.
 *
 * Fórmula principal:
 *   Custo Total = Material + (Fixo + DAS) / Quantidade
 *   Preço = Custo Total / (1 - Margem/100)
 */
export function calculatePrice(input: PricingInput): PricingOutput {
  const { materialCost, fixedCost, workUnitsPerMonth, dasMonthly, desiredMarginPercent } = input;

  // Validar entrada
  if (workUnitsPerMonth <= 0) {
    return {
      costPerUnit: 0,
      finalPrice: 0,
      profitPerUnit: 0,
      breakEvenPrice: 0,
      monthlyRevenue: 0,
      monthlyProfit: 0,
    };
  }

  // Custo fixo + DAS distribuído por unidade de trabalho
  const fixedPerUnit = r2((fixedCost + dasMonthly) / workUnitsPerMonth);

  // Custo total por unidade
  const costPerUnit = r2(materialCost + fixedPerUnit);

  // Preço que cobre custos + margem desejada
  // Margem = (Preço - Custo) / Preço
  // Logo: Preço = Custo / (1 - Margem/100)
  const marginFraction = Math.max(Math.min(desiredMarginPercent, 99.9), 0) / 100; // Limita a 99.9% para evitar divisão por zero
  const finalPrice = r2(costPerUnit / (1 - marginFraction));

  // Lucro por unidade
  const profitPerUnit = r2(finalPrice - costPerUnit);

  // Preço mínimo (break-even, margem 0%)
  const breakEvenPrice = costPerUnit;

  // Projeção mensal
  const monthlyRevenue = r2(finalPrice * workUnitsPerMonth);
  const monthlyProfit = r2(profitPerUnit * workUnitsPerMonth);

  return {
    costPerUnit,
    finalPrice,
    profitPerUnit,
    breakEvenPrice,
    monthlyRevenue,
    monthlyProfit,
  };
}
