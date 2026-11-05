"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Plane, TriangleAlert } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { useCards } from "@/lib/useCards";
import { useHideValues } from "@/lib/useHideValues";
import { brl, monthRange, parseMoney, shiftMonth, todayISO, monthLabel } from "@/lib/format";
import { TRIP_CATEGORIES, planTrip, tripFit, tripInstallmentLoad, tripScenarios, type TripCategory } from "@/lib/trip";
import { buildPlans, buildTimeline, type InstallmentRow } from "@/lib/installments";
import { PageHeader, Card, Label, ErrorNote, Disclaimer, inputCls, btnCls } from "@/components/ui/page";
import { SectionTabs } from "@/components/SectionTabs";

const num = (v: string) => { const n = parseMoney(v); return Number.isFinite(n) && n > 0 ? n : 0; };

export default function ViagemPage() {
  const { supabase, userId, ready } = useSupabase();
  const { cards } = useCards();
  const { money } = useHideValues();
  const [dest, setDest] = useState("");
  const [start, setStart] = useState("");
  const [days, setDays] = useState("5");
  const [people, setPeople] = useState("2");
  const [buffer, setBuffer] = useState("10");
  const [saved, setSaved] = useState("");
  const [costs, setCosts] = useState<Record<TripCategory, string>>({ transporte: "", hospedagem: "", alimentacao: "", passeios: "", seguro: "", outros: "" });
  const [parts, setParts] = useState(6);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [instRows, setInstRows] = useState<InstallmentRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sobra média dos 3 últimos meses fechados + parcelas que você já tem no cartão.
  useEffect(() => {
    if (!ready || !userId) return;
    (async () => {
      const cur = todayISO().slice(0, 7);
      const from = monthRange(shiftMonth(cur, -3)).start;
      const to = monthRange(cur).start;
      const [t, i] = await Promise.all([
        supabase.from("transactions").select("amount,type").gte("date", from).lt("date", to).is("card_id", null).limit(5000),
        supabase.from("transactions").select("id,user_id,card_id,description,amount,date,invoice_month,installment_group,installment_number,installment_total").not("installment_group", "is", null).limit(5000),
      ]);
      const rows = (t.data ?? []) as { amount: number | string; type: string }[];
      if (rows.length > 0) {
        const inc = rows.filter((x) => x.type === "income").reduce((s, x) => s + Number(x.amount), 0);
        const exp = rows.filter((x) => x.type === "expense").reduce((s, x) => s + Number(x.amount), 0);
        setCapacity(Math.max((inc - exp) / 3, 0));
      } else setCapacity(null);
      setInstRows((i.data ?? []) as InstallmentRow[]);
    })();
  }, [ready, userId, supabase]);

  const numericCosts = useMemo(() => Object.fromEntries(TRIP_CATEGORIES.map((k) => [k.key, num(costs[k.key])])) as Record<TripCategory, number>, [costs]);
  const dayCount = Math.max(1, Math.min(60, Math.round(Number(days) || 1)));
  const peopleCount = Math.max(1, Math.min(20, Math.round(Number(people) || 1)));
  const input = useMemo(() => ({ costs: numericCosts, bufferPct: Math.min(Math.max(Number(buffer.replace(",", ".")) || 0, 0), 50), days: dayCount, startDate: start, saved: num(saved) }), [numericCosts, buffer, dayCount, start, saved]);
  const valid = Boolean(start) && start > todayISO() && Object.values(numericCosts).some((v) => v > 0);
  const result = useMemo(() => (valid ? planTrip(input) : null), [valid, input]);
  const scenarios = useMemo(() => (valid ? tripScenarios(input) : []), [valid, input]);
  const fit = result ? tripFit(result.monthly, capacity) : null;

  const timeline = useMemo(() => {
    const today = todayISO();
    const plans = buildPlans(instRows, today, cards);
    return buildTimeline(instRows, plans, today, 12).map((t) => ({ month: t.month, total: t.total }));
  }, [instRows, cards]);
  const load = useMemo(() => (result ? tripInstallmentLoad(result.total, parts, timeline).slice(0, Math.min(Math.max(parts, 1), 12) + 1) : []), [result, parts, timeline]);

  async function createGoal() {
    if (!result || !userId) return;
    setError(null);
    const { error: err } = await supabase.from("goals").insert({
      user_id: userId, name: dest.trim() ? `Viagem: ${dest.trim()}`.slice(0, 60) : "Viagem", icon: "✈️", type: "viagem",
      target_amount: result.total, current_amount: input.saved, deadline: start,
    });
    if (err) { setError("Não foi possível criar o objetivo."); return; }
    setNotice(`Objetivo criado: guarde ${brl(result.monthly)} por mês até a viagem. Acompanhe em Objetivos.`);
    window.dispatchEvent(new Event("jakash:changed"));
  }

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <PageHeader title="Simulador de viagem" subtitle="Monte uma estimativa, veja quanto guardar por mês e se cabe no seu bolso." />
      <SectionTabs group="guardar" />

      <Card className="mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="col-span-2"><Label>Destino (opcional)</Label><input className={inputCls} value={dest} onChange={(e) => setDest(e.target.value)} maxLength={40} placeholder="Ex.: Salvador" /></div>
          <div><Label>Data de ida</Label><input type="date" className={inputCls} value={start} min={todayISO()} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label>Dias</Label><input className={inputCls} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 2))} /></div>
          <div><Label>Pessoas</Label><input className={inputCls} inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value.replace(/\D/g, "").slice(0, 2))} /></div>
          <div><Label>Folga p/ imprevistos (%)</Label><input className={inputCls} inputMode="decimal" value={buffer} onChange={(e) => setBuffer(e.target.value)} /></div>
          <div><Label>Já guardado</Label><input className={inputCls} inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} placeholder="0,00" /></div>
        </div>
        <p className="text-xs font-bold text-gray-500 mb-2">Quanto você estima gastar (total da viagem, de todas as pessoas)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TRIP_CATEGORIES.map((k) => (
            <div key={k.key}><Label>{k.label}</Label><input className={inputCls} inputMode="decimal" value={costs[k.key]} onChange={(e) => setCosts({ ...costs, [k.key]: e.target.value })} placeholder="0,00" /></div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-3">São estimativas suas. O Jakash não consulta preço de passagem, hotel ou pacote e não vende viagem.</p>
      </Card>

      {!result ? (
        <Card><p className="text-sm text-gray-500 text-center py-6">Escolha uma data de ida (futura) e preencha pelo menos um custo para ver o resultado.</p></Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-2 mb-3"><Plane size={18} /><p className="font-extrabold">{dest.trim() ? `Viagem para ${dest.trim()}` : "Sua viagem"}</p></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><p className="text-[11px] font-bold text-gray-500">Custo estimado</p><p className="text-xl font-extrabold">{money(brl(result.total))}</p><p className="text-[11px] text-gray-400">com {money(brl(result.buffer))} de folga</p></div>
              <div><p className="text-[11px] font-bold text-gray-500">Por pessoa</p><p className="text-xl font-extrabold">{money(brl(result.total / peopleCount))}</p></div>
              <div><p className="text-[11px] font-bold text-gray-500">Falta guardar</p><p className="text-xl font-extrabold">{money(brl(result.gap))}</p></div>
              <div><p className="text-[11px] font-bold text-gray-500">Guardar por mês</p><p className="text-xl font-extrabold text-brand-dark dark:text-brand-soft">{money(brl(result.monthly))}</p><p className="text-[11px] text-gray-400">por {result.months} {result.months === 1 ? "mês" : "meses"}</p></div>
            </div>
            {fit && (
              <div className={`mt-4 flex items-start gap-2 rounded-2xl px-4 py-3 text-sm ${fit.fits === null ? "bg-gray-100 dark:bg-[#1E1E1E] text-gray-600 dark:text-gray-300" : fit.fits ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" : "bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>
                {fit.fits ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : <TriangleAlert size={18} className="shrink-0 mt-0.5" />}
                <p>
                  {fit.fits === null && "Ainda não tenho meses de histórico para comparar com a sua sobra. Lance suas receitas e despesas para ver se cabe."}
                  {fit.fits === true && <>Cabe: sua sobra média dos últimos 3 meses é <strong>{money(brl(fit.capacity as number))}</strong> por mês e sobram {money(brl(fit.diff as number))} depois da viagem.</>}
                  {fit.fits === false && <>Não cabe do jeito que está: sua sobra média é <strong>{money(brl(fit.capacity as number))}</strong> por mês e faltam {money(brl(-(fit.diff as number)))}. Veja os cenários abaixo.</>}
                </p>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2 items-center">
              <button onClick={createGoal} className={btnCls}>Criar objetivo da viagem</button>
              <Link href="/metas" className="text-xs font-bold text-brand-dark dark:text-brand-soft">Ver objetivos</Link>
            </div>
            {notice && <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p>}
            <ErrorNote message={error} />
          </Card>

          <Card>
            <p className="font-extrabold mb-3">E se mudar alguma coisa?</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {scenarios.map((s, i) => (
                <div key={s.label} className={`rounded-2xl p-3 border ${i === 0 ? "border-brand-dark/40 bg-brand-dark/5" : "border-gray-200 dark:border-white/5"}`}>
                  <p className="text-xs font-bold">{s.label}</p>
                  <p className="text-[11px] text-gray-400 mb-2">{s.hint}</p>
                  <p className="text-sm font-extrabold">{money(brl(s.monthly))}<span className="text-[11px] font-bold text-gray-400">/mês</span></p>
                  <p className="text-[11px] text-gray-500">{money(brl(s.total))} em {s.months} {s.months === 1 ? "mês" : "meses"}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p className="font-extrabold">Se parcelar no cartão</p>
              <select aria-label="Número de parcelas" className={inputCls + " !w-auto"} value={parts} onChange={(e) => setParts(Number(e.target.value))}>
                {[3, 6, 10, 12].map((n) => <option key={n} value={n}>{n}x</option>)}
              </select>
            </div>
            <p className="text-xs text-gray-500 mb-3">Parcelas da viagem somadas ao que você já parcelou, a partir do mês que vem.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-gray-500"><th className="py-1 pr-3">Mês</th><th className="py-1 pr-3 text-right">Já parcelado</th><th className="py-1 pr-3 text-right">Viagem</th><th className="py-1 text-right">Total</th></tr></thead>
                <tbody>
                  {load.map((r) => (
                    <tr key={r.month} className="border-t border-gray-100 dark:border-white/5"><td className="py-1.5 pr-3">{monthLabel(r.month.slice(0, 7))}</td><td className="py-1.5 pr-3 text-right">{money(brl(r.existing))}</td><td className="py-1.5 pr-3 text-right">{money(brl(r.trip))}</td><td className="py-1.5 text-right font-bold">{money(brl(r.sum))}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-gray-400 mt-3">Veja o detalhe das suas parcelas em <Link href="/parcelamentos" className="font-bold text-brand-dark dark:text-brand-soft">Parcelamentos</Link>. Parcelar pode ter juros do cartão: confira antes.</p>
          </Card>
        </div>
      )}
      <Disclaimer />
    </div>
  );
}
