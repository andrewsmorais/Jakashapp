"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSupabase } from "@/lib/useSupabase";
import { brl, parseMoney, monthStartAgo } from "@/lib/format";
import { requiredMonthly } from "@/lib/planner";
import { buildClassifier } from "@/lib/essentials";
import { PageHeader, Card, Label, Progress, ErrorNote, Disclaimer, inputCls, btnCls } from "@/components/ui/page";
import { SectionTabs } from "@/components/SectionTabs";

export default function ReservaPage() {
  const { supabase, userId, ready } = useSupabase();
  const [essential, setEssential] = useState(0);
  const [months, setMonths] = useState(6);
  const [saved, setSaved] = useState("");
  const [monthsToGoal, setMonthsToGoal] = useState("12");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [cats, flags, tx] = await Promise.all([
      supabase.from("categories").select("id,name,parent_id"),
      supabase.from("category_flags").select("category_id,is_essential,is_benefit"),
      supabase.from("transactions").select("amount,category_id").eq("type", "expense").gte("date", monthStartAgo(3)).lt("date", monthStartAgo(0)),
    ]);
    if (cats.error || tx.error) { setError("Não foi possível calcular suas despesas essenciais."); return; }
    const { isEssential } = buildClassifier(cats.data ?? [], flags.data ?? []);
    const sum = (tx.data ?? []).filter((t) => isEssential(t.category_id)).reduce((s, t) => s + Number(t.amount), 0);
    setEssential(sum / 3);
  }, [supabase]);

  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("jakash:changed", h);
    return () => window.removeEventListener("jakash:changed", h);
  }, [load]);

  const [manual, setManual] = useState("");
  const manualN = parseMoney(manual);
  const monthlyEssential = !Number.isNaN(manualN) && manualN > 0 ? manualN : essential;
  const target = monthlyEssential * months;
  const savedN = Number.isNaN(parseMoney(saved)) ? 0 : parseMoney(saved);
  const pct = target > 0 ? (savedN / target) * 100 : 0;
  const need = requiredMonthly(target, savedN, Number(monthsToGoal) || 1);

  async function createGoal() {
    setInfo(null);
    if (!(target > 0)) { setError("Informe suas despesas mensais essenciais."); return; }
    const d = new Date(); d.setMonth(d.getMonth() + (Number(monthsToGoal) || 12));
    const deadline = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const { error: err } = await supabase.from("goals").insert({
      user_id: userId, name: "Reserva de emergência", icon: "🛡️", type: "reserva",
      target_amount: Math.round(target * 100) / 100, current_amount: savedN, deadline, metadata: { months },
    });
    if (err) { setError("Não foi possível criar o objetivo."); return; }
    setError(null);
    setInfo(`Objetivo criado em Objetivos (meta de ${brl(target)} até ${deadline.split("-").reverse().join("/")}).`);
  }

  return (
    <div className="max-w-3xl mx-auto pb-20">
      <PageHeader title="Reserva de emergência" subtitle="Quanto você precisa ter guardado para ficar tranquilo" />
      <SectionTabs group="guardar" />

      <Card className="mb-6">
        <p className="text-sm text-gray-500 mb-4">
          Média dos seus gastos essenciais nos últimos 3 meses: <b>{brl(essential)}</b> por mês
          {essential === 0 && " (ainda sem dados: informe abaixo)"}.
          {" "}<Link href="/categorias" className="underline font-bold">Ajustar quais categorias são essenciais</Link>.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Despesas essenciais por mês (opcional: substitui a média)</Label><input className={inputCls} inputMode="decimal" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={brl(essential)} /></div>
          <div><Label>Meses de cobertura: {months}</Label>
            <input type="range" min={3} max={12} value={months} onChange={(e) => setMonths(Number(e.target.value))} className="w-full accent-brand-dark" />
            <p className="text-xs text-gray-400">3 a 6 meses é uma referência comum; 6 a 12 se sua renda varia (MEI/autônomo).</p></div>
          <div><Label>Quanto você já tem guardado</Label><input className={inputCls} inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} placeholder="0,00" /></div>
          <div><Label>Em quantos meses quer chegar lá</Label><input className={inputCls} inputMode="numeric" value={monthsToGoal} onChange={(e) => setMonthsToGoal(e.target.value)} /></div>
        </div>
      </Card>

      <Card className="mb-6">
        <p className="text-xs font-bold text-gray-500">Meta da reserva</p>
        <p className="text-3xl font-extrabold mb-3">{brl(target)}</p>
        <Progress value={pct} />
        <p className="text-sm text-gray-500 mt-2">{Math.round(pct)}% guardado · faltam {brl(Math.max(target - savedN, 0))}</p>
        <p className="mt-4 font-bold">Para chegar em {monthsToGoal || 1} meses, guarde {brl(need)} por mês.</p>
        <button onClick={createGoal} className={btnCls + " mt-4"}>Transformar em objetivo</button>
        <ErrorNote message={error} />
        {info && <p className="text-sm text-emerald-600 font-bold mt-3">{info}</p>}
      </Card>
      <Disclaimer />
    </div>
  );
}
