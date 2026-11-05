"use client";

import { useCallback, useEffect, useState } from "react";
import { Flame, Trash2, Trophy } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { brl, parseMoney, formatDateBR, todayISO, monthRange, shiftMonth, monthLabel } from "@/lib/format";
import { milestones, monthLeftover, streakMonths } from "@/lib/savings";
import { GOAL_TYPES, monthsBetween, requiredMonthly, type GoalType } from "@/lib/planner";
import { PageHeader, Card, Label, Progress, Empty, ErrorNote, Disclaimer, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";
import { GoalTypeSelector } from "@/components/GoalTypeSelector";
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

  const tips = GOAL_TYPES[form.type].tips;
  const openGoals = goals.filter((g) => g.status !== "completed");
  const streak = streakMonths(dates, todayISO());
  const wins = milestones(goals);

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <PageHeader title="Objetivos" subtitle="Viagem, bebê, reserva, carro... defina o valor, a data e veja quanto guardar por mês" />
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

      <Card className="mb-6">
        <div className="mb-4">
          <GoalTypeSelector selected={form.type} onChange={(type) => setForm({ ...form, type, icon: "" })} />
        </div>
        <form onSubmit={add} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div><Label>{form.type === "custom" ? "Nome do objetivo" : "Nome"}</Label><input className={inputCls} maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={form.type === "custom" ? "Ex.: Moto nova, Festa de 15 anos..." : GOAL_TYPES[form.type].label} /></div>
          <div><Label>Valor-alvo</Label><input className={inputCls} inputMode="decimal" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="0,00" /></div>
          <div><Label>Já guardado</Label><input className={inputCls} inputMode="decimal" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} placeholder="0,00" /></div>
          <div><Label>Data-alvo</Label><input type="date" className={inputCls} value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></div>
          <div className="md:col-span-4">
            <Label>Ícone (opcional)</Label>
            <div className="grid grid-cols-9 gap-2">
              {ICONS.map((ic) => (
                <button key={ic} type="button" onClick={() => setForm({ ...form, icon: form.icon === ic ? "" : ic })} aria-pressed={form.icon === ic} aria-label={`Ícone ${ic}`}
                  className={`aspect-square rounded-lg text-2xl border-2 transition-all flex items-center justify-center ${form.icon === ic ? "bg-brand-dark/10 dark:bg-brand-soft/10 border-brand-dark dark:border-brand-soft shadow-sm" : "border-gray-200 dark:border-[#262626] hover:border-brand-dark/50 dark:hover:border-brand-soft/50 hover:bg-brand-dark/5 dark:hover:bg-brand-soft/5"}`}>{ic}</button>
              ))}
            </div>
          </div>
          <div className="md:col-span-4"><button className={btnCls} type="submit">Criar objetivo</button></div>
        </form>
        <ul className="mt-4 text-xs text-gray-500 list-disc pl-5 space-y-1">{tips.map((t) => <li key={t}>{t}</li>)}</ul>
        <ErrorNote message={error} />
      </Card>

      {goals.length === 0 ? <Card><Empty>Nenhum objetivo ainda. Crie o seu acima: escolha um tipo ou use “Outro objetivo” para dar o nome que quiser.</Empty></Card> : (
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
                <div className="flex gap-2 mt-4">
                  <input className={inputCls} inputMode="decimal" placeholder="Novo aporte" value={contrib[g.id] ?? ""} onChange={(e) => setContrib({ ...contrib, [g.id]: e.target.value })} />
                  <button onClick={() => addContribution(g)} className={btnGhostCls}>Aportar</button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Disclaimer />
    </div>
  );
}
