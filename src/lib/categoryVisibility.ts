// Categorias visíveis de cada pessoa.
// Poucas categorias prontas aparecem por padrão (as "básicas"); o resto das prontas fica como sugestão,
// que a pessoa liga quando quiser. As criadas por ela sempre aparecem. Esconder não apaga nada:
// lançamentos antigos continuam com a categoria e os relatórios seguem mostrando o nome.
import type { CatRow } from "@/lib/categories";

export type CatFull = CatRow & { is_default?: boolean | null; user_id?: string | null; color?: string | null };
export type VisibilityRow = { category_id: string; hidden: boolean };

/** Categorias prontas que aparecem já de início (com as subcategorias delas). */
export const CORE_ROOTS: Record<"income" | "expense", string[]> = {
  expense: ["Alimentação", "Moradia", "Transporte", "Saúde", "Outros"],
  income: ["Salário", "Pix / Transferência", "Rendimentos", "Vendas e serviços"],
};

/** Contas criadas a partir daqui começam só com as básicas. Contas antigas continuam vendo tudo (podem esconder). */
export const CORE_ONLY_SINCE = "2026-10-24T03:00:00Z";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function rootOf(c: CatFull, byId: Map<string, CatFull>): CatFull {
  return (c.parent_id && byId.get(c.parent_id)) || c;
}

/** É uma das prontas básicas (ou subcategoria pronta de uma básica). */
export function isCoreDefault(c: CatFull, byId: Map<string, CatFull>): boolean {
  if (!c.is_default) return false;
  const root = rootOf(c, byId);
  return Boolean(root.is_default) && CORE_ROOTS[root.type].some((n) => norm(n) === norm(root.name));
}

/** Pode ser escondida (as próprias a pessoa edita ou exclui; as prontas e as de quem divide com ela, só esconde). */
export const canHide = (c: CatFull, userId: string | null) => Boolean(c.is_default) || (c.user_id ?? null) !== userId;

export function coreOnlyFor(createdAt: string | null | undefined): boolean {
  const t = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(t) && t >= Date.parse(CORE_ONLY_SINCE);
}

/** Ids escondidos: escolha da pessoa; sem escolha, conta nova esconde as prontas que não são básicas. Sub de categoria escondida também some. */
export function hiddenIds(cats: CatFull[], rows: VisibilityRow[], coreOnly: boolean, userId: string | null): Set<string> {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const chosen = new Map(rows.map((r) => [r.category_id, r.hidden]));
  const own = (c: CatFull) => !c.is_default && (c.user_id ?? null) === userId;
  const self = (c: CatFull): boolean => {
    if (own(c)) return false;
    const pick = chosen.get(c.id);
    if (pick !== undefined) return pick;
    return coreOnly && Boolean(c.is_default) && !isCoreDefault(c, byId);
  };
  const out = new Set<string>();
  for (const c of cats) {
    const parent = c.parent_id ? byId.get(c.parent_id) : undefined;
    if (self(c) || (parent && self(parent))) out.add(c.id);
  }
  return out;
}

/** Para listas de escolha: tira as escondidas, mas mantém as que já estão em uso no que está sendo editado (e a principal delas). */
export function visibleCats<T extends CatRow>(cats: T[], hidden: Set<string>, keep: (string | null | undefined)[] = []): T[] {
  if (!hidden.size) return cats;
  const keepSet = new Set<string>();
  for (const id of keep) {
    if (!id) continue;
    keepSet.add(id);
    const p = cats.find((c) => c.id === id)?.parent_id;
    if (p) keepSet.add(p);
  }
  return cats.filter((c) => !hidden.has(c.id) || keepSet.has(c.id));
}

type Client = {
  from: (t: string) => {
    select: (cols: string) => PromiseLike<{ data: unknown; error: unknown }> & { order: (col: string) => PromiseLike<{ data: unknown; error: unknown }> };
  };
  auth: { getSession: () => Promise<{ data: { session: { user: { id: string; created_at?: string } } | null } }> };
};

/** Carrega as categorias com o que está escondido. Sem a tabela de visibilidade (migração ainda não aplicada), nada fica escondido além da regra de conta nova. */
export async function loadCategoryState(supabase: unknown, userId: string | null): Promise<{ cats: CatFull[]; hidden: Set<string>; coreOnly: boolean; error: boolean; canSave: boolean }> {
  const db = supabase as Client;
  const [c, v, s] = await Promise.all([
    db.from("categories").select("id,name,type,parent_id,is_default,user_id,color").order("name"),
    db.from("category_visibility").select("category_id,hidden"),
    db.auth.getSession().catch(() => ({ data: { session: null } })),
  ]);
  const cats = (c.data ?? []) as CatFull[];
  const rows = v.error ? [] : ((v.data ?? []) as VisibilityRow[]);
  const coreOnly = !v.error && coreOnlyFor(s.data.session?.user.created_at);
  return { cats, hidden: hiddenIds(cats, rows, coreOnly, userId), coreOnly, error: Boolean(c.error), canSave: !v.error };
}
