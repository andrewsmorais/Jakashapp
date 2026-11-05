"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, FileCheck, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { brl, parseMoney } from "@/lib/format";
import {
  CODIGOS_NFSE_URL, EMPTY_ITEM_FORM, NCM_CONSULTA_URL, formatCfop, formatNcm, itemFormFrom, validateItemForm,
  type CatalogItem, type ItemForm, type NotaKind,
} from "@/lib/meiNota";
import { BackTitle, Card, Empty, ErrorNote, Label, btnCls, btnGhostCls, inputCls } from "@/components/ui/page";

const COLUMNS = "id,kind,name,description,unit_price,unit,ctrib_nac,nbs,municipal_code,ncm,cfop,archived";
const UNITS = ["un", "h", "dia", "kg", "g", "m", "m²", "l", "cx", "pç", "par"];

const chip = "rounded-full px-2 py-0.5 text-[10px] font-bold";
const chipOk = `${chip} bg-brand-dark/10 text-brand-dark dark:bg-[#262626] dark:text-brand-soft`;
const chipWarn = `${chip} bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300`;

export default function ProdutosPage() {
  const { supabase, userId, ready } = useSupabase();
  const [tab, setTab] = useState<NotaKind>("servico");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [form, setForm] = useState<ItemForm>(EMPTY_ITEM_FORM);
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [opened, setOpened] = useState(false);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from("mei_items").select(COLUMNS).order("name");
    if (err) setError("Não foi possível carregar o catálogo.");
    else setError(null);
    setItems(((data ?? []) as CatalogItem[]).map((x) => ({ ...x, unit_price: Number(x.unit_price) })));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);

  const flash = (t: string) => { setNote(t); setTimeout(() => setNote(null), 2800); };

  function edit(it: CatalogItem) {
    setEditing(it.id);
    setTab(it.kind);
    setForm(itemFormFrom(it));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Link vindo da ficha da nota: /mei/produtos?edit=<id> abre o item para completar o código que faltava.
  useEffect(() => {
    if (opened || items.length === 0) return;
    setOpened(true);
    try {
      const id = new URLSearchParams(window.location.search).get("edit");
      const it = id ? items.find((x) => x.id === id) : undefined;
      if (it) { setEditing(it.id); setTab(it.kind); setForm(itemFormFrom(it)); }
    } catch { /* sem parâmetro */ }
  }, [items, opened]);

  function switchTab(k: NotaKind) {
    setTab(k);
    setEditing(null);
    setForm({ ...EMPTY_ITEM_FORM, kind: k });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = validateItemForm(form, parseMoney(form.unit_price));
    if (!parsed.ok) { setError(parsed.error); return; }
    const { error: err } = editing
      ? await supabase.from("mei_items").update(parsed.row).eq("id", editing)
      : await supabase.from("mei_items").insert({ user_id: userId, ...parsed.row });
    if (err) { setError("Não foi possível salvar."); return; }
    flash(editing ? "Item atualizado." : "Item cadastrado.");
    setEditing(null);
    setForm({ ...EMPTY_ITEM_FORM, kind: tab });
    load();
  }

  async function setArchived(id: string, archived: boolean) {
    const { error: err } = await supabase.from("mei_items").update({ archived }).eq("id", id);
    if (err) setError("Não foi possível atualizar."); else load();
  }

  async function remove(it: CatalogItem) {
    if (!window.confirm(`Excluir "${it.name}" do catálogo? Recibos e notas já feitos não mudam.`)) return;
    const { error: err } = await supabase.from("mei_items").delete().eq("id", it.id);
    if (err) setError("Não foi possível excluir."); else { if (editing === it.id) switchTab(tab); load(); }
  }

  const q = query.trim().toLowerCase();
  const ofTab = items.filter((x) => x.kind === tab);
  const visible = ofTab.filter((x) => (showArchived || !x.archived)
    && (!q || [x.name, x.description, x.ctrib_nac, x.nbs, x.ncm, x.cfop].some((v) => (v ?? "").toLowerCase().includes(q))));
  const counts = { servico: items.filter((x) => x.kind === "servico" && !x.archived).length, produto: items.filter((x) => x.kind === "produto" && !x.archived).length };
  const set = (patch: Partial<ItemForm>) => setForm((f) => ({ ...f, ...patch }));
  const isService = tab === "servico";

  return (
    <div className="max-w-3xl mx-auto pb-20 space-y-6">
      <BackTitle title="Produtos e serviços" subtitle="Seu catálogo: o que você vende, com o valor e os códigos que o emissor da nota fiscal pede. Serve para recibos e para a ficha da nota." href="/mei" />
      <ErrorNote message={error} />
      {note && <p className="text-sm font-bold text-emerald-600">{note}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="tablist">
          {([["servico", "Serviços"], ["produto", "Produtos"]] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => switchTab(k)}
              className={`rounded-full px-5 py-2 text-sm font-bold transition-colors ${tab === k ? "bg-brand-dark text-white dark:bg-brand-vivid" : "bg-white/70 dark:bg-[#1E1E1E] text-gray-600 dark:text-gray-300"}`}>
              {label} ({counts[k]})
            </button>
          ))}
        </div>
        <Link href="/mei/nota" className={btnGhostCls + " !py-2.5 !px-4"}><FileCheck size={14} /> Montar ficha da nota</Link>
      </div>

      <Card>
        <h2 className="font-extrabold text-lg mb-3">{editing ? (isService ? "Editar serviço" : "Editar produto") : (isService ? "Novo serviço" : "Novo produto")}</h2>
        <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><Label>Nome</Label>
            <input className={inputCls} maxLength={120} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={isService ? "Ex.: Corte de cabelo" : "Ex.: Camiseta algodão"} /></div>
          <div className="sm:col-span-2"><Label>Descrição (opcional)</Label>
            <textarea className={inputCls + " resize-none"} rows={2} maxLength={500} value={form.description} onChange={(e) => set({ description: e.target.value })}
              placeholder={isService ? "Vai para o campo “Descrição do serviço” da nota" : "Detalhes que aparecem na descrição do produto"} /></div>
          <div><Label>Valor padrão (R$)</Label>
            <input className={inputCls} inputMode="decimal" value={form.unit_price} onChange={(e) => set({ unit_price: e.target.value })} placeholder="0,00" /></div>
          <div><Label>Unidade (opcional)</Label>
            <input className={inputCls} maxLength={10} list="mei-units" value={form.unit} onChange={(e) => set({ unit: e.target.value })} placeholder={isService ? "h, dia, un..." : "un, kg, m..."} />
            <datalist id="mei-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist></div>

          {isService ? (
            <>
              <div><Label>Código de tributação nacional</Label>
                <input className={inputCls} maxLength={10} inputMode="numeric" value={form.ctrib_nac} onChange={(e) => set({ ctrib_nac: e.target.value })} placeholder="01.01.01" /></div>
              <div><Label>Item da NBS (opcional)</Label>
                <input className={inputCls} maxLength={15} inputMode="numeric" value={form.nbs} onChange={(e) => set({ nbs: e.target.value })} placeholder="1.0101.10.00" /></div>
              <div className="sm:col-span-2"><Label>Código complementar do município (opcional)</Label>
                <input className={inputCls} maxLength={10} value={form.municipal_code} onChange={(e) => set({ municipal_code: e.target.value })} placeholder="Só se o seu município tiver" /></div>
              <p className="sm:col-span-2 text-xs text-gray-500">
                O código tem 6 dígitos no padrão 01.01.01. Procure na{" "}
                <a className="font-bold underline underline-offset-2" href={CODIGOS_NFSE_URL} target="_blank" rel="noopener noreferrer">lista oficial</a>{" "}
                ou digite parte do nome do serviço direto no Emissor Nacional e copie o código que ele mostrar. O Jakash só confere o formato, não se o código existe.
              </p>
            </>
          ) : (
            <>
              <div><Label>NCM</Label>
                <input className={inputCls} maxLength={12} inputMode="numeric" value={form.ncm} onChange={(e) => set({ ncm: e.target.value })} placeholder="0000.00.00" /></div>
              <div><Label>CFOP</Label>
                <input className={inputCls} maxLength={6} inputMode="numeric" value={form.cfop} onChange={(e) => set({ cfop: e.target.value })} placeholder="5.102" /></div>
              <p className="sm:col-span-2 text-xs text-gray-500">
                O NCM tem 8 dígitos e costuma vir na nota de compra do produto; também dá para consultar no{" "}
                <a className="font-bold underline underline-offset-2" href={NCM_CONSULTA_URL} target="_blank" rel="noopener noreferrer">Portal Único Siscomex</a>.
                O CFOP tem 4 dígitos: na revenda costuma ser 5.102 (venda no mesmo estado) ou 6.102 (outro estado), e 5.101/6.101 para produção própria. Confira com seu contador.
              </p>
            </>
          )}
          <div className="sm:col-span-2 flex gap-2">
            <button className={btnCls} type="submit">{editing ? "Salvar" : <><Plus size={16} /> Cadastrar</>}</button>
            {editing && <button type="button" className={btnGhostCls + " !py-2.5 !px-4"} onClick={() => switchTab(tab)}>Cancelar</button>}
          </div>
        </form>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-extrabold text-lg">{isService ? "Seus serviços" : "Seus produtos"}</h2>
          {ofTab.some((x) => x.archived) && (
            <button type="button" className="text-xs font-bold text-brand-dark dark:text-brand-soft" onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Ocultar arquivados" : "Mostrar arquivados"}</button>
          )}
        </div>
        <div className="relative mb-2">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className={inputCls + " !pl-10"} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome ou código" aria-label="Buscar no catálogo" />
        </div>
        {loading ? <Empty>Carregando…</Empty> : visible.length === 0 ? (
          <Empty>{q ? "Nada encontrado para essa busca." : isService ? "Nenhum serviço ainda. Cadastre o primeiro acima." : "Nenhum produto ainda. Cadastre o primeiro acima."}</Empty>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-[#262626]">
            {visible.map((it) => (
              <li key={it.id} className={`py-3 flex items-start justify-between gap-3 ${it.archived ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-bold truncate">{it.name}</p>
                  {it.description && <p className="text-xs text-gray-500 line-clamp-2">{it.description}</p>}
                  <p className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-extrabold text-emerald-600">{it.unit_price > 0 ? brl(it.unit_price) : "Sem valor padrão"}{it.unit ? ` / ${it.unit}` : ""}</span>
                    {it.kind === "servico" ? (
                      <>
                        <span className={it.ctrib_nac ? chipOk : chipWarn}>{it.ctrib_nac ? `Código ${it.ctrib_nac}` : "Sem código de tributação"}</span>
                        {it.nbs && <span className={chipOk}>NBS {it.nbs}</span>}
                      </>
                    ) : (
                      <>
                        <span className={it.ncm ? chipOk : chipWarn}>{it.ncm ? `NCM ${formatNcm(it.ncm)}` : "Sem NCM"}</span>
                        <span className={it.cfop ? chipOk : chipWarn}>{it.cfop ? `CFOP ${formatCfop(it.cfop)}` : "Sem CFOP"}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" className="p-2 text-gray-400 hover:text-brand-dark" onClick={() => edit(it)} aria-label={`Editar ${it.name}`}><Pencil size={16} /></button>
                  <button type="button" className="p-2 text-gray-400 hover:text-brand-dark" onClick={() => setArchived(it.id, !it.archived)} aria-label={it.archived ? `Restaurar ${it.name}` : `Arquivar ${it.name}`}>
                    {it.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                  </button>
                  <button type="button" className="p-2 text-gray-400 hover:text-red-500" onClick={() => remove(it)} aria-label={`Excluir ${it.name}`}><Trash2 size={16} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-gray-400">Os códigos são os que você digita: o Jakash não consulta sistema fiscal e não emite nota. Confirme com seu contador.</p>
    </div>
  );
}
