// Planos como aparecem na página de vendas. A cobrança NÃO acontece aqui: a venda é só pela App Store
// (assinatura mensal, 7 dias grátis), e as regras de cobrança ficam no repositório do app (andrewsmorais/Jakashapp).
// Se mudar um preço ou um texto lá, mude aqui também: são duas cópias.
export const PLANS = {
  cpf: { name: 'Jakash Pessoal', value: 19.9, members: 3 },
  mei: { name: 'Jakash Empresarial', value: 39.9, members: 3 },
} as const;

export type PlanId = keyof typeof PLANS;

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

export const PLAN_TAGLINE: Record<PlanId, string> = {
  cpf: 'Para organizar as finanças pessoais, sozinho ou com quem divide as contas',
  mei: 'Para quem tem MEI ou negócio próprio',
};

export const PLAN_FEATURES: Record<PlanId, string[]> = {
  cpf: [
    'Lançamentos por texto, voz e importação de extrato ou planilha',
    'Cartões e contas a pagar',
    'Limites e objetivos',
    'Dívidas e reserva de emergência',
    'Investimentos, planejamento do mês e simulador',
    'Chat da Jaki, a assistente de IA',
    'Motorista de app',
    `Dividir com até ${PLANS.cpf.members} pessoas (casal, família ou sócios)`,
    'Categorias e subcategorias personalizáveis',
  ],
  mei: [
    'Tudo do Jakash Pessoal',
    'Controle do limite anual do MEI',
    'DAS e DASN',
    'Clientes e valores a receber',
    'Cobrança por Pix',
    'Recibos e relatório mensal',
    'Calculadora de preço',
    'Acesso do contador',
  ],
};

// Preço do plano sempre em reais.
export function planPrice(plan: PlanId): string {
  return PLANS[plan].value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
