"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, AlertCircle, ArchiveRestore, ChevronDown, ChevronUp, Pencil, Plus, X } from "lucide-react";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSupabase } from "@/lib/useSupabase";
import { useHideValues } from "@/lib/useHideValues";
import { brl, currentMonth, formatDateBR, monthRange, parseMoney, shiftMonth, todayISO } from "@/lib/format";
import { BackTitle, Card, Disclaimer, Empty, ErrorNote, Label, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";
import { SectionTabs } from "@/components/SectionTabs";

type Inv = { id: string; name: string; kind: string; institution: string | null; invested: number; current_value: number; archived: boolean };
type MovKind = "aporte" | "resgate" | "valor";
type Mov = { id: string; investment_id: string; kind: MovKind; amount: number; moved_on: string; value_after: number; note: string | null };
type Acc = { id: string; name: string };

const KINDS: Record<string, { label: string; color: string }> = {
  renda_fixa: { label: "Renda fixa", color: "#5B5BF0" },
  tesouro: { label: "Tesouro Direto", color: "#8B5CF6" },
  acoes: { label: "Ações", color: "#38BDF8" },
  fiis: { label: "Fundos imobiliários", color: "#10B981" },
  cripto: { label: "Criptomoedas", color: "#F59E0B" },
  fundos: { label: "Fundos", color: "#EC4899" },
  previdencia: { label: "Previdência", color: "#14B8A6" },
  poupanca: { label: "Poupança", color: "#94A3B8" },
  outros: { label: "Outros", color: "#64748B" },
};
const MOV_LABEL: Record<MovKind, string> = { aporte: "Aporte", resgate: "Resgate", valor: "Atualização de valor" };
const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const EMPTY_FORM = { name: "", kind: "renda_fixa", institution: "", invested: "", current: "" };

const pct = (value: number, invested: number) => (invested > 0 ? ((value - invested) / invested) * 100 : null);
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1).replace(".", ",")}%`;

export default function InvestimentosPage() {
  const { supabase, userId, ready } = useSupabase();
  const { money } = useHideValues();
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [invs, setInvs] = useState<Inv[]>([]);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [accs, setAccs] = useState<Acc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [move, setMove] = useState<{ inv: Inv; kind: MovKind } | null>(null);
  const [mform, setMform] = useState({ amount: "", date: todayISO(), account_id: "", note: "" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [i, m, a] = await Promise.all([
      supabase.from("investments").select("id,name,kind,institution,invested,current_value,archived").order("created_at"),
      supabase.from("investment_movements").select("id,investment_id,kind,amount,moved_on,value_after,note").order("moved_on").order("created_at").limit(5000),
      supabase.from("accounts").select("id,name").eq("archived", false).order("created_at"),
    ]);
    if (i.error || m.error) { setError("Não foi possível carregar os investimentos."); return; }
    setError(null);
    setInvs(((i.data ?? []) as Inv[]).map((x) => ({ ...x, invested: Number(x.invested), current_value: Number(x.current_value) })));
    setMovs(((m.data ?? []) as Mov[]).map((x) => ({ ...x, amount: Number(x.amount), value_after: Number(x.value_after) })));
    setAccs((a.data ?? []) as Acc[]);
  }, [supabase]);

  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("jakash:changed", h);
    return () => window.removeEventListener("jakash:changed", h);
  }, [load]);

  const active = invs.filter((x) => !x.archived);
  // Hábito de investir todo mês (o método "primo pobre" trata investimento como obrigatório, não sobra).
  const investedThisMonth = movs.some((m) => m.kind === "aporte" && m.moved_on.slice(0, 7) === currentMonth());
  const shown = invs.filter((x) => (tab === "active" ? !x.archived : x.archived));
  const totalValue = active.reduce((s, x) => s + x.current_value, 0);
  const totalInvested = active.reduce((s, x) => s + x.invested, 0);
  const profit = totalValue - totalInvested;
  const profitPct = pct(totalValue, totalInvested);

  const allocation = useMemo(() => {
    const by: Record<string, number> = {};
    for (const x of active) if (x.current_value > 0) by[x.kind] = (by[x.kind] ?? 0) + x.current_value;
    return Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, name: KINDS[k]?.label ?? "Outros", value: v, color: KINDS[k]?.color ?? "#64748B" }));
  }, [active]);

  // Evolução do patrimônio: valor de cada investimento no fim de cada um dos últimos 12 meses.
  const series = useMemo(() => {
    const cur = currentMonth();
    const out: { label: string; value: number }[] = [];
    for (let k = 11; k >= 0; k--) {
      const m = shiftMonth(cur, -k);
      const end = monthRange(m).end;
      let sum = 0;
      for (const inv of active) {
        if (m === cur) { sum += inv.current_value; continue; }
        let last = 0;
        for (const mv of movs) if (mv.investment_id === inv.id && mv.moved_on < end) last = mv.value_after;
        sum += last;
      }
      out.push({ label: MONTH_SHORT[Number(m.slice(5)) - 1], value: Math.round(sum * 100) / 100 });
    }
    return out;
  }, [active, movs]);
  const showChart = movs.length >= 2 && series.filter((p) => p.value > 0).length >= 2;

  function openNew() { setForm(EMPTY_FORM); setEditing("new"); setError(null); setConfirmDelete(false); }
  function openEdit(x: Inv) { setForm({ name: x.name, kind: x.kind, institution: x.institution ?? "", invested: "", current: "" }); setEditing(x.id); setError(null); setConfirmDelete(false); }
  function openMove(inv: Inv, kind: MovKind) {
    setMove({ inv, kind });
    setMform({ amount: kind === "valor" ? String(inv.current_value).replace(".", ",") : "", date: todayISO(), account_id: "", note: "" });
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Dê um nome ao investimento."); return; }
    setBusy(true);
    if (editing === "new") {
      const invested = form.invested.trim() === "" ? 0 : parseMoney(form.invested);
      const current = form.current.trim() === "" ? invested : parseMoney(form.current);
      if (Number.isNaN(invested) || Number.isNaN(current) || invested < 0 || current < 0) { setError("Informe valores válidos."); setBusy(false); return; }
      const ins = await supabase.from("investments")
        .insert({ user_id: userId, name: form.name.trim(), kind: form.kind, institution: form.institution.trim() || null, invested, current_value: current })
        .select("id").single();
      if (ins.error || !ins.data) { setError("Não foi possível salvar."); setBusy(false); return; }
      if (current > 0) {
        await supabase.from("investment_movements").insert({
          user_id: userId, investment_id: ins.data.id, kind: "valor", amount: current, moved_on: todayISO(), value_after: current, note: "Saldo inicial",
        });
      }
    } else if (editing) {
      const { error: err } = await supabase.from("investments").update({ name: form.name.trim(), kind: form.kind, institution: form.institution.trim() || null }).eq("id", editing);
      if (err) { setError("Não foi possível salvar."); setBusy(false); return; }
    }
    setBusy(false);
    setEditing(null);
    window.dispatchEvent(new Event("jakash:changed"));
  }

  async function setArchived(id: string, archived: boolean) {
    const { error: err } = await supabase.from("investments").update({ archived }).eq("id", id);
    if (err) setError("Não foi possível atualizar."); else window.dispatchEvent(new Event("jakash:changed"));
  }

  async function remove() {
    if (!editing || editing === "new") return;
    const { error: err } = await supabase.from("investments").delete().eq("id", editing);
    if (err) { setError("Não foi possível excluir."); return; }
    setEditing(null);
    window.dispatchEvent(new Event("jakash:changed"));
  }

  async function submitMove(e: React.FormEvent) {
    e.preventDefault();
    if (!move) return;
    const amount = parseMoney(mform.amount);
    if (Number.isNaN(amount) || amount < 0 || (move.kind !== "valor" && amount === 0)) { setError("Informe um valor válido."); return; }
    setBusy(true);
    const { error: err } = await supabase.rpc("investment_move", {
      p_investment: move.inv.id, p_kind: move.kind, p_amount: amount, p_date: mform.date,
      p_account: move.kind === "valor" ? null : mform.account_id || null, p_note: mform.note.trim() || null,
    });
    setBusy(false);
    if (err) { setError(err.message || "Não foi possível registrar."); return; }
    setMove(null);
    window.dispatchEvent(new Event("jakash:changed"));
  }

  return (
    <div className="max-w-3xl mx-auto pb-20">
      <BackTitle title="Investimentos" subtitle="Acompanhe o que você já investiu e quanto rendeu." />
      <SectionTabs group="guardar" />

      <button onClick={openNew} className={btnCls + " w-full mb-5"}><Plus size={18} /> Adicionar investimento</button>

      {active.length > 0 && tab === "active" && !investedThisMonth && (
        <Card className="mb-4 !bg-amber-50 dark:!bg-amber-500/10 border-amber-200 dark:border-amber-500/20">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm">Você ainda não fez nenhum aporte este mês</p>
              <p className="text-xs text-gray-500 mt-0.5">Investir todo mês, mesmo um valor pequeno, é o que mais faz diferença no longo prazo.</p>
            </div>
          </div>
        </Card>
      )}

      {active.length > 0 && tab === "active" && (
        <>
          <Card className="mb-4">
            <p className="text-xs font-bold text-gray-500">Patrimônio investido</p>
            <p className="text-3xl font-extrabold">{money(brl(totalValue))}</p>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-2xl bg-white/60 dark:bg-[#1E1E1E] border border-white/70 dark:border-white/5 px-4 py-2.5"><p className="text-[11px] font-bold text-gray-500">Total aportado</p><p className="font-extrabold">{money(brl(totalInvested))}</p></div>
              <div className="rounded-2xl bg-white/60 dark:bg-[#1E1E1E] border border-white/70 dark:border-white/5 px-4 py-2.5"><p className="text-[11px] font-bold text-gray-500">Rentabilidade</p>
                <p className={`font-extrabold ${profit >= 0 ? "text-emerald-500" : "text-red-500"}`}>{profit >= 0 ? "+" : ""}{money(brl(profit))}{profitPct !== null && <span className="text-xs"> ({fmtPct(profitPct)})</span>}</p></div>
            </div>
          </Card>

          {allocation.length > 0 && (
            <Card className="mb-4">
              <p className="font-extrabold mb-3">Distribuição</p>
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="w-40 h-40 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={allocation} dataKey="value" innerRadius={48} outerRadius={72} paddingAngle={3} stroke="none">
                        {allocation.map((a) => <Cell key={a.key} fill={a.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="w-full space-y-2 text-sm">
                  {allocation.map((a) => (
                    <li key={a.key} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 min-w-0"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: a.color }} /><span className="truncate">{a.name}</span></span>
                      <span className="font-bold">{Math.round((a.value / totalValue) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          )}

          {showChart && (
            <Card className="mb-4">
              <p className="font-extrabold mb-2">Evolução (12 meses)</p>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                    <defs><linearGradient id="invg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4} /><stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} /></linearGradient></defs>
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis hide domain={[0, "auto"]} />
                    <Tooltip formatter={(v) => brl(Number(v))} contentStyle={{ borderRadius: 12 }} />
                    <Area type="monotone" dataKey="value" name="Patrimônio" stroke="#8B5CF6" strokeWidth={2} fill="url(#invg)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </>
      )}

      <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-brand-dark/10 dark:bg-[#161616] mb-5">
        {([["active", "Ativos"], ["archived", "Arquivados"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`py-2.5 rounded-xl text-sm font-bold ${tab === k ? "bg-white dark:bg-[#262626] shadow-sm" : "text-gray-500"}`}>{l}</button>
        ))}
      </div>

      {!editing && !move && <ErrorNote message={error} />}

      <div className="space-y-3 mt-3">
        {shown.length === 0 && <Card><Empty>{tab === "active" ? "Nenhum investimento ainda. Adicione o primeiro." : "Nenhum investimento arquivado."}</Empty></Card>}
        {shown.map((x) => {
          const K = KINDS[x.kind] ?? KINDS.outros;
          const gain = x.current_value - x.invested;
          const gp = pct(x.current_value, x.invested);
          const history = movs.filter((m) => m.investment_id === x.id).slice().reverse();
          return (
            <Card key={x.id} className="!p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${K.color}22` }}><span className="w-3.5 h-3.5 rounded-full" style={{ background: K.color }} /></div>
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold truncate">{x.name}</p>
                  <p className="text-xs text-gray-500 truncate">{K.label}{x.institution ? ` · ${x.institution}` : ""}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-extrabold">{money(brl(x.current_value))}</p>
                  <p className={`text-xs font-bold ${gain >= 0 ? "text-emerald-500" : "text-red-500"}`}>{gain >= 0 ? "+" : ""}{money(brl(gain))}{gp !== null && ` (${fmtPct(gp)})`}</p>
                </div>
              </div>
              {!x.archived && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <button onClick={() => openMove(x, "aporte")} className={btnGhostCls}>Aporte</button>
                  <button onClick={() => openMove(x, "resgate")} className={btnGhostCls}>Resgate</button>
                  <button onClick={() => openMove(x, "valor")} className={btnGhostCls}>Atualizar valor</button>
                </div>
              )}
              <div className="flex gap-2 mt-3 justify-end">
                <button onClick={() => setOpenId(openId === x.id ? null : x.id)} className={btnGhostCls}>{openId === x.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Histórico</button>
                {!x.archived && <button onClick={() => openEdit(x)} className={btnGhostCls}><Pencil size={14} /> Editar</button>}
                <button onClick={() => setArchived(x.id, !x.archived)} className={btnGhostCls}>{x.archived ? <><ArchiveRestore size={14} /> Restaurar</> : <><Archive size={14} /> Arquivar</>}</button>
              </div>
              {openId === x.id && (
                <ul className="mt-3 divide-y divide-gray-100 dark:divide-[#262626] text-sm">
                  {history.length === 0 ? <li className="py-3 text-gray-400">Sem movimentos.</li> : history.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0"><span className="block font-bold">{MOV_LABEL[m.kind]}{m.note ? ` · ${m.note}` : ""}</span><span className="block text-xs text-gray-500">{formatDateBR(m.moved_on)}</span></span>
                      <span className="text-right shrink-0"><span className={`block font-bold ${m.kind === "aporte" ? "text-emerald-500" : m.kind === "resgate" ? "text-red-500" : ""}`}>{m.kind === "aporte" ? "+" : m.kind === "resgate" ? "-" : ""}{money(brl(m.amount))}</span><span className="block text-[11px] text-gray-400">Valor depois: {money(brl(m.value_after))}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 mt-6">Registro manual para acompanhamento: o Jakash não busca cotações nem se conecta a corretoras. Atualize o valor quando quiser ver o rendimento. Aportes e resgates ligados a uma conta mudam o saldo dela.</p>
      <Disclaimer />

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full md:max-w-md bg-white dark:bg-[#161616] rounded-t-[32px] md:rounded-[32px] p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <h2 className="text-xl font-extrabold">{editing === "new" ? "Novo investimento" : "Editar investimento"}</h2>
            <div><Label>Nome</Label><input autoFocus className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: CDB 110% CDI" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tipo</Label>
                <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select></div>
              <div><Label>Instituição (opcional)</Label><input className={inputCls} value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} placeholder="Ex.: Nubank" /></div>
            </div>
            {editing === "new" && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Quanto você aplicou</Label><input className={inputCls} inputMode="decimal" value={form.invested} onChange={(e) => setForm({ ...form, invested: e.target.value })} placeholder="0,00" /></div>
                <div><Label>Valor atual</Label><input className={inputCls} inputMode="decimal" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} placeholder="Igual ao aplicado" /></div>
              </div>
            )}
            <ErrorNote message={error} />
            <div className="flex gap-2"><button type="button" onClick={() => setEditing(null)} className={btnGhostCls + " flex-1 !py-3"}>Cancelar</button><button className={btnCls + " flex-1"} type="submit" disabled={busy}>Salvar</button></div>
            {editing !== "new" && (
              confirmDelete ? (
                <button type="button" onClick={remove} className="w-full text-sm font-bold text-red-500 py-2">Confirmar: apagar o investimento e o histórico</button>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="w-full text-sm font-bold text-red-500/80 py-2">Excluir investimento</button>
              )
            )}
          </form>
        </div>
      )}

      {move && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setMove(null)}>
          <form onSubmit={submitMove} onClick={(e) => e.stopPropagation()} className="w-full md:max-w-md bg-white dark:bg-[#161616] rounded-t-[32px] md:rounded-[32px] p-6 space-y-4">
            <div className="flex items-center justify-between"><h2 className="text-xl font-extrabold">{MOV_LABEL[move.kind]}</h2><button type="button" onClick={() => setMove(null)} aria-label="Fechar" className="text-gray-400"><X size={20} /></button></div>
            <p className="text-sm text-gray-500">{move.inv.name} · valor atual {money(brl(move.inv.current_value))}</p>
            <div><Label>{move.kind === "valor" ? "Novo valor atual" : "Valor"}</Label><input autoFocus className={inputCls + " !text-2xl !font-extrabold"} inputMode="decimal" placeholder="0,00" value={mform.amount} onChange={(e) => setMform({ ...mform, amount: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Data</Label><input type="date" className={inputCls} value={mform.date} onChange={(e) => setMform({ ...mform, date: e.target.value })} /></div>
              {move.kind !== "valor" && accs.length > 0 && (
                <div><Label>{move.kind === "aporte" ? "Sai da conta" : "Cai na conta"}</Label>
                  <select className={inputCls} value={mform.account_id} onChange={(e) => setMform({ ...mform, account_id: e.target.value })}>
                    <option value="">Nenhuma</option>
                    {accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select></div>
              )}
            </div>
            <div><Label>Observação (opcional)</Label><input className={inputCls} maxLength={120} value={mform.note} onChange={(e) => setMform({ ...mform, note: e.target.value })} /></div>
            {move.kind === "resgate" && <p className="text-xs text-gray-500">O valor aportado diminui na mesma proporção do resgate, então a rentabilidade que já ficou registrada se mantém.</p>}
            <ErrorNote message={error} />
            <button className={btnCls + " w-full"} type="submit" disabled={busy}>{busy ? "Salvando..." : "Registrar"}</button>
          </form>
        </div>
      )}
    </div>
  );
}
