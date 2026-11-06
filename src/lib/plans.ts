// Fonte única de verdade dos planos. O valor cobrado SEMPRE vem daqui (servidor) e da App Store, nunca do navegador.
//
// Decisão de 06/11/2026: um plano só, com duas formas de pagar, as duas com 7 dias grátis (oferta de teste da Apple):
//   mensal = R$ 19,90 por mês
//   anual  = R$ 159,00 por ano
// Ids gravados em profiles.subscription_plan: 'mensal' | 'anual'. Valores antigos ('cpf', 'mei', 'familia') valem como 'mensal'.
// appleProductId: id do produto de assinatura na App Store Connect. Definido por variável de ambiente para ligar no fim
// (NEXT_PUBLIC_IAP_PRODUCT_MENSAL / NEXT_PUBLIC_IAP_PRODUCT_ANUAL); sem ela, vale o id padrão abaixo.
// Um terceiro plano (com Open Finance) entra aqui no futuro.
export const TRIAL_DAYS = 7;

export const PLANS = {
  mensal: {
    name: 'Jakash Mensal', short: 'Mensal', value: 19.9, months: 1, members: 3, aiDaily: 40,
    appleProductId: process.env.NEXT_PUBLIC_IAP_PRODUCT_MENSAL || 'jakash.mensal',
  },
  anual: {
    name: 'Jakash Anual', short: 'Anual', value: 159, months: 12, members: 3, aiDaily: 40,
    appleProductId: process.env.NEXT_PUBLIC_IAP_PRODUCT_ANUAL || 'jakash.anual',
  },
} as const;

export type PlanId = keyof typeof PLANS;

// Planos à venda (tela de planos, paywall, SEO). O mensal vem primeiro.
export const PLAN_IDS: PlanId[] = ['mensal', 'anual'];

// Valores antigos que ainda podem estar gravados no perfil e hoje equivalem a um plano atual.
export const LEGACY_PLAN_ALIASES = { cpf: 'mensal', mei: 'mensal', familia: 'mensal' } as const satisfies Record<string, PlanId>;

// Só os planos à venda. Para ler o que está gravado, use canonicalPlan.
export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PLANS, value);
}

// Plano de um valor gravado no perfil: ids atuais valem como são; os antigos viram 'mensal'; o resto, null.
export function canonicalPlan(value: unknown): PlanId | null {
  if (isPlanId(value)) return value;
  if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_PLAN_ALIASES, value)) {
    return LEGACY_PLAN_ALIASES[value as keyof typeof LEGACY_PLAN_ALIASES];
  }
  return null;
}

// O que a assinatura inclui (igual nos dois: só muda a forma de pagar).
export const PLAN_FEATURES: string[] = [
  'Lançamentos por texto, voz, foto e importação de extrato',
  'Cartões, contas a pagar e lançamentos que se repetem',
  'Supermercado: lista, carrinho, nota fiscal e comparação',
  'Motorista: turnos, mecânica e lucro por hora e por km',
  'Limites, objetivos, dívidas e reserva de emergência',
  'Investimentos, planejamento do mês e simuladores',
  'Chat da Jaki, a assistente de IA',
  'Dividir com até 3 pessoas (casal, família ou sócios)',
];

// Produto da App Store -> plano (null = produto que o Jakash não conhece).
export function planFromAppleProduct(productId: unknown): PlanId | null {
  return PLAN_IDS.find((id) => PLANS[id].appleProductId === productId) ?? null;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Preço do plano (o valor do período: mês ou ano).
export function planPrice(plan: PlanId): string {
  return brl(PLANS[plan].value);
}

// Quanto o plano sai por mês (o anual dividido por 12), para comparar.
export function planMonthlyValue(plan: PlanId): number {
  return Math.round((PLANS[plan].value / PLANS[plan].months) * 100) / 100;
}

// Desconto do anual sobre 12 meses do mensal, em % inteiro (ex.: 33).
export function annualSavingsPct(): number {
  const full = PLANS.mensal.value * 12;
  return Math.round(((full - PLANS.anual.value) / full) * 100);
}

// Quantas pessoas (contando o dono) cabem na gestão compartilhada.
export function memberLimit(plan?: string | null): number {
  const id = canonicalPlan(plan);
  return id ? PLANS[id].members : PLANS.mensal.members;
}

// Mensagens do Chat IA por dia, por usuário (controle de custo). AI_CHAT_DAILY_LIMIT, se definida, vale para todos.
export function aiDailyLimit(plan?: string | null): number {
  const override = Number(process.env.AI_CHAT_DAILY_LIMIT);
  if (Number.isFinite(override) && override > 0) return Math.floor(override);
  const id = canonicalPlan(plan);
  return id ? PLANS[id].aiDaily : PLANS.mensal.aiDaily;
}

// Pacote MEI: com um plano só, não há mais bloqueio por plano (fica para quem assina).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function meiLocked(_info: { plan?: string | null; status?: string | null } | null): boolean {
  return false;
}
