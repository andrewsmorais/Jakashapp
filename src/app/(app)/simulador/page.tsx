"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { brl, parseMoney } from "@/lib/format";
import { PageHeader, Card, Label, Disclaimer, inputCls } from "@/components/ui/page";
import { SectionTabs } from "@/components/SectionTabs";

// Simulador: dois cálculos simples, feitos só com os números que a pessoa digita (nada sai do aparelho).
// Taxa anual -> mensal equivalente: (1 + a)^(1/12) - 1.

const monthlyRate = (annualPct: number) => Math.pow(1 + annualPct / 100, 1 / 12) - 1;

type Point = { label: string; Guardado: number; Investido: number };

function grow(initial: number, monthly: number, annualPct: number, months: number): { points: Point[]; total: number; invested: number } {
  const r = monthlyRate(annualPct);
  let bal = initial;
  const points: Point[] = [{ label: "0", Guardado: round(bal), Investido: round(initial) }];
  for (let i = 1; i <= months; i++) {
    bal = bal * (1 + r) + monthly;
    if (i % Math.max(1, Math.round(months / 24)) === 0 || i === months) points.push({ label: String(i), Guardado: round(bal), Investido: round(initial + monthly * i) });
  }
  return { points, total: bal, invested: initial + monthly * months };
}

/** Aporte mensal necessário para chegar em `target` em `months` meses, partindo de `initial`. */
function needed(target: number, initial: number, annualPct: number, months: number): number {
  const r = monthlyRate(annualPct);
  const fvInitial = initial * Math.pow(1 + r, months);
  const gap = target - fvInitial;
  if (gap <= 0) return 0;
  return r === 0 ? gap / months : (gap * r) / (Math.pow(1 + r, months) - 1);
}
const round = (n: number) => Math.round(n * 100) / 100;
const num = (v: string) => { const n = parseMoney(v); return Number.isFinite(n) ? n : 0; };

export default function SimuladorPage() {
  const [tab, setTab] = useState<"crescer" | "meta">("crescer");
  const [initial, setInitial] = useState("");
  const [monthly, setMonthly] = useState("300");
  const [rate, setRate] = useState("10");
  const [years, setYears] = useState("5");
  const [target, setTarget] = useState("20000");
  const [mTarget, setMTarget] = useState("24");

  const months = Math.max(1, Math.min(600, Math.round(num(years) * 12)));
  const r = Math.max(0, Math.min(100, num(rate)));
  const sim = useMemo(() => grow(Math.max(0, num(initial)), Math.max(0, num(monthly)), r, months), [initial, monthly, r, months]);
  const goalMonths = Math.max(1, Math.min(600, Math.round(num(mTarget))));
  const need = needed(Math.max(0, num(target)), Math.max(0, num(initial)), r, goalMonths);
  const goalSimple = Math.max(0, num(target) - Math.max(0, num(initial))) / goalMonths;

  const tabBtn = (k: "crescer" | "meta", label: string) => (
    <button role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-full text-sm font-bold ${tab === k ? "bg-brand-dark text-white" : "bg-white/75 dark:bg-[#161616] text-gray-600 dark:text-gray-300"}`}>{label}</button>
  );

  return (
    <div className="max-w-4xl mx-auto pb-20 space-y-6">
      <PageHeader title="Simulador" subtitle="Veja quanto o dinheiro cresce guardando todo mês, ou quanto guardar para chegar em uma meta." />
      <SectionTabs group="guardar" />
      <div className="flex gap-2" role="tablist">{tabBtn("crescer", "Quanto vou ter")}{tabBtn("meta", "Quanto guardar por mês")}</div>

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label>Valor inicial</Label><input className={inputCls} inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="0,00" /></div>
          {tab === "crescer" ? (
            <>
              <div><Label>Aporte por mês</Label><input className={inputCls} inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="0,00" /></div>
              <div><Label>Rendimento ao ano (%)</Label><input className={inputCls} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="10" /></div>
              <div><Label>Prazo (anos)</Label><input className={inputCls} inputMode="decimal" value={years} onChange={(e) => setYears(e.target.value)} placeholder="5" /></div>
            </>
          ) : (
            <>
              <div><Label>Valor que quero juntar</Label><input className={inputCls} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0,00" /></div>
              <div><Label>Prazo (meses)</Label><input className={inputCls} inputMode="numeric" value={mTarget} onChange={(e) => setMTarget(e.target.value)} placeholder="24" /></div>
              <div><Label>Rendimento ao ano (%)</Label><input className={inputCls} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="10" /></div>
            </>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-3">O rendimento é uma suposição sua (use 0 para guardar sem render). Rendimentos reais variam e podem ter imposto.</p>
      </Card>

      {tab === "crescer" ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card><p className="text-xs font-bold text-gray-500">Total no final</p><p className="text-2xl font-extrabold mt-1">{brl(sim.total)}</p></Card>
            <Card><p className="text-xs font-bold text-gray-500">Você colocou</p><p className="text-2xl font-extrabold mt-1">{brl(sim.invested)}</p></Card>
            <Card><p className="text-xs font-bold text-gray-500">Rendimento</p><p className="text-2xl font-extrabold mt-1 text-brand-dark dark:text-brand-soft">{brl(sim.total - sim.invested)}</p></Card>
          </div>
          <Card>
            <p className="font-extrabold mb-3">Evolução (meses)</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sim.points} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#9CA3AF33" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={60} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip formatter={(v) => brl(Number(v))} labelFormatter={(l) => `Mês ${l}`} />
                  <Area type="monotone" dataKey="Investido" stroke="#9CA3AF" fill="#9CA3AF33" />
                  <Area type="monotone" dataKey="Guardado" stroke="#7C3AED" fill="#7C3AED33" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      ) : (
        <Card>
          <p className="text-xs font-bold text-gray-500">Para juntar {brl(num(target))} em {goalMonths} meses, guarde</p>
          <p className="text-4xl font-extrabold mt-1">{brl(need)}<span className="text-base font-bold text-gray-400"> por mês</span></p>
          {r > 0 && <p className="text-sm text-gray-500 mt-2">Sem rendimento seriam {brl(goalSimple)} por mês. Com {r.toLocaleString("pt-BR")}% ao ano, o rendimento cobre a diferença.</p>}
        </Card>
      )}
      <Disclaimer />
    </div>
  );
}
