"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { brl, formatDateBR, todayISO } from "@/lib/format";
import { SHIFT_COLUMNS, VEHICLE_COLUMNS, hoursLabel, normalizeShift, normalizeVehicle, shiftMetrics, summarize, type Shift, type Vehicle } from "@/lib/driver";
import { platformOf } from "@/lib/driverPlatforms";
import { BackTitle, Empty, btnCls } from "@/components/ui/page";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const perH = (v: number | null) => (v === null ? "—" : `${brl(v)}/h`);
const perKm = (v: number | null) => (v === null ? "—" : `${brl(v)}/km`);

// Relatório do Motorista de app, pronto para imprimir ou salvar em PDF. Ganho bruto, despesas e lucro líquido em destaque.
function Report() {
  const q = useSearchParams();
  const { supabase, userId, ready } = useSupabase();
  const today = todayISO();
  const from = ISO.test(q.get("de") ?? "") ? q.get("de")! : `${today.slice(0, 7)}-01`;
  const to = ISO.test(q.get("ate") ?? "") ? q.get("ate")! : today;
  const platform = q.get("p") || null;
  const carro = q.get("carro") || "";
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [name, setName] = useState("");
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    if (!ready || !userId) return;
    Promise.all([
      supabase.from("driver_shifts").select(SHIFT_COLUMNS).gte("date", from).lte("date", to).order("date").limit(2000),
      supabase.from("driver_vehicles").select(VEHICLE_COLUMNS),
      supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    ]).then(([s, v, p]) => {
      if (s.error) { setState("error"); return; }
      setShifts(((s.data ?? []) as Record<string, unknown>[]).map(normalizeShift));
      setVehicles(((v.data ?? []) as Record<string, unknown>[]).map(normalizeVehicle));
      setName((p.data as { full_name?: string } | null)?.full_name ?? "");
      setState("ok");
    });
  }, [ready, userId, supabase, from, to]);

  const list = useMemo(() => shifts.filter((s) => (!carro || s.vehicle_id === carro) && (!platform || s.earnings.some((e) => e.platform === platform))), [shifts, carro, platform]);
  const sum = useMemo(() => summarize(list, platform), [list, platform]);
  const t = sum.total;
  const vName = new Map(vehicles.map((v) => [v.id, v.name]));

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <div className="print:hidden">
        <BackTitle title="Relatório do motorista" subtitle="Toque no botão e escolha “Salvar como PDF” na janela de impressão." href="/motorista" />
        <button type="button" className={btnCls + " mb-5"} onClick={() => window.print()}><Printer size={16} /> Imprimir ou salvar PDF</button>
      </div>
      {state === "loading" ? <Empty>Carregando…</Empty> : state === "error" ? <Empty>Não foi possível carregar o relatório.</Empty> : (
        <article className="bg-white text-black rounded-2xl p-6 md:p-8 shadow-sm print:shadow-none print:rounded-none print:p-0 text-sm">
          <h1 className="text-xl font-extrabold">Relatório de ganhos · Motorista de app</h1>
          <p className="text-gray-600">{name ? `${name} · ` : ""}{formatDateBR(from)} a {formatDateBR(to)} · {platform ? platformOf(platform).name : "Todas as plataformas"}{carro && vName.get(carro) ? ` · ${vName.get(carro)}` : ""}</p>

          <div className="grid grid-cols-3 gap-3 mt-5">
            <div className="rounded-xl border-2 border-emerald-600 p-3"><p className="text-xs font-bold text-emerald-700 uppercase">Ganho bruto</p><p className="text-2xl font-extrabold">{brl(t.gross)}</p></div>
            <div className="rounded-xl border-2 border-red-600 p-3"><p className="text-xs font-bold text-red-700 uppercase">Despesas</p><p className="text-2xl font-extrabold">{brl(t.expenses)}</p></div>
            <div className="rounded-xl border-2 border-gray-900 bg-gray-900 text-white p-3"><p className="text-xs font-bold uppercase">Lucro líquido</p><p className="text-2xl font-extrabold">{brl(t.net)}</p></div>
          </div>

          <table className="w-full mt-5 border-collapse">
            <tbody>
              {[
                ["Dias trabalhados", String(sum.days)], ["Turnos", String(sum.shifts)], ["Horas", t.hours ? hoursLabel(t.hours) : "—"], ["Km rodados", `${t.km.toLocaleString("pt-BR")} km`],
                ["Combustível", brl(t.fuel)], ["Custo do carro (manutenção/aluguel)", brl(t.vehicle)], ["Outros gastos", brl(t.extras)], ["Gorjetas", brl(t.tips)],
                ["Ganho por hora (bruto / líquido)", `${perH(t.grossPerHour)} / ${perH(t.netPerHour)}`], ["Ganho por km (bruto / líquido)", `${perKm(t.grossPerKm)} / ${perKm(t.netPerKm)}`], ["Despesa por km", perKm(t.costPerKm)],
              ].map(([a, b]) => <tr key={a}><td className="border border-gray-300 px-3 py-1.5">{a}</td><td className="border border-gray-300 px-3 py-1.5 text-right font-bold">{b}</td></tr>)}
            </tbody>
          </table>

          {!platform && sum.byPlatform.length > 0 && (
            <>
              <h2 className="font-extrabold mt-6 mb-2">Por plataforma</h2>
              <table className="w-full border-collapse text-xs">
                <thead><tr className="bg-gray-100">{["Plataforma", "Dias", "Ganho bruto", "Despesas", "Lucro líquido", "R$/hora", "R$/km"].map((h) => <th key={h} className="border border-gray-300 px-2 py-1 text-left">{h}</th>)}</tr></thead>
                <tbody>{sum.byPlatform.map((p) => (
                  <tr key={p.platform}><td className="border border-gray-300 px-2 py-1">{platformOf(p.platform).name}</td><td className="border border-gray-300 px-2 py-1">{p.days}</td><td className="border border-gray-300 px-2 py-1">{brl(p.metrics.gross)}</td><td className="border border-gray-300 px-2 py-1">{brl(p.metrics.expenses)}</td><td className="border border-gray-300 px-2 py-1 font-bold">{brl(p.metrics.net)}</td><td className="border border-gray-300 px-2 py-1">{p.estimatedHours ? "≈ " : ""}{perH(p.metrics.grossPerHour)}</td><td className="border border-gray-300 px-2 py-1">{perKm(p.metrics.grossPerKm)}</td></tr>
                ))}</tbody>
              </table>
            </>
          )}

          <h2 className="font-extrabold mt-6 mb-2">Dia a dia</h2>
          {list.length === 0 ? <p className="text-gray-500">Nenhum dia no período.</p> : (
            <table className="w-full border-collapse text-xs">
              <thead><tr className="bg-gray-100">{["Data", "Horas", "Km", "Plataformas", "Bruto", "Despesas", "Líquido"].map((h) => <th key={h} className="border border-gray-300 px-2 py-1 text-left">{h}</th>)}</tr></thead>
              <tbody>{list.map((s) => {
                const m = shiftMetrics(s);
                return <tr key={s.id}><td className="border border-gray-300 px-2 py-1">{formatDateBR(s.date)}</td><td className="border border-gray-300 px-2 py-1">{m.hours ? hoursLabel(m.hours) : "—"}</td><td className="border border-gray-300 px-2 py-1">{m.km}</td><td className="border border-gray-300 px-2 py-1">{Array.from(new Set(s.earnings.map((e) => platformOf(e.platform).name))).join(", ")}</td><td className="border border-gray-300 px-2 py-1">{brl(m.gross)}</td><td className="border border-gray-300 px-2 py-1">{brl(m.expenses)}</td><td className="border border-gray-300 px-2 py-1 font-bold">{brl(m.net)}</td></tr>;
              })}</tbody>
            </table>
          )}
          {platform && <p className="text-[11px] text-gray-500 mt-2">No dia a dia aparece o dia inteiro; o resumo acima conta só a parte de {platformOf(platform).name}.</p>}
          <p className="text-[11px] text-gray-500 mt-4">Combustível estimado pela média do carro e pelo preço informado. Gerado pelo Jakash em {formatDateBR(today)}.</p>
        </article>
      )}
    </div>
  );
}

export default function MotoristaRelatorioPage() {
  return <Suspense fallback={<Empty>Carregando…</Empty>}><Report /></Suspense>;
}
