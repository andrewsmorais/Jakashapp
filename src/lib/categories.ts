export type CatRow = { id: string; name: string; type: "income" | "expense"; parent_id: string | null };

// Opções "Principal" e "Principal › Sub" para selects.
export function categoryOptions(cats: CatRow[], type: "income" | "expense"): { id: string; label: string }[] {
  const ofType = cats.filter((c) => c.type === type);
  const parents = ofType.filter((c) => !c.parent_id).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const out: { id: string; label: string }[] = [];
  for (const p of parents) {
    out.push({ id: p.id, label: p.name });
    for (const s of ofType.filter((c) => c.parent_id === p.id).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))) {
      out.push({ id: s.id, label: `${p.name} › ${s.name}` });
    }
  }
  return out;
}

// Id da categoria principal (sobe um nível se for subcategoria).
export function rootId(cats: CatRow[], id: string | null): string | null {
  if (!id) return null;
  return cats.find((c) => c.id === id)?.parent_id ?? id;
}
