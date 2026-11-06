"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Info, Plus, TriangleAlert, X } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { useHideValues } from "@/lib/useHideValues";
import { brl, monthLabel, monthRange, parseMoney, shiftMonth, todayISO } from "@/lib/format";
import { GOAL_TYPES, type GoalType } from "@/lib/planner";
import {
  GOAL_ITEMS, addMonthsYM, costlyDebts, futureValue, goalCost, impliedRate, monthlyNeeded, monthlyRateFrom, monthsToReach, monthsUntil,
  prepayLast, prepayVsSave, prepayWithAmount, yearlyPctFrom, type DebtLite,
} from "@/lib/simulator";
import { PageHeader, Card, Label, ErrorNote, Disclaimer, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";

// Simulador (Ferramentas): guardar para um objetivo e adiantar parcelas. Só calcula: o app não movimenta dinheiro.

type Tab = "guardar" | "adiantar";
type SaveMode = "ter" | "guardar" | "tempo";
type Debt = DebtLite & { id: string; kind: string; min_payment: number };

const num = (v: string) => { const n = parseMoney(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const ymLabel = (ym: string) => monthLabel(ym).toLowerCase();

function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <div className={`grid gap-1 p-1 rounded-2xl bg-brand-dark/10 dark:bg-[#161616]`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="tablist" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={`py-2.5 px-1 rounded-xl text-xs sm:text-sm font-bold ${value === k ? "bg-white dark:bg-[#262626] shadow-sm" : "text-gray-500"}`}>{l}</button>
      ))}
    </div>
  );
}

function RateInput({ value, unit, onValue, onUnit, label }: { value: string; unit: "mes" | "ano"; onValue: (v: string) => void; onUnit: (u: "mes" | "ano") => void; label: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-2">
        <input className={inputCls} inputMode="decimal" value={value} onChange={(e) => onValue(e.target.value)} placeholder="Ex.: 0,8" />
        <select className={inputCls + " !w-32 shrink-0"} value={unit} onChange={(e) => onUnit(e.target.value as "mes" | "ano")} aria-label="Período da taxa">
          <option value="mes">% ao mês</option>
          <option value="ano">% ao ano</option>
        </select>
      </div>
    </div>
  );
}

export default function SimuladorPage() {
  const { supabase, userId, ready } = useSupabase();
  const { money } = useHideValues();
  const m = (n: number) => money(brl(n));
  const today = todayISO();
  const [tab, setTab] = useState<Tab>("guardar");
  const [debts, setDebts] = useState<Debt[]>([]);
  const [capacity, setCapacity] = useState<number | null>(null);

  // Dívidas com juros (para o aviso de ordem e para puxar dados de um financiamento) e sobra média dos 3 últimos meses.
  useEffect(() => {
    if (!ready || !userId) return;
    (async () => {
      const cur = today.slice(0, 7);
      const [d, t] = await Promise.all([
        supabase.from("debts").select("id,name,kind,balance,monthly_rate,min_payment,status").neq("status", "quitada").limit(50),
        supabase.from("transactions").select("amount,type").gte("date", monthRange(shiftMonth(cur, -3)).start).lt("date", monthRange(cur).start).is("card_id", null).limit(5000),
      ]);
      setDebts(((d.data ?? []) as Record<string, unknown>[]).map((x) => ({ id: String(x.id), name: String(x.name), kind: String(x.kind), balance: Number(x.balance), monthly_rate: Number(x.monthly_rate), min_payment: Number(x.min_payment) })));
      const rows = (t.data ?? []) as { amount: number | string; type: string }[];
      if (rows.length) {
        const inc = rows.filter((x) => x.type === "income").reduce((s, x) => s + Number(x.amount), 0);
        const exp = rows.filter((x) => x.type === "expense").reduce((s, x) => s + Number(x.amount), 0);
        setCapacity(Math.max((inc - exp) / 3, 0));
      }
    })();
  }, [ready, userId, supabase, today]);

  const costly = useMemo(() => costlyDebts(debts), [debts]);

  return (
    <div className="max-w-3xl mx-auto pb-24 space-y-4">
      <PageHeader title="Simulador" subtitle="Faça as contas antes de decidir: quanto juntar para um objetivo e quanto economiza adiantando parcelas." />

      <OrderNotice costly={costly} m={m} />

      <Seg value={tab} onChange={setTab} label="O que simular" options={[["guardar", "Guardar dinheiro"], ["adiantar", "Adiantar parcelas"]]} />

      {tab === "guardar" ? <SaveSim supabase={supabase} userId={userId} today={today} capacity={capacity} m={m} />
        : <PrepaySim debts={debts} today={today} m={m} />}

      <p className="text-xs text-gray-500">O Jakash só faz as contas e anota: guardar, pagar ou adiantar é feito por você, no seu banco.</p>
      <Disclaimer />
    </div>
  );
}

// ---------------------------------------------------------------- aviso: ordem sugerida

function OrderNotice({ costly, m }: { costly: DebtLite[]; m: (n: number) => string }) {
  const [open, setOpen] = useState(false);
  const top = costly[0];
  return (
    <Card className={`!p-4 ${top ? "!bg-amber-50 dark:!bg-amber-500/10" : ""}`}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-start gap-3 text-left">
        {top ? <TriangleAlert size={18} className="text-amber-600 shrink-0 mt-0.5" /> : <Info size={18} className="text-brand-dark dark:text-brand-soft shrink-0 mt-0.5" />}
        <span className="flex-1">
          <span className="block text-sm font-extrabold">Uma ordem que costuma funcionar</span>
          {top
            ? <span className="block text-xs text-gray-600 dark:text-gray-300 mt-0.5">Você tem {plural(costly.length, "dívida", "dívidas")} com juros. A mais cara é <strong>{top.name}</strong> ({pct(top.monthly_rate)} ao mês, saldo {m(top.balance)}). Antes de guardar para objetivos, vale quitar as de juros altos.</span>
            : <span className="block text-xs text-gray-500 mt-0.5">1) dívidas com juros altos, 2) reserva de emergência, 3) objetivos. Toque para ver por quê.</span>}
        </span>
      </button>
      {open && (
        <ol className="mt-3 text-xs text-gray-600 dark:text-gray-300 space-y-1.5 list-decimal pl-5">
          <li><strong>Quitar as dívidas com juros altos</strong> (cartão, cheque especial). Esses juros costumam ser maiores do que qualquer rendimento do dinheiro guardado. Em Dívidas, o &quot;Sair do vermelho&quot; monta a ordem.</li>
          <li><strong>Montar a reserva de emergência</strong>, para um imprevisto não virar dívida nova. Veja em Guardar › Reserva.</li>
          <li><strong>Guardar para os objetivos</strong> (viagem, carro, bebê) e, se sobrar, adiantar parcelas de financiamentos.</li>
          <li className="list-none -ml-5 text-gray-400">É uma referência educativa, não uma recomendação. Cada situação é diferente.</li>
        </ol>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- guardar dinheiro

function SaveSim({ supabase, userId, today, capacity, m }: {
  supabase: ReturnType<typeof useSupabase>["supabase"]; userId: string | null; today: string; capacity: number | null; m: (n: number) => string;
}) {
  const [mode, setMode] = useState<SaveMode>("tempo");
  const [type, setType] = useState<GoalType>("viagem");
  const [name, setName] = useState("");
  const [byItems, setByItems] = useState(false);
  const [target, setTarget] = useState("");
  const [items, setItems] = useState<{ label: string; value: string }[]>(() => GOAL_ITEMS.viagem.map((label) => ({ label, value: "" })));
  const [buffer, setBuffer] = useState("10");
  const [initial, setInitial] = useState("");
  const [monthly, setMonthly] = useState("");
  const [until, setUntil] = useState(addMonthsYM(today, 12));
  const [rate, setRate] = useState("");
  const [unit, setUnit] = useState<"mes" | "ano">("mes");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pickType(t: GoalType) {
    setType(t);
    setItems((cur) => {
      const filled = cur.filter((i) => i.value.trim());
      return filled.length ? cur : (GOAL_ITEMS[t] ?? []).map((label) => ({ label, value: "" }));
    });
  }

  const cost = goalCost(items.map((i) => ({ label: i.label, value: num(i.value) })), num(buffer));
  const goal = byItems ? cost.total : num(target);
  const r = monthlyRateFrom(num(rate), unit);
  const months = monthsUntil(today, until);
  const P = num(initial);
  const A = num(monthly);

  const ter = mode === "ter" && A + P > 0 && months > 0 ? futureValue(P, A, months, r) : null;
  const need = mode === "guardar" && goal > 0 ? monthlyNeeded(goal, P, months, r) : null;
  const time = mode === "tempo" && goal > 0 && (A > 0 || P >= goal) ? monthsToReach(goal, P, A, r) : null;
  const perMonth = mode === "guardar" ? need : A;
  const fits = perMonth != null && perMonth > 0 && capacity != null ? perMonth <= capacity + 0.005 : null;

  // Para criar o objetivo: valor e data.
  const goalValue = mode === "ter" ? ter?.total ?? 0 : goal;
  const goalMonths = mode === "tempo" ? time : months;
  const canCreate = goalValue > 0 && goalMonths != null && goalMonths > 0;

  async function createGoal() {
    if (!userId || !canCreate) return;
    setError(null); setNotice(null);
    const meta = GOAL_TYPES[type];
    const deadline = `${addMonthsYM(today, goalMonths!)}-01`;
    const { error: err } = await supabase.from("goals").insert({
      user_id: userId, name: (name.trim() || meta.label).slice(0, 60), icon: meta.icon, type,
      target_amount: Math.round(goalValue * 100) / 100, current_amount: P, deadline,
    });
    if (err) { setError("Não foi possível criar o objetivo."); return; }
    setNotice(`Objetivo criado em Guardar › Objetivos: ${m(goalValue)} até ${ymLabel(deadline.slice(0, 7))}.`);
    window.dispatchEvent(new Event("jakash:changed"));
  }

  return (
    <>
      <Seg value={mode} onChange={setMode} label="Pergunta" options={[["tempo", "Em quanto tempo?"], ["guardar", "Quanto guardar?"], ["ter", "Quanto vou ter?"]]} />

      <Card className="space-y-3">
        {mode !== "ter" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Objetivo</Label>
                <select className={inputCls} value={type} onChange={(e) => pickType(e.target.value as GoalType)}>
                  {(Object.keys(GOAL_TYPES) as GoalType[]).map((k) => <option key={k} value={k}>{GOAL_TYPES[k].icon} {GOAL_TYPES[k].label}</option>)}
                </select></div>
              <div><Label>Nome (opcional)</Label><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Ex.: Viagem para Natal" /></div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label>Quanto custa o objetivo</Label>
              <button type="button" onClick={() => setByItems(!byItems)} className="text-xs font-bold text-brand-dark dark:text-brand-soft">{byItems ? "Digitar o total" : "Somar item por item"}</button>
            </div>
            {byItems ? (
              <div className="space-y-2 rounded-2xl border border-white/70 dark:border-white/5 p-3">
                {items.map((it, k) => (
                  <div key={k} className="flex gap-2 items-center">
                    <input className={inputCls + " flex-1"} value={it.label} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)))} placeholder="Item" maxLength={40} aria-label="Nome do item" />
                    <input className={inputCls + " !w-32"} inputMode="decimal" value={it.value} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, value: e.target.value } : x)))} placeholder="R$ 0,00" aria-label={`Valor de ${it.label || "item"}`} />
                    <button type="button" onClick={() => setItems(items.filter((_, j) => j !== k))} aria-label={`Tirar ${it.label || "item"}`} className="text-gray-400 p-1"><X size={16} /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setItems([...items, { label: "", value: "" }])} className="text-xs font-bold text-brand-dark dark:text-brand-soft inline-flex items-center gap-1"><Plus size={12} /> Adicionar item</button>
                <div className="flex items-center gap-2">
                  <Label>Folga para imprevistos (%)</Label>
                  <input className={inputCls + " !w-20"} inputMode="decimal" value={buffer} onChange={(e) => setBuffer(e.target.value)} />
                </div>
                <p className="text-sm font-extrabold">Total: {m(cost.total)}{cost.buffer > 0 && <span className="text-xs font-normal text-gray-500"> ({m(cost.subtotal)} + {m(cost.buffer)} de folga)</span>}</p>
                <p className="text-[11px] text-gray-400">Os valores são os que você pesquisar: o app não sabe o preço real das coisas.</p>
              </div>
            ) : (
              <input className={inputCls} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Ex.: 5.000,00" aria-label="Quanto custa o objetivo" />
            )}
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div><Label>Já tenho guardado</Label><input className={inputCls} inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="0,00" /></div>
          {mode !== "guardar"
            ? <div><Label>Consigo guardar por mês</Label><input className={inputCls} inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="Ex.: 200,00" /></div>
            : <div><Label>Quero chegar até</Label><input type="month" className={inputCls} value={until} min={addMonthsYM(today, 1)} onChange={(e) => setUntil(e.target.value)} /></div>}
        </div>
        {mode === "ter" && <div><Label>Guardando até</Label><input type="month" className={inputCls} value={until} min={addMonthsYM(today, 1)} onChange={(e) => setUntil(e.target.value)} /></div>}
        <RateInput label="Rendimento do dinheiro guardado (opcional)" value={rate} unit={unit} onValue={setRate} onUnit={setUnit} />
        <p className="text-[11px] text-gray-400 -mt-1">Deixe em branco para contar só o que você guarda. Se preencher, use a taxa que o seu banco informa; rendimentos variam e podem ter imposto.</p>
      </Card>

      <ResultSave mode={mode} m={m} ter={ter} need={need} time={time} months={months} until={until} goal={goal} today={today} A={A} P={P} rate={r} />

      {fits !== null && (
        <p className={`text-sm font-bold flex items-start gap-2 ${fits ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
          {fits ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <TriangleAlert size={16} className="shrink-0 mt-0.5" />}
          {fits ? `Cabe na sua sobra média dos últimos 3 meses (${m(capacity!)} por mês).` : `É mais do que a sua sobra média dos últimos 3 meses (${m(capacity!)} por mês). Talvez precise de mais tempo ou cortar alguma despesa.`}
        </p>
      )}

      {canCreate && <button type="button" onClick={createGoal} className={btnCls + " w-full"}>Criar objetivo com esses números <ArrowRight size={16} /></button>}
      <ErrorNote message={error} />
      {notice && <p className="text-sm font-bold text-emerald-600">{notice}</p>}
      {type === "viagem" && mode !== "ter" && (
        <Link href="/viagem" className={btnGhostCls + " w-full !py-3"}>Viagem com mais detalhes: dias, pessoas e parcelar no cartão</Link>
      )}
    </>
  );
}

function ResultSave({ mode, m, ter, need, time, months, until, goal, today, A, P, rate }: {
  mode: SaveMode; m: (n: number) => string; ter: ReturnType<typeof futureValue> | null; need: number | null; time: number | null;
  months: number; until: string; goal: number; today: string; A: number; P: number; rate: number;
}) {
  const box = (title: string, big: React.ReactNode, sub?: React.ReactNode) => (
    <Card className="!p-5"><p className="text-xs font-bold text-gray-500">{title}</p><p className="text-3xl font-extrabold mt-1">{big}</p>{sub && <div className="text-sm text-gray-500 mt-2 space-y-1">{sub}</div>}</Card>
  );
  if (mode === "ter") {
    if (months <= 0) return box("Quanto vou ter", "—", "Escolha um mês depois do atual.");
    if (!ter) return box("Quanto vou ter", "—", "Informe quanto consegue guardar por mês.");
    return box(`Guardando até ${ymLabel(until)} (${plural(months, "mês", "meses")}), você vai ter`, m(ter.total),
      <><p>Você colocou {m(ter.deposited)}{ter.interest > 0 ? ` e o rendimento somou ${m(ter.interest)}` : ""}.</p></>);
  }
  if (goal <= 0) return box(mode === "tempo" ? "Em quanto tempo chego lá" : "Quanto guardar por mês", "—", "Informe quanto custa o objetivo.");
  if (mode === "guardar") {
    if (need === null) return box("Quanto guardar por mês", "—", "Escolha um mês depois do atual.");
    if (need === 0) return box("Quanto guardar por mês", "Você já tem o valor!", "O que está guardado já cobre o objetivo.");
    const simple = rate > 0 ? monthlyNeeded(goal, P, months, 0) : null;
    return box(`Para juntar ${m(goal)} até ${ymLabel(until)} (${plural(months, "mês", "meses")}), guarde`, <>{m(need)}<span className="text-base font-bold text-gray-400"> por mês</span></>,
      simple ? <p>Sem contar rendimento, seriam {m(simple)} por mês.</p> : undefined);
  }
  if (A <= 0 && time !== 0) return box("Em quanto tempo chego lá", "—", "Informe quanto consegue guardar por mês.");
  if (time === null) return box("Em quanto tempo chego lá", "Mais de 100 anos", "Guardando esse valor não dá para chegar. Aumente o valor por mês.");
  if (time === 0) return box("Em quanto tempo chego lá", "Você já tem o valor!");
  const when = addMonthsYM(today, time);
  const alt = [Math.round(A * 1.5), Math.round(A * 2)].filter((v) => v > A);
  return box(`Guardando ${m(A)} por mês, você junta ${m(goal)} em`, plural(time, "mês", "meses"),
    <>
      <p>Chega lá em {ymLabel(when)}.</p>
      {alt.length > 0 && <p>Se guardar {alt.map((v) => { const t = monthsToReach(goal, P, v, rate); return `${m(v)}: ${t == null ? "—" : plural(t, "mês", "meses")}`; }).join(" · ")}.</p>}
    </>);
}

// ---------------------------------------------------------------- adiantar parcelas

function PrepaySim({ debts, today, m }: { debts: Debt[]; today: string; m: (n: number) => string }) {
  const [payment, setPayment] = useState("");
  const [remaining, setRemaining] = useState("");
  const [knowRate, setKnowRate] = useState(true);
  const [rate, setRate] = useState("");
  const [unit, setUnit] = useState<"mes" | "ano">("mes");
  const [principal, setPrincipal] = useState("");
  const [total, setTotal] = useState("");
  const [how, setHow] = useState<"parcelas" | "valor" | "tudo">("parcelas");
  const [count, setCount] = useState("1");
  const [cash, setCash] = useState("");
  const [saveRate, setSaveRate] = useState("");
  const [saveUnit, setSaveUnit] = useState<"mes" | "ano">("mes");

  const fromDebts = debts.filter((d) => d.monthly_rate > 0);
  function applyDebt(id: string) {
    const d = fromDebts.find((x) => x.id === id);
    if (!d) return;
    setKnowRate(true); setUnit("mes"); setRate(String(d.monthly_rate).replace(".", ","));
    if (d.min_payment > 0) setPayment(String(d.min_payment).replace(".", ","));
  }

  const A = num(payment);
  const n = Math.floor(num(remaining));
  const implied = !knowRate ? impliedRate(num(principal), Math.floor(num(total)), A) : null;
  const i = knowRate ? monthlyRateFrom(num(rate), unit) : implied ?? 0;
  const rateOk = knowRate ? num(rate) > 0 : implied != null;
  const ready = A > 0 && n > 0 && rateOk;

  const res = !ready ? null
    : how === "tudo" ? { ...prepayLast(A, n, i, n), leftover: 0 }
    : how === "valor" ? prepayWithAmount(A, n, i, num(cash))
    : { ...prepayLast(A, n, i, Math.max(1, Math.floor(num(count)))), leftover: 0 };
  const s = monthlyRateFrom(num(saveRate), saveUnit);
  const vs = res && res.count > 0 && num(saveRate) > 0 ? prepayVsSave(A, n, res, s) : null;

  return (
    <>
      <Card className="space-y-3">
        <p className="text-sm text-gray-500">Financiamento de carro, empréstimo ou parcelado com juros: veja quanto economiza adiantando as <strong>últimas</strong> parcelas.</p>
        {fromDebts.length > 0 && (
          <div><Label>Usar dados de uma dívida cadastrada (opcional)</Label>
            <select className={inputCls} defaultValue="" onChange={(e) => applyDebt(e.target.value)}>
              <option value="">Escolher</option>
              {fromDebts.map((d) => <option key={d.id} value={d.id}>{d.name} · {pct(d.monthly_rate)} ao mês</option>)}
            </select></div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Valor da parcela *</Label><input className={inputCls} inputMode="decimal" value={payment} onChange={(e) => setPayment(e.target.value)} placeholder="Ex.: 1.200,00" /></div>
          <div><Label>Parcelas que faltam *</Label><input className={inputCls} inputMode="numeric" value={remaining} onChange={(e) => setRemaining(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="Ex.: 36" /></div>
        </div>
        {knowRate ? (
          <RateInput label="Juros do contrato *" value={rate} unit={unit} onValue={setRate} onUnit={setUnit} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Valor financiado</Label><input className={inputCls} inputMode="decimal" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="Ex.: 40.000,00" /></div>
            <div><Label>Total de parcelas do contrato</Label><input className={inputCls} inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="Ex.: 48" /></div>
          </div>
        )}
        <button type="button" onClick={() => setKnowRate(!knowRate)} className="text-xs font-bold text-brand-dark dark:text-brand-soft">{knowRate ? "Não sei os juros: calcular pelo contrato" : "Sei os juros do contrato"}</button>
        {!knowRate && num(principal) > 0 && num(total) > 0 && A > 0 && (
          implied == null
            ? <p className="text-xs font-bold text-red-600">Esses números não fecham: as parcelas somam menos que o valor financiado. Confira o contrato.</p>
            : <p className="text-xs text-gray-500">Juros calculados: <strong>{pct(implied * 100)} ao mês</strong> ({pct(yearlyPctFrom(implied))} ao ano). Se houver seguro ou tarifas na parcela, o juro real é um pouco menor.</p>
        )}
      </Card>

      <Card className="space-y-3">
        <Label>Como quer adiantar</Label>
        <Seg value={how} onChange={setHow} label="Como adiantar" options={[["parcelas", "Nº de parcelas"], ["valor", "Tenho um valor"], ["tudo", "Quitar tudo"]]} />
        {how === "parcelas" && <div><Label>Quantas parcelas adiantar</Label><input className={inputCls} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, "").slice(0, 3))} /></div>}
        {how === "valor" && <div><Label>Quanto tenho para adiantar</Label><input className={inputCls} inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="Ex.: 5.000,00" /></div>}
      </Card>

      {!ready ? (
        <Card><p className="text-sm text-gray-500">Preencha a parcela, quantas faltam e os juros para ver a economia.</p></Card>
      ) : res && res.count === 0 ? (
        <Card><p className="text-sm text-gray-500">Com esse valor não dá para adiantar nenhuma parcela inteira. A última parcela hoje custa {m(prepayLast(A, n, i, 1).payNow)}.</p></Card>
      ) : res && (
        <Card className="!p-5 space-y-3">
          <p className="text-xs font-bold text-gray-500">{res.count === 1 ? "Adiantando a última parcela" : `Adiantando as ${res.count} últimas parcelas`}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-gray-100 dark:bg-[#1E1E1E] p-3"><p className="text-[11px] font-bold text-gray-500">Você paga hoje</p><p className="text-xl font-extrabold">{m(res.payNow)}</p><p className="text-[11px] text-gray-500">em vez de {m(res.nominal)}</p></div>
            <div className="rounded-2xl bg-emerald-500/10 p-3"><p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Economia de juros</p><p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300">{m(res.savings)}</p>{res.nominal > 0 && <p className="text-[11px] text-gray-500">{pct((res.savings / res.nominal) * 100)} de desconto</p>}</div>
          </div>
          <ul className="text-sm space-y-1">
            <li>{res.remainingAfter === 0 ? <strong>O contrato fica quitado.</strong> : <>Continuam <strong>{plural(res.remainingAfter, "parcela", "parcelas")}</strong> de {m(A)}, como já estão.</>}</li>
            <li>O fim do contrato passa de {ymLabel(addMonthsYM(today, n))} para {res.remainingAfter === 0 ? "hoje" : ymLabel(addMonthsYM(today, res.remainingAfter))}.</li>
            {"leftover" in res && res.leftover > 0 && <li className="text-gray-500">Do seu valor, sobram {m(res.leftover)} (não fecham mais uma parcela).</li>}
          </ul>
          <p className="text-[11px] text-gray-500">Por que as últimas? Elas são as que carregam mais juros: adiantá-las dá o maior desconto. Peça ao banco o valor exato para antecipar, que pode variar um pouco desta conta (tabela Price).</p>
        </Card>
      )}

      {ready && res && res.count > 0 && (
        <Card className="space-y-3">
          <p className="font-extrabold">Adiantar ou guardar o dinheiro?</p>
          <p className="text-sm text-gray-500">Adiantar equivale a fazer o dinheiro render <strong>{pct(i * 100)} ao mês</strong>, os juros do contrato, sem risco. Compare com quanto o seu dinheiro guardado rende:</p>
          <RateInput label="Meu dinheiro guardado rende" value={saveRate} unit={saveUnit} onValue={setSaveRate} onUnit={setSaveUnit} />
          {vs && (
            <div className={`rounded-2xl p-3 text-sm ${vs.advantage >= 0 ? "bg-emerald-500/10" : "bg-sky-500/10"}`}>
              {Math.abs(vs.advantage) < 1
                ? <p className="font-bold">Dá praticamente no mesmo.</p>
                : vs.advantage > 0
                  ? <p><strong>Adiantar vale mais.</strong> No fim do contrato você estaria {m(vs.advantage)} melhor do que deixando o dinheiro rendendo.</p>
                  : <p><strong>Guardar rende mais</strong> neste caso: no fim do contrato, cerca de {m(-vs.advantage)} a mais. Confira se a taxa que você informou é mesmo a que recebe (depois de imposto).</p>}
            </div>
          )}
          <p className="text-[11px] text-gray-500">Antes de adiantar, garanta uma reserva de emergência: dinheiro usado no adiantamento não volta se surgir um imprevisto.</p>
        </Card>
      )}
    </>
  );
}
