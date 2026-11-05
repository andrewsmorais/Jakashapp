"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, Landmark, Pencil, Plus, Wallet, PiggyBank, TrendingUp } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { useHideValues } from "@/lib/useHideValues";
import { usePartnership } from "@/lib/usePartnership";
import { WhoBadge } from "@/components/WhoBadge";
import { brl, parseMoney } from "@/lib/format";
import { BackTitle, Card, Label, Empty, ErrorNote, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";
import { SectionTabs } from "@/components/SectionTabs";
import { InstitutionBadge, InstitutionSelect } from "@/components/InstitutionBadge";
import { loadLogos } from "@/lib/logoImage";

type Row = { id: string; user_id: string; name: string; kind: string; initial_balance: number; archived: boolean; institution: string | null };
type Bal = { id: string; balance: number };

const KINDS: Record<string, { label: string; icon: typeof Landmark }> = {
  corrente: { label: "Conta corrente", icon: Landmark },
  poupanca: { label: "Poupança", icon: PiggyBank },
  dinheiro: { label: "Dinheiro", icon: Wallet },
  investimento: { label: "Investimento", icon: TrendingUp },
};

export default function ContasBancariasPage() {
  const { supabase, userId, ready } = useSupabase();
  const { money } = useHideValues();
  const { nameOf } = usePartnership();
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [rows, setRows] = useState<Row[]>([]);
  const [bal, setBal] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<{ name: string; kind: string; balance: string; institution: string; logo: string | null }>({ name: "", kind: "corrente", balance: "", institution: "", logo: null });
  const [logos, setLogos] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from("accounts").select("id,user_id,name,kind,initial_balance,archived,institution").order("created_at"),
      supabase.rpc("account_balances"),
    ]);
    if (a.error || b.error) { setError("Não foi possível carregar as contas."); return; }
    setError(null);
    setRows(((a.data ?? []) as Row[]).map((r) => ({ ...r, initial_balance: Number(r.initial_balance) })));
    setBal(Object.fromEntries(((b.data ?? []) as Bal[]).map((x) => [x.id, Number(x.balance)])));
    setLogos(await loadLogos(supabase));
  }, [supabase]);

  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("jakash:changed", h);
    return () => window.removeEventListener("jakash:changed", h);
  }, [load]);

  const shown = rows.filter((r) => (tab === "active" ? !r.archived : r.archived));
  const total = rows.filter((r) => !r.archived).reduce((s, r) => s + (bal[r.id] ?? 0), 0);
  const activeCount = rows.filter((r) => !r.archived).length;

  function openNew() { setForm({ name: "", kind: "corrente", balance: "", institution: "", logo: null }); setEditing("new"); setError(null); }
  function openEdit(r: Row) { setForm({ name: r.name, kind: r.kind, balance: String(bal[r.id] ?? 0).replace(".", ","), institution: r.institution ?? "", logo: logos[r.id] ?? null }); setEditing(r.id); setError(null); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const typed = form.balance.trim() === "" ? 0 : parseMoney(form.balance);
    if (!form.name.trim() || Number.isNaN(typed)) { setError("Informe um nome e um saldo válidos."); return; }
    if (editing === "new") {
      const { error: err } = await supabase.from("accounts").insert({ user_id: userId, name: form.name.trim(), kind: form.kind, initial_balance: typed, institution: form.institution || null, ...(form.logo ? { logo: form.logo } : {}) });
      if (err) { setError("Não foi possível salvar."); return; }
    } else if (editing) {
      const cur = rows.find((r) => r.id === editing);
      if (!cur) return;
      // Ajusta o saldo inicial para que o saldo atual fique igual ao valor informado.
      const initial = Math.round((cur.initial_balance + (typed - (bal[cur.id] ?? 0))) * 100) / 100;
      const { error: err } = await supabase.from("accounts").update({ name: form.name.trim(), kind: form.kind, initial_balance: initial, institution: form.institution || null, ...(form.logo !== (logos[cur.id] ?? null) ? { logo: form.logo } : {}) }).eq("id", editing);
      if (err) { setError("Não foi possível salvar."); return; }
    }
    setEditing(null);
    load();
  }

  async function setArchived(id: string, archived: boolean) {
    const { error: err } = await supabase.from("accounts").update({ archived }).eq("id", id);
    if (err) setError("Não foi possível atualizar."); else load();
  }

  return (
    <div className="max-w-3xl mx-auto pb-20">
      <BackTitle title="Contas bancárias" subtitle="Acompanhe os saldos das suas contas em um só lugar." />
      <SectionTabs group="contas" />

      <button onClick={openNew} className={btnCls + " w-full mb-5"}><Plus size={18} /> Adicionar conta</button>

      <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-brand-dark/10 dark:bg-[#161616] mb-5">
        {([["active", "Ativas"], ["archived", "Arquivadas"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`py-2.5 rounded-xl text-sm font-bold ${tab === k ? "bg-white dark:bg-[#262626] shadow-sm" : "text-gray-500"}`}>{l}</button>
        ))}
      </div>

      {tab === "active" && (
        <Card className="mb-4">
          <p className="text-xs font-bold text-gray-500">Saldo total</p>
          <p className="text-3xl font-extrabold">{money(brl(total))}</p>
          <p className="text-xs text-gray-500 mt-1">{activeCount} {activeCount === 1 ? "conta" : "contas"}</p>
        </Card>
      )}

      <ErrorNote message={error} />

      <div className="space-y-3 mt-3">
        {shown.length === 0 && <Card><Empty>{tab === "active" ? "Nenhuma conta ainda. Adicione a primeira." : "Nenhuma conta arquivada."}</Empty></Card>}
        {shown.map((r) => {
          const K = KINDS[r.kind] ?? KINDS.corrente;
          return (
            <Card key={r.id} className="!p-4">
              <div className="flex items-center gap-3">
                <InstitutionBadge institution={r.institution} name={r.name} logo={logos[r.id]} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold truncate">{r.name}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">{K.label}<WhoBadge name={nameOf(r.user_id)} /></p>
                </div>
                {!r.archived && <div className="text-right"><p className="text-[10px] text-gray-400">Saldo atual</p><p className="font-extrabold">{money(brl(bal[r.id] ?? 0))}</p></div>}
              </div>
              <div className="flex gap-2 mt-3 justify-end">
                {!r.archived && <button onClick={() => openEdit(r)} className={btnGhostCls}><Pencil size={14} /> Editar</button>}
                <button onClick={() => setArchived(r.id, !r.archived)} className={btnGhostCls}>
                  {r.archived ? <><ArchiveRestore size={14} /> Restaurar</> : <><Archive size={14} /> Arquivar</>}
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 mt-6">Ao lançar pelo botão +, você escolhe em qual conta o lançamento entra.</p>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full md:max-w-md bg-white dark:bg-[#161616] rounded-t-[32px] md:rounded-[32px] p-6 space-y-4">
            <h2 className="text-xl font-extrabold">{editing === "new" ? "Nova conta" : "Editar conta"}</h2>
            <div><Label>Nome da conta</Label><input autoFocus className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Nubank" /></div>
            <div><Label>Tipo</Label>
              <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select></div>
            <InstitutionSelect value={form.institution} onChange={(v) => setForm({ ...form, institution: v })} name={form.name} logo={form.logo} onLogoChange={(v) => setForm({ ...form, logo: v })} />
            <div><Label>{editing === "new" ? "Saldo atual" : "Saldo atual (ajusta o valor da conta)"}</Label><input className={inputCls} inputMode="decimal" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} placeholder="0,00" /></div>
            <ErrorNote message={error} />
            <div className="flex gap-2"><button type="button" onClick={() => setEditing(null)} className={btnGhostCls + " flex-1 !py-3"}>Cancelar</button><button className={btnCls + " flex-1"} type="submit">Salvar</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
