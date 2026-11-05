// Essencial × não essencial e renda livre × benefício (vale-alimentação/refeição), inspirado no método
// "Primo Pobre" de planilha financeira. O usuário pode marcar qualquer categoria (padrão ou própria) em
// category_flags; sem marcação, usamos um padrão razoável pelo nome da categoria principal.

export const ESSENTIAL_CATEGORY_NAMES = ["Alimentação", "Transporte", "Moradia", "Saúde", "Educação", "Serviços", "Taxas/Impostos"];
export const BENEFIT_CATEGORY_NAMES = ["Benefícios (VA/VR)"];

export type CatFlagRow = { category_id: string; is_essential: boolean | null; is_benefit: boolean | null };
export type CatMin = { id: string; name: string; parent_id: string | null };

export type Classifier = { isEssential: (categoryId: string | null) => boolean; isBenefit: (categoryId: string | null) => boolean };

export function buildClassifier(cats: CatMin[], flags: CatFlagRow[]): Classifier {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const flagById = new Map(flags.map((f) => [f.category_id, f]));
  const rootNameOf = (c: CatMin): string => (c.parent_id ? byId.get(c.parent_id)?.name ?? c.name : c.name);

  function isEssential(categoryId: string | null): boolean {
    if (!categoryId) return false;
    const c = byId.get(categoryId);
    if (!c) return false;
    const own = flagById.get(c.id)?.is_essential;
    if (own != null) return own;
    if (c.parent_id) {
      const parent = flagById.get(c.parent_id)?.is_essential;
      if (parent != null) return parent;
    }
    return ESSENTIAL_CATEGORY_NAMES.includes(rootNameOf(c));
  }

  function isBenefit(categoryId: string | null): boolean {
    if (!categoryId) return false;
    const c = byId.get(categoryId);
    if (!c) return false;
    const own = flagById.get(c.id)?.is_benefit;
    if (own != null) return own;
    return BENEFIT_CATEGORY_NAMES.includes(rootNameOf(c));
  }

  return { isEssential, isBenefit };
}

// Dicas curtas por categoria principal (despesa), no espírito da planilha do Primo Pobre.
export const CATEGORY_TIPS: Record<string, string> = {
  "Dívidas e financiamentos": "Avalie quitar primeiro as dívidas com juros mais altos (cartão e cheque especial).",
  "Taxas/Impostos": "Tarifa bancária alta? Peça isenção ao banco ou troque para uma conta digital gratuita.",
  "Serviços": "Revise assinaturas e streamings que você não usa mais — veja o Planejamento.",
  "Seguros": "Compare o seguro todo ano: a fidelidade raramente compensa.",
};
