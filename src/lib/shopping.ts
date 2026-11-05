// Lista de compras (regras puras, sem acesso ao banco).

export type ParsedItem = { name: string; quantity: number; unit: string | null };
export type ShopItem = {
  id: string;
  list_id: string;
  created_by: string;
  name: string;
  quantity: number;
  unit: string | null;
  est_price: number | null;
  checked: boolean;
  position: number;
};

const UNIT = "kg|g|l|ml|un|cx|pct|dz|x";
const LEAD = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})?\\b\\s*(?:de\\s+)?(.+)$`, "i");
const TRAIL = new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})?$`, "i");

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const num = (s: string) => Math.min(9999, Math.max(0.001, Number(s.replace(",", "."))));
const unitOf = (u?: string) => (u && u.toLowerCase() !== "x" ? u.toLowerCase() : null);

function parseOne(raw: string): ParsedItem | null {
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s) return null;
  let m = s.match(LEAD);
  if (m && m[3].trim()) return { name: cap(m[3].trim()).slice(0, 80), quantity: num(m[1]), unit: unitOf(m[2]) };
  m = s.match(TRAIL);
  if (m) return { name: cap(m[1].trim()).slice(0, 80), quantity: num(m[2]), unit: unitOf(m[3]) };
  return { name: cap(s).slice(0, 80), quantity: 1, unit: null };
}

/** "2 leite, pão, 1kg arroz" vira três itens. Separadores: vírgula, ponto e vírgula e quebra de linha. */
export function parseShoppingInput(text: string): ParsedItem[] {
  return text
    .split(/[\n;]+|(?<!\d),|,(?!\d)/)
    .map(parseOne)
    .filter((x): x is ParsedItem => x !== null)
    .slice(0, 40);
}

export const itemTotal = (i: Pick<ShopItem, "quantity" | "est_price">): number => (i.est_price ?? 0) * i.quantity;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Total estimado (todos os itens com preço) e total do carrinho (só os marcados). */
export function listTotals(items: ShopItem[]): { estimated: number; cart: number; checked: number; total: number } {
  const estimated = r2(items.reduce((s, i) => s + itemTotal(i), 0));
  const inCart = items.filter((i) => i.checked);
  return { estimated, cart: r2(inCart.reduce((s, i) => s + itemTotal(i), 0)), checked: inCart.length, total: items.length };
}

/** "2 un", "1 kg" ou vazio quando é 1 unidade sem medida. */
export function quantityLabel(i: Pick<ShopItem, "quantity" | "unit">): string {
  const q = Number.isInteger(i.quantity) ? String(i.quantity) : String(Number(i.quantity.toFixed(3))).replace(".", ",");
  if (i.unit) return `${q} ${i.unit}`;
  return i.quantity === 1 ? "" : `${q}×`;
}

/** Itens que a pessoa mais comprou nas listas antigas e que não estão na lista de agora. */
export function suggestNames(history: string[], current: string[], limit = 8): string[] {
  const have = new Set(current.map((n) => n.trim().toLowerCase()));
  const count = new Map<string, { name: string; n: number }>();
  for (const raw of history) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (!name || have.has(key)) continue;
    const cur = count.get(key);
    count.set(key, { name: cur?.name ?? name, n: (cur?.n ?? 0) + 1 });
  }
  return Array.from(count.values())
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, limit)
    .map((x) => x.name);
}

/** Quanto ainda cabe no limite da categoria no mês (null se não há limite). Negativo = estourou. */
export function budgetLeft(limit: number | null | undefined, spent: number): number | null {
  if (limit == null || !(limit > 0)) return null;
  return r2(limit - spent);
}
