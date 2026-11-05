// Constantes configuráveis do MEI: salário mínimo, valores fixos de impostos, etc.
// Atualize esses valores conforme mudanças na legislação.

/** Salário mínimo federal (2024). Atualizar quando houver reajuste. */
export const MINIMUM_WAGE = 1412;

/**
 * Calcula o DAS mensal do MEI com base na atividade.
 * DAS = 5% do salário mínimo + ICMS/ISS fixo por atividade
 * Referência: Portal do Empreendedor (PGMEI)
 */
export function computeDas(activityKind: "comercio" | "industria" | "servicos"): number {
  const baseContribution = MINIMUM_WAGE * 0.05; // 5% do salário mínimo
  const r2 = (n: number) => Math.round(n * 100) / 100;

  if (activityKind === "servicos") {
    // Comércio/Indústria: DAS + 1 (ICMS)
    return r2(baseContribution + 5); // ISS para serviços
  }
  // Comércio/Indústria (padrão)
  return r2(baseContribution + 1); // ICMS
}
