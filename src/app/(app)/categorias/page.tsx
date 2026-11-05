"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Eye, EyeOff, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { buildClassifier, type CatFlagRow } from "@/lib/essentials";
import { CORE_ROOTS, canHide, isCoreDefault, loadCategoryState } from "@/lib/categoryVisibility";
import { BackTitle, Card, Label, Empty, ErrorNote, Toggle, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";

type Cat = { id: string; name: string; type: "income" | "expense"; parent_id: string | null; color: string | null; is_default: boolean; user_id: string | null };

const SWATCHES = ["#EF4444", "#F97316", "#F59E0B", "#22C55E", "#14B8A6", "#0EA5E9", "#6366F1", "#A855F7", "#EC4899", "#64748B"];
const PARENT_COLORS: Record<string, string> = {
  "Alimentação": "#EF4444", "Compras": "#F97316", "Educação": "#22C55E", "Lazer": "#A855F7", "Moradia": "#EF4444",
  "Saúde": "#14B8A6", "Serviços": "#6366F1", "Taxas/Impostos": "#0EA5E9", "Transporte": "#F97316", "Pet": "#F59E0B",
  "Viagens": "#F59E0B", "Doações": "#F59E0B", "Dívidas e financiamentos": "#14B8A6", "Seguros": "#0EA5E9", "Negócio": "#6366F1",
  "Outros": "#64748B", "Salário": "#22C55E", "Rendimentos": "#6366F1", "Pix / Transferência": "#0EA5E9", "Vendas e serviços": "#22C55E",
};

function colorOf(c: Cat, parent?: Cat): string {
  return c.color ?? PARENT_COLORS[parent?.name ?? c.name] ?? SWATCHES[(c.name.length) % SWATCHES.length];
}

export default function CategoriasPage() {
  const { supabase, userId, ready } = useSupabase();
  const [cats, setCats] = useState<Cat[]>([]);
  const [flags, setFlags] = useState<CatFlagRow[]>([]);
  const [tab, setTab] = useState<"expense" | "income">("expense");
  const [q, setQ] = useState("");
  const [onlySubs, setOnlySubs] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id?: string; name: string; parent_id: string; color: string } | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [canSave, setCanSave] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const load = useCallback(async () => {
    const [st, f] = await Promise.all([
      loadCategoryState(supabase, userId),
      supabase.from("category_flags").select("category_id,is_essential,is_benefit"),
    ]);
    if (st.error) { setError("Não foi possível carregar as categorias."); return; }
    setError(null);
    setCats(st.cats as Cat[]);
    setHidden(st.hidden);
    setCanSave(st.canSave);
    setFlags((f.data ?? []) as CatFlagRow[]);
  }, [supabase, userId]);

  // Mostrar/esconder: só muda a lista de escolha da pessoa. Ao mostrar uma principal, as subcategorias prontas dela aparecem junto.
  async function setVisible(c: Cat, visible: boolean) {
    if (!canSave) { setError("Esconder categorias fica disponível depois da próxima atualização do app."); return; }
    const ids = [c.id];
    if (visible && !c.parent_id) cats.filter((x) => x.parent_id === c.id && canHide(x, userId)).forEach((x) => ids.push(x.id));
    if (visible && c.parent_id && hidden.has(c.parent_id)) ids.push(c.parent_id);
    const { error: err } = await supabase.from("category_visibility").upsert(ids.map((id) => ({ user_id: userId, category_id: id, hidden: !visible })), { onConflict: "user_id,category_id" });
    if (err) { setError("Não foi possível salvar."); return; }
    load();
  }

  // Deixa só as prontas básicas à mostra (as criadas pela pessoa continuam). Nada é apagado.
  async function keepOnlyBasics() {
    if (!canSave) { setError("Esconder categorias fica disponível depois da próxima atualização do app."); return; }
    if (!window.confirm("Esconder as categorias prontas que não são básicas? Nada é apagado e você pode mostrar de novo quando quiser.")) return;
    const byId = new Map(cats.map((c) => [c.id, c]));
    const rows = cats.filter((c) => c.is_default && !c.parent_id).map((c) => ({ user_id: userId, category_id: c.id, hidden: !isCoreDefault(c, byId) }));
    const { error: err } = await supabase.from("category_visibility").upsert(rows, { onConflict: "user_id,category_id" });
    if (err) { setError("Não foi possível salvar."); return; }
    load();
  }

  const classifier = useMemo(() => buildClassifier(cats, flags), [cats, flags]);

  // Essencial/benefício é uma preferência (não exige dono da categoria, nem mexe na categoria padrão).
  async function setFlag(categoryId: string, patch: { is_essential?: boolean } | { is_benefit?: boolean }) {
    const { error: err } = await supabase.from("category_flags").upsert({ user_id: userId, category_id: categoryId, ...patch }, { onConflict: "user_id,category_id" });
    if (err) { setError("Não foi possível salvar a marcação."); return; }
    load();
  }

  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("jakash:changed", h);
    return () => window.removeEventListener("jakash:changed", h);
  }, [load]);

  const allParents = useMemo(() => cats.filter((c) => c.type === tab && !c.parent_id), [cats, tab]);
  const parents = useMemo(() => allParents.filter((c) => !hidden.has(c.id)), [allParents, hidden]);
  const suggestions = useMemo(() => allParents.filter((c) => hidden.has(c.id)), [allParents, hidden]);
  const childrenOf = useCallback((id: string) => cats.filter((c) => c.parent_id === id), [cats]);

  const needle = q.trim().toLowerCase();
  const visible = parents.filter((p) => {
    const subs = childrenOf(p.id);
    if (onlySubs && subs.length === 0) return false;
    if (!needle) return true;
    return p.name.toLowerCase().includes(needle) || subs.some((s) => s.name.toLowerCase().includes(needle));
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !editing.name.trim()) { setError("Informe o nome da categoria."); return; }
    const parent = cats.find((c) => c.id === editing.parent_id);
    const payload = { name: editing.name.trim(), color: editing.color, parent_id: editing.parent_id || null, type: parent?.type ?? tab };
    const res = editing.id
      ? await supabase.from("categories").update({ name: payload.name, color: payload.color }).eq("id", editing.id)
      : await supabase.from("categories").insert({ ...payload, user_id: userId, is_default: false });
    if (res.error) { setError("Não foi possível salvar."); return; }
    setEditing(null);
    load();
  }

  async function remove(c: Cat) {
    if (!window.confirm(`Excluir "${c.name}"? Os lançamentos ficam sem categoria.`)) return;
    const { error: err } = await supabase.from("categories").delete().eq("id", c.id);
    if (err) setError("Não foi possível excluir."); else load();
  }

  // Pill de "Essencial"/"Benefício": funciona em qualquer categoria, inclusive as padrão (é uma preferência à parte).
  const FlagPill = ({ c, kind }: { c: Cat; kind: "essential" | "benefit" }) => {
    const on = kind === "essential" ? classifier.isEssential(c.id) : classifier.isBenefit(c.id);
    const label = kind === "essential" ? "Essencial" : "Benefício";
    return (
      <button type="button" onClick={() => setFlag(c.id, kind === "essential" ? { is_essential: !on } : { is_benefit: !on })}
        aria-pressed={on}
        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold border ${on ? "bg-brand-dark text-white border-brand-dark dark:bg-brand-vivid dark:border-brand-vivid" : "border-gray-200 dark:border-white/10 text-gray-400"}`}>
        {label}
      </button>
    );
  };

  const Row = ({ c, parent }: { c: Cat; parent?: Cat }) => {
    const own = !c.is_default && c.user_id === userId;
    const off = hidden.has(c.id);
    return (
      <div className={`flex items-center gap-3 py-2.5 ${off ? "opacity-50" : ""}`}>
        <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: colorOf(c, parent) }} />
        <span className="flex-1 text-sm font-medium truncate">{c.name}{off && <span className="text-[11px] text-gray-400 font-normal"> · escondida</span>}</span>
        {!off && <FlagPill c={c} kind={c.type === "income" ? "benefit" : "essential"} />}
        {own ? (
          <span className="flex gap-3 text-gray-400">
            <button aria-label="Editar" onClick={() => setEditing({ id: c.id, name: c.name, parent_id: c.parent_id ?? "", color: c.color ?? colorOf(c, parent) })}><Pencil size={15} /></button>
            <button aria-label="Excluir" onClick={() => remove(c)} className="hover:text-red-500"><Trash2 size={15} /></button>
          </span>
        ) : <HideButton c={c} />}
      </div>
    );
  };

  const HideButton = ({ c }: { c: Cat }) => {
    const off = hidden.has(c.id);
    return (
      <button type="button" onClick={() => setVisible(c, off)} aria-label={off ? `Mostrar ${c.name}` : `Esconder ${c.name}`}
        title={off ? "Mostrar nas listas" : "Esconder das listas (não apaga nada)"} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
        {off ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    );
  };

  return (
    <div className="max-w-3xl mx-auto pb-20">
      <BackTitle title="Categorias" subtitle="Crie suas categorias e subcategorias. As prontas que você não usa, é só esconder." />
      <p className="text-xs text-gray-400 -mt-3 mb-4">
        {tab === "expense"
          ? "Toque em “Essencial” para marcar o que é básico (moradia, alimentação...). Usado na Reserva e no resumo em Relatórios."
          : "Toque em “Benefício” para marcar vale-alimentação, vale-refeição etc. — contam na renda, mas não como dinheiro livre."}
      </p>

      <button onClick={() => setEditing({ name: "", parent_id: "", color: SWATCHES[6] })} className={btnCls + " w-full mb-4"}><Plus size={18} /> Adicionar categoria</button>

      <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-brand-dark/10 dark:bg-[#161616] mb-4">
        {([["expense", "Despesas"], ["income", "Receitas"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`py-2.5 rounded-xl text-sm font-bold ${tab === k ? "bg-white dark:bg-[#262626] shadow-sm" : "text-gray-500"}`}>{l}</button>
        ))}
      </div>

      <Card className="mb-4 space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className={inputCls + " !pl-10"} placeholder="Buscar por nome" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Toggle checked={onlySubs} onChange={setOnlySubs} label="Só com subcategorias" />
      </Card>

      <ErrorNote message={error} />

      <div className="space-y-3 mt-3">
        {visible.length === 0 && <Card><Empty>Nenhuma categoria encontrada.</Empty></Card>}
        {visible.map((p) => {
          const subs = childrenOf(p.id).filter((s) => !needle || p.name.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle));
          const expanded = open[p.id] ?? Boolean(needle);
          return (
            <Card key={p.id} className="!p-4">
              <div className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full shrink-0" style={{ background: colorOf(p) }} />
                <span className="flex-1 font-extrabold truncate">{p.name}</span>
                <FlagPill c={p} kind={p.type === "income" ? "benefit" : "essential"} />
                {!p.is_default && p.user_id === userId ? (
                  <span className="flex gap-3 text-gray-400 mr-1">
                    <button aria-label="Editar" onClick={() => setEditing({ id: p.id, name: p.name, parent_id: "", color: p.color ?? colorOf(p) })}><Pencil size={15} /></button>
                    <button aria-label="Excluir" onClick={() => remove(p)} className="hover:text-red-500"><Trash2 size={15} /></button>
                  </span>
                ) : <span className="mr-1"><HideButton c={p} /></span>}
                <button onClick={() => setOpen({ ...open, [p.id]: !expanded })} aria-label="Expandir" disabled={subs.length === 0} className="text-gray-400 disabled:opacity-30">
                  <ChevronDown size={18} className={expanded ? "rotate-180" : ""} />
                </button>
              </div>
              <div className="flex items-center justify-between ml-8">
                <p className="text-xs text-gray-400">{subs.length > 0 ? `${subs.length} subcategorias` : "Sem subcategorias"}</p>
                <button type="button" onClick={() => setEditing({ name: "", parent_id: p.id, color: p.color ?? colorOf(p) })} className="text-xs font-bold text-brand-dark dark:text-brand-soft inline-flex items-center gap-1"><Plus size={13} /> Subcategoria</button>
              </div>
              {expanded && subs.length > 0 && (
                <div className="mt-2 ml-2 divide-y divide-gray-100 dark:divide-[#262626] border-t border-gray-100 dark:border-[#262626]">
                  {subs.map((s) => <Row key={s.id} c={s} parent={p} />)}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {!needle && (
        <div className="mt-6">
          {suggestions.length > 0 && (
            <Card className="!p-4">
              <button type="button" onClick={() => setShowSuggestions(!showSuggestions)} className="w-full flex items-center justify-between">
                <span className="text-left">
                  <span className="block font-extrabold">Categorias prontas escondidas ({suggestions.length})</span>
                  <span className="block text-xs text-gray-400">Toque no olho para usar uma delas.</span>
                </span>
                <ChevronDown size={18} className={`text-gray-400 ${showSuggestions ? "rotate-180" : ""}`} />
              </button>
              {showSuggestions && (
                <div className="mt-2 divide-y divide-gray-100 dark:divide-[#262626] border-t border-gray-100 dark:border-[#262626]">
                  {suggestions.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 py-2.5">
                      <span className="w-3.5 h-3.5 rounded-full shrink-0 opacity-60" style={{ background: colorOf(s) }} />
                      <span className="flex-1 text-sm font-medium truncate">{s.name}{childrenOf(s.id).length > 0 && <span className="text-[11px] text-gray-400 font-normal"> · {childrenOf(s.id).length} subcategorias</span>}</span>
                      <button type="button" onClick={() => setVisible(s, true)} className="text-xs font-bold text-brand-dark dark:text-brand-soft inline-flex items-center gap-1"><Eye size={14} /> Usar</button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
          {canSave && parents.some((p) => p.is_default && !CORE_ROOTS[p.type].includes(p.name)) && (
            <button type="button" onClick={keepOnlyBasics} className="text-xs font-bold text-gray-500 underline mt-2">Deixar só as categorias prontas básicas</button>
          )}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full md:max-w-md bg-white dark:bg-[#161616] rounded-t-[32px] md:rounded-[32px] p-6 space-y-4">
            <h2 className="text-xl font-extrabold">{editing.id ? "Editar categoria" : editing.parent_id ? "Nova subcategoria" : "Nova categoria"}</h2>
            <div><Label>Nome</Label><input autoFocus className={inputCls} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ex.: Academia" /></div>
            {!editing.id && (
              <div><Label>Dentro de (opcional)</Label>
                <select className={inputCls} value={editing.parent_id} onChange={(e) => setEditing({ ...editing, parent_id: e.target.value })}>
                  <option value="">Categoria principal ({tab === "expense" ? "despesa" : "receita"})</option>
                  {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></div>
            )}
            <div><Label>Cor</Label>
              <div className="flex flex-wrap gap-2">{SWATCHES.map((c) => (
                <button type="button" key={c} onClick={() => setEditing({ ...editing, color: c })} aria-label={c} className={`w-8 h-8 rounded-full ${editing.color === c ? "ring-2 ring-offset-2 ring-gray-900 dark:ring-white dark:ring-offset-[#161616]" : ""}`} style={{ background: c }} />
              ))}</div></div>
            <ErrorNote message={error} />
            <div className="flex gap-2"><button type="button" onClick={() => setEditing(null)} className={btnGhostCls + " flex-1 !py-3"}>Cancelar</button><button className={btnCls + " flex-1"} type="submit">Salvar</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
