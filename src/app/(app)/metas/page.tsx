"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Flame, Plus, Trash2, Trophy } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { brl, parseMoney, formatDateBR, todayISO, monthRange, shiftMonth, monthLabel } from "@/lib/format";
import { milestones, monthLeftover, streakMonths } from "@/lib/savings";
import { GOAL_TYPES, monthsBetween, requiredMonthly, type GoalType } from "@/lib/planner";
import { PageHeader, Card, Label, Progress, Empty, ErrorNote, Disclaimer, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";
import { SectionTabs } from "@/components/SectionTabs";

type Goal = { id: string; name: string; icon: string | null; type: GoalType; target_amount: number; current_amount: number; deadline: string | null; status: string };

const ICONS = ["🎯", "✈️", "🏠", "🚗", "🏍️", "💍", "🎓", "📱", "💻", "🎮", "🎉", "🎁", "🏖️", "🐶", "💪", "🛠️", "👶", "💰"];

export default function MetasPage() {
  const { supabase, userId, ready } = useSupabase();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ type: "custom" as GoalType, name: "", icon: "", target: "", current: "", deadline: "" });
  const [contrib, setContrib] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<string[]>([]);
  const [leftover, setLeftover] = useState<{ month: string; amount: number } | null>(null);
  const [leftGoal, setLeftGoal] = useState("");
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState<string | null>(null); // objetivo com o campo de aporte aberto
  const [openHist, setOpenHist] = useState<string | null>(null);
  const [hist, setHist] = useState<{ amount: number; created_at: string }[]>([]);

  async function loadHist(id: string) {
    const { data } = await supabase.from("goal_contributions").select("amount,created_at").eq("goal_id", id).order("created_at", { ascending: false }).limit(20);
    setHist(((data ?? []) as { amount: number | string; created_at: string }[]).map((x) => ({ amount: Number(x.amount), created_at: x.created_at })));
  }
  function toggleHist(id: string) {
    if (openHist === id) { setOpenHist(null); return; }
    setOpenHist(id); setHist([]);
    void loadHist(id);
  }

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from("goals").select("id,name,icon,type,target_amount,current_amount,deadline,status").neq("status", "cancelled").order("created_at");
    if (err) { setError("Não foi possível carregar os objetivos."); return; }
    setError(null);
    setGoals((data ?? []).map((g) => ({ ...g, target_amount: Number(g.target_amount), current_amount: Number(g.current_amount ?? 0) })) as Goal[]);
  }, [supabase]);

  // Sequência de aportes e sobra do mês passado (sugestão no começo do mês).
  const loadSavings = useCallback(async () => {
    const prev = shiftMonth(todayISO().slice(0, 7), -1);
    const { start, end } = monthRange(prev);
    const [c, t] = await Promise.all([
      supabase.from("goal_contributions").select("created_at").order("created_at", { ascending: false }).limit(1000),
      supabase.from("transactions").select("amount,type").gte("date", start).lt("date", end).limit(5000),
    ]);
    setDates(((c.data ?? []) as { created_at: string }[]).map((x) => x.created_at));
    const rows = (t.data ?? []) as { amount: number | string; type: string }[];
    const inc = rows.filter((x) => x.type === "income").reduce((s, x) => s + Number(x.amount), 0);
    const exp = rows.filter((x) => x.type === "expense").reduce((s, x) => s + Number(x.amount), 0);
    const amount = monthLeftover(inc, exp);
    let dismissed = false;
    try { dismissed = localStorage.getItem(`jakash.leftover.${prev}`) === "1"; } catch { /* sem armazenamento */ }
    setLeftover(amount !== null && !dismissed ? { month: prev, amount } : null);
  }, [supabase]);

  useEffect(() => { if (ready && userId) { load(); loadSavings(); } }, [ready, userId, load, loadSavings]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("jakash:changed", h);
    return () => window.removeEventListener("jakash:changed", h);
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const target = parseMoney(form.target);
    const current = form.current ? parseMoney(form.current) : 0;
    if (!(target > 0) || Number.isNaN(current)) { setError("Informe um valor-alvo válido."); return; }
    if (!userId) { setError("Você está sem login. Entre na sua conta para salvar o objetivo."); return; }
    if (form.type === "custom" && !form.name.trim()) { setError("Dê um nome ao seu objetivo."); return; }
    const meta = GOAL_TYPES[form.type];
    const { error: err } = await supabase.from("goals").insert({
      user_id: userId, name: form.name.trim() || meta.label, icon: form.icon || meta.icon, type: form.type,
      target_amount: target, current_amount: current, deadline: form.deadline || null,
    });
    if (err) { setError("Não foi possível criar o objetivo."); return; }
    setError(null);
    setForm({ ...form, name: "", icon: "", target: "", current: "", deadline: "" });
    setCreating(false);
    load();
  }

  async function addContribution(g: Goal) {
    const v = parseMoney(contrib[g.id] ?? "");
    if (!(v > 0)) { setError("Informe um valor de aporte válido."); return; }
    const newTotal = g.current_amount + v;
    const [c, u] = await Promise.all([
      supabase.from("goal_contributions").insert({ goal_id: g.id, amount: v }),
      supabase.from("goals").update({ current_amount: newTotal, status: newTotal >= g.target_amount ? "completed" : "in_progress" }).eq("id", g.id),
    ]);
    if (c.error || u.error) { setError("Não foi possível registrar o aporte."); return; }
    setContrib({ ...contrib, [g.id]: "" });
    setAdding(null);
    if (openHist === g.id) void loadHist(g.id);
    load();
  }

  async function sendLeftover() {
    const g = goals.find((x) => x.id === (leftGoal || openGoals[0]?.id));
    if (!g || !leftover) return;
    const newTotal = g.current_amount + leftover.amount;
    const [c, u] = await Promise.all([
      supabase.from("goal_contributions").insert({ goal_id: g.id, amount: leftover.amount }),
      supabase.from("goals").update({ current_amount: newTotal, status: newTotal >= g.target_amount ? "completed" : "in_progress" }).eq("id", g.id),
    ]);
    if (c.error || u.error) { setError("Não foi possível guardar a sobra."); return; }
    dismissLeftover();
    load(); loadSavings();
  }
  function dismissLeftover() {
    if (leftover) { try { localStorage.setItem(`jakash.leftover.${leftover.month}`, "1"); } catch { /* ignora */ } }
    setLeftover(null);
  }

  async function remove(id: string) {
    const { error: err } = await supabase.from("goals").delete().eq("id", id);
    if (err) setError("Não foi possível excluir."); else load();
  }

  const openGoals = goals.filter((g) => g.status !== "completed");
  const streak = streakMonths(dates, todayISO());
  const wins = milestones(goals);

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <PageHeader title="Objetivos" subtitle="O que você está juntando e quanto já guardou." />
      <SectionTabs group="guardar" />

      {leftover && openGoals.length > 0 && (
        <Card className="mb-6 !p-4">
          <p className="font-extrabold">Sobrou {brl(leftover.amount)} em {monthLabel(leftover.month)}.</p>
          <p className="text-sm text-gray-500 mt-0.5">Quer mandar para um objetivo? Só guardo se você tocar no botão.</p>
          <div className="flex flex-wrap gap-2 mt-3 items-center">
            <select aria-label="Objetivo" className={inputCls + " !w-auto"} value={leftGoal || openGoals[0].id} onChange={(e) => setLeftGoal(e.target.value)}>
              {openGoals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button onClick={sendLeftover} className={btnCls}>Guardar {brl(leftover.amount)}</button>
            <button onClick={dismissLeftover} className={btnGhostCls}>Agora não</button>
          </div>
        </Card>
      )}

      {(streak > 0 || wins.length > 0) && (
        <div className="mb-6 flex flex-wrap gap-2" aria-label="Conquistas">
          {streak > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-3 py-1.5 text-xs font-bold"><Flame size={14} /> {streak} {streak === 1 ? "mês" : "meses"} seguidos guardando</span>}
          {wins.map((w) => <span key={w.key} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 text-xs font-bold"><Trophy size={14} /> {w.label}</span>)}
        </div>
      )}

      {creating ? (
        <Card className="mb-6">
          <form onSubmit={add} className="space-y-3">
            <h2 className="text-lg font-extrabold">Novo objetivo</h2>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tipo</Label>
                <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as GoalType, icon: "" })}>
                  {(Object.keys(GOAL_TYPES) as GoalType[]).map((k) => <option key={k} value={k}>{GOAL_TYPES[k].label}</option>)}
                </select></div>
              <div><Label>Ícone</Label>
                <select className={inputCls} value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })}>
                  <option value="">{GOAL_TYPES[form.type].icon} Padrão do tipo</option>
                  {ICONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                </select></div>
            </div>
            <div><Label>{form.type === "custom" ? "Nome do objetivo *" : "Nome"}</Label><input className={inputCls} maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={form.type === "custom" ? "Ex.: Moto nova, Festa de 15 anos..." : GOAL_TYPES[form.type].label} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Valor-alvo *</Label><input className={inputCls} inputMode="decimal" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="0,00" /></div>
              <div><Label>Já guardado</Label><input className={inputCls} inputMode="decimal" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} placeholder="0,00" /></div>
            </div>
            <div><Label>Data-alvo (opcional)</Label><input type="date" className={inputCls} value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></div>
            <ErrorNote message={error} />
            <div className="flex gap-2">
              <button type="button" className={btnGhostCls + " flex-1 !py-3"} onClick={() => { setCreating(false); setError(null); }}>Cancelar</button>
              <button className={btnCls + " flex-1"} type="submit">Criar objetivo</button>
            </div>
          </form>
        </Card>
      ) : (
        <div className="mb-6 space-y-2">
          <button className={btnCls + " w-full"} onClick={() => setCreating(true)}><Plus size={16} /> Novo objetivo</button>
          <Link href="/simulador" className="block text-center text-sm font-bold text-brand-dark dark:text-brand-soft">Quer fazer as contas antes? Abrir o Simulador</Link>
          <ErrorNote message={error} />
        </div>
      )}

      {goals.length === 0 ? <Card><Empty>Nenhum objetivo ainda. Toque em “Novo objetivo” para começar.</Empty></Card> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map((g) => {
            const pct = g.target_amount > 0 ? (g.current_amount / g.target_amount) * 100 : 0;
            const monthly = g.deadline ? requiredMonthly(g.target_amount, g.current_amount, monthsBetween(new Date(), g.deadline)) : null;
            return (
              <Card key={g.id}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex gap-3">
                    <span className="text-3xl">{g.icon ?? "🎯"}</span>
                    <div>
                      <p className="font-extrabold leading-tight">{g.name}</p>
                      <p className="text-xs text-gray-500">{g.deadline ? `até ${formatDateBR(g.deadline)}` : "sem data-alvo"}{g.status === "completed" && " · ✅ concluído"}</p>
                    </div>
                  </div>
                  <button onClick={() => remove(g.id)} aria-label="Excluir" className="text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                </div>
                <Progress value={pct} />
                <p className="text-sm text-gray-500 mt-2">{brl(g.current_amount)} de {brl(g.target_amount)} ({Math.round(pct)}%)</p>
                {monthly !== null && g.status !== "completed" && <p className="text-sm font-bold mt-1">Guarde {brl(monthly)} por mês</p>}
                {g.status !== "completed" && (adding === g.id ? (
                  <div className="flex gap-2 mt-4">
                    <input autoFocus className={inputCls} inputMode="decimal" placeholder="Quanto separou? (R$)" value={contrib[g.id] ?? ""} onChange={(e) => setContrib({ ...contrib, [g.id]: e.target.value })} />
                    <button onClick={() => addContribution(g)} className={btnCls + " shrink-0"}>Anotar</button>
                    <button onClick={() => { setAdding(null); setError(null); }} className="text-sm font-bold text-gray-500 px-1">Cancelar</button>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => { setAdding(g.id); setError(null); }} className={btnGhostCls + " flex-1 !py-2.5"}>Aportar</button>
                    <button onClick={() => toggleHist(g.id)} aria-expanded={openHist === g.id} className="text-xs font-bold text-gray-500 inline-flex items-center gap-1 px-2">Histórico <ChevronDown size={14} className={openHist === g.id ? "rotate-180" : ""} /></button>
                  </div>
                ))}
                {g.status === "completed" && <button onClick={() => toggleHist(g.id)} className="mt-3 text-xs font-bold text-gray-500 inline-flex items-center gap-1">Histórico <ChevronDown size={14} className={openHist === g.id ? "rotate-180" : ""} /></button>}
                {openHist === g.id && (
                  <ul className="mt-3 border-t border-gray-100 dark:border-white/5 pt-2 text-sm">
                    {hist.length === 0 ? <li className="text-xs text-gray-400 py-1">Nenhum aporte anotado.</li> : hist.map((h, k) => (
                      <li key={k} className="flex justify-between py-1"><span className="text-gray-500">{formatDateBR(h.created_at.slice(0, 10))}</span><span className="font-bold">{brl(h.amount)}</span></li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <Disclaimer />
    </div>
  );
}
