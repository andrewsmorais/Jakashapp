// Fonte unica de verdade dos planos. O valor cobrado SEMPRE vem daqui (servidor),
// nunca do navegador.
//
// Dois planos a venda (decisao de 23/10/2026). Ids (gravados em profiles.subscription_plan e no Asaas) NAO mudam:
//   cpf = Jakash Pessoal      (tudo do uso pessoal, ate 3 pessoas na mesma casa)
//   mei = Jakash Empresarial  (tudo do Pessoal + pacote MEI)
// O plano antigo 'familia' deixou de ser vendido: se aparecer gravado, vale como 'cpf' (ver LEGACY_PLAN_ALIASES).
// appleProductId = produto de assinatura mensal na App Store Connect (compra dentro do app iOS).
export const PLANS = {
  cpf: { name: 'Jakash Pessoal', value: 19.9, members: 3, aiDaily: 40, appleProductId: 'jakash.pessoal.mensal' },
  mei: { name: 'Jakash Empresarial', value: 39.9, members: 3, aiDaily: 60, appleProductId: 'jakash.empresarial.mensal' },
} as const;

export type PlanId = keyof typeof PLANS;

// Planos a venda (checkout, paywalls, landing, SEO).
export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

// Valores antigos que ainda podem estar gravados no perfil e hoje equivalem a um plano atual.
export const LEGACY_PLAN_ALIASES = { familia: 'cpf' } as const satisfies Record<string, PlanId>;

// So os planos a venda. Use para ACEITAR um plano novo (checkout); para ler o que esta gravado, use canonicalPlan.
export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PLANS, value);
}

// Plano de um valor gravado no perfil: ids atuais valem como sao, 'familia' (legado) vale como 'cpf'; o resto, null.
export function canonicalPlan(value: unknown): PlanId | null {
  if (isPlanId(value)) return value;
  if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_PLAN_ALIASES, value)) {
    return LEGACY_PLAN_ALIASES[value as keyof typeof LEGACY_PLAN_ALIASES];
  }
  return null;
}

// Textos de venda (mesma lista na landing, em Configuracoes > Planos e no paywall do iOS).
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

// Produto da App Store -> plano (null = produto que o Jakash não conhece).
export function planFromAppleProduct(productId: unknown): PlanId | null {
  return PLAN_IDS.find((id) => PLANS[id].appleProductId === productId) ?? null;
}

// Preço do plano sempre em reais (a moeda de exibição do usuário não muda o valor cobrado).
export function planPrice(plan: PlanId): string {
  return PLANS[plan].value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Plano -> valor mensal, para identificar o plano pela cobranca do Asaas.
export function planFromValue(value: number): PlanId | null {
  return PLAN_IDS.find((id) => Math.abs(PLANS[id].value - value) < 0.005) ?? null;
}

// Quantas pessoas (contando o dono) cabem na gestao compartilhada. Todos os planos comportam 3;
// quem ainda nao escolheu plano (periodo de teste) e 'familia' (legado) tambem.
export function memberLimit(plan?: string | null): number {
  const id = canonicalPlan(plan);
  return id ? PLANS[id].members : PLANS.cpf.members;
}

// Mensagens do Chat IA por dia, por usuário (controle de custo). AI_CHAT_DAILY_LIMIT, se definida, vale para todos.
export function aiDailyLimit(plan?: string | null): number {
  const override = Number(process.env.AI_CHAT_DAILY_LIMIT);
  if (Number.isFinite(override) && override > 0) return Math.floor(override);
  if (plan === 'cnpj') return PLANS.mei.aiDaily;
  const id = canonicalPlan(plan);
  return id ? PLANS[id].aiDaily : PLANS.cpf.aiDaily;
}

// Pacote MEI: só no Empresarial (e no teste grátis). Quem assina o Pessoal vê o convite para mudar de plano.
export function meiLocked(info: { plan?: string | null; status?: string | null } | null): boolean {
  return Boolean(info && canonicalPlan(info.plan) === 'cpf' && info.status !== 'trial');
}
