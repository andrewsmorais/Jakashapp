"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellPlus, TrendingDown } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSupabase } from "@/lib/useSupabase";
import { useCards } from "@/lib/useCards";
import { brl, formatDateBR, monthStartAgo, parseMoney, todayISO } from "@/lib/format";
import { allowance, commitments, detectRecurring, projectCashflow, type BillIn, type DebtIn, type TxIn } from "@/lib/planning";
import { projectPayoff, type DebtInput } from "@/lib/planner";
import { PageHeader, Card, Empty, ErrorNote, inputCls, btnGhostCls, Label } from "@/components/ui/page";
import { SectionTabs } from "@/components/SectionTabs";

const shortMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
};

export default function PlanejamentoPage() {
  const { supabase, userId, ready } = useSupabase();
  const { cards, invoices, loading: cardsLoading } = useCards();
  const today = todayISO();
  const [cash, setCash] = useState(0);
  const [bills, setBills] = useState<BillIn[]>([]);
  const [debts, setDebts] = useState<DebtInput[]>([]);
  const [avgIncome, setAvgIncome] = useState(0);
  const [hist, setHist] = useState<TxIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [budget, setBudget] = useState("");

  const load = useCallback(async () => {
    const monthStart = `${today.slice(0, 7)}-01`;
    const [a, b, bl, d, inc, h] = await Promise.all([
      supabase.from("accounts").select("id").eq("archived", false),
      supabase.rpc("account_balances"),
      supabase.from("bills").select("description,amount,due_date,type,recurrence").eq("status", "pending").order("due_date").limit(1000),
      supabase.from("debts").select("id,name,kind,balance,monthly_rate,min_payment").eq("archived", false),
      supabase.from("transactions").select("amount,date").eq("type", "income").gte("date", monthStartAgo(3)).lt("date", monthStart).limit(5000),
      supabase.from("transactions").select("description,amount,date,type,installment_group").eq("type", "expense").gte("date", monthStartAgo(6)).order("date").limit(5000),
    ]);
    setError(a.error || b.error || bl.error || d.error || inc.error || h.error ? "Alguns dados não carregaram. Os números abaixo podem estar incompletos." : null);
    const active = new Set(((a.data ?? []) as { id: string }[]).map((x) => x.id));
    setCash(((b.data ?? []) as { id: string; balance: number | string }[]).filter((x) => active.has(x.id)).reduce((s, x) => s + Number(x.balance), 0));
    setBills(((bl.data ?? []) as { description: string; amount: number | string; due_date: string; type: "income" | "expense"; recurrence: "none" | "monthly" }[]).map((x) => ({ ...x, amount: Number(x.amount) })));
    setDebts(((d.data ?? []) as DebtInput[]).map((x) => ({ ...x, balance: Number(x.balance), monthly_rate: Number(x.monthly_rate), min_payment: Number(x.min_payment) })));
    const byMonth: Record<string, number> = {};
    ((inc.data ?? []) as { amount: number | string; date: string }[]).forEach((x) => { byMonth[x.date.slice(0, 7)] = (byMonth[x.date.slice(0, 7)] ?? 0) + Number(x.amount); });
    const vals = Object.keys(byMonth).map((k) => byMonth[k]);
    setAvgIncome(vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : 0);
    setHist(((h.data ?? []) as { description: string; amount: number | string; date: string; type: string; installment_group: string | null }[]).map((x) => ({ ...x, amount: Number(x.amount) })));
    setLoading(false);
  }, [supabase, today]);

  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("jakash:changed", h);
    return () => window.removeEventListener("jakash:changed", h);
  }, [load]);

  const debtsIn: DebtIn[] = debts;
  const a = useMemo(() => allowance({ today, cash, bills, cards, invoices }), [today, cash, bills, cards, invoices]);
  const commit = useMemo(() => commitments({ today, cards, invoices, bills, debts: debtsIn, avgIncome }), [today, cards, invoices, bills, debtsIn, avgIncome]);
  const flow = useMemo(() => projectCashflow({ today, days: 60, cash, bills, cards, invoices }), [today, cash, bills, cards, invoices]);
  const recurring = useMemo(() => detectRecurring(hist, today, bills), [hist, today, bills]);
  const activeRec = recurring.filter((r) => r.active);
  const staleRec = recurring.filter((r) => !r.active);
  const recMonthly = activeRec.reduce((s, r) => s + r.monthly, 0);

  const minTotal = debts.reduce((s, d) => s + (d.balance > 0 ? d.min_payment : 0), 0);
  const budgetValue = budget.trim() ? parseMoney(budget) : minTotal;
  const payoff = useMemo(() => {
    if (!debts.some((d) => d.balance > 0) || !(budgetValue > 0)) return null;
    return { avalanche: projectPayoff(debts, "avalanche", budgetValue), snowball: projectPayoff(debts, "snowball", budgetValue) };
  }, [debts, budgetValue]);

  async function remind(r: (typeof recurring)[number]) {
    setError(null);
    const { error: err } = await supabase.from("bills").insert({ user_id: userId, description: r.name, amount: r.monthly, due_date: r.nextDue, type: "expense", recurrence: "monthly" });
    if (err) setError("Não foi possível criar o lembrete."); else window.dispatchEvent(new Event("jakash:changed"));
  }

  const commitData = commit.map((c) => ({ label: shortMonth(c.month), Faturas: c.invoices, Contas: c.bills, Dívidas: c.debts }));
  const flowData = flow.points.map((p) => ({ label: p.date.slice(8, 10) + "/" + p.date.slice(5, 7), Saldo: p.balance }));
  const upcoming = flow.events.slice(0, 8);
  const noData = !loading && !cardsLoading && cash === 0 && bills.length === 0 && invoices.length === 0 && debts.length === 0;

  return (
    <div className="max-w-4xl mx-auto pb-20 space-y-6">
      <PageHeader title="Planejamento" subtitle="O que já está comprometido, quanto sobra por dia e onde o saldo aperta. Usa só o que você já cadastrou." />
      <SectionTabs group="orcamento" />
      <ErrorNote message={error} />
      {ready && !userId ? <Card><Empty>Você está sem login. <Link href="/login" className="font-bold text-brand-dark dark:text-brand-soft">Entre na sua conta</Link> para ver o planejamento.</Empty></Card> : loading || cardsLoading ? <Empty>Carregando…</Empty> : noData ? (
        <Card><Empty>Cadastre contas bancárias, contas a pagar ou cartões para ver o planejamento aqui.</Empty></Card>
      ) : (
        <>
          <Card>
            <p className="text-xs font-bold text-gray-500">Quanto posso gastar hoje</p>
            <p className={`text-4xl font-extrabold mt-1 ${a.free < 0 ? "text-red-500" : ""}`}>{a.free < 0 ? brl(0) : brl(a.perDay)}<span className="text-base font-bold text-gray-400"> por dia</span></p>
            {a.free < 0 ? (
              <p className="text-sm text-red-500 font-bold mt-2 flex items-start gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> Faltam {brl(-a.free)} para cobrir o que vence até o fim do mês.</p>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">Sobram {brl(a.free)} até o fim do mês ({a.daysLeft} {a.daysLeft === 1 ? "dia" : "dias"}, contando hoje), depois de separar o que vence.</p>
            )}
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
              <div><dt className="text-xs text-gray-500">Em conta</dt><dd className="font-bold">{brl(a.cash)}</dd></div>
              <div><dt className="text-xs text-gray-500">Contas a pagar</dt><dd className="font-bold text-red-500">-{brl(a.toPay)}</dd></div>
              <div><dt className="text-xs text-gray-500">Faturas do mês</dt><dd className="font-bold text-red-500">-{brl(a.cardsDue)}</dd></div>
              <div><dt className="text-xs text-gray-500">A receber</dt><dd className="font-bold text-emerald-500">+{brl(a.toReceive)}</dd></div>
            </dl>
            {a.toReceive > 0 && a.free >= 0 && <p className="text-xs text-gray-500 mt-3">Se os recebimentos previstos entrarem: {brl(a.perDayWithReceivables)} por dia. O valor principal não conta com eles.</p>}
          </Card>

          <Card>
            <h2 className="font-extrabold text-lg">Compromissos dos próximos 6 meses</h2>
            <p className="text-sm text-gray-500 mt-0.5">Faturas de cartão em aberto (inclusive parcelas futuras), contas a pagar e parcelas mínimas das dívidas.</p>
            <div className="h-56 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={commitData} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeOpacity={0.15} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis hide />
                  <Tooltip formatter={(v) => brl(Number(v))} contentStyle={{ borderRadius: 12 }} />
                  <Bar dataKey="Faturas" stackId="a" fill="#5B5BF0" />
                  <Bar dataKey="Contas" stackId="a" fill="#F59E0B" />
                  <Bar dataKey="Dívidas" stackId="a" fill="#EF4444" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
              <span><i className="inline-block w-2.5 h-2.5 rounded-full bg-[#5B5BF0] mr-1" />Faturas</span><span><i className="inline-block w-2.5 h-2.5 rounded-full bg-[#F59E0B] mr-1" />Contas</span><span><i className="inline-block w-2.5 h-2.5 rounded-full bg-[#EF4444] mr-1" />Dívidas</span>
            </div>
            <ul className="divide-y divide-gray-100 dark:divide-[#262626] mt-3">
              {commit.map((c) => (
                <li key={c.month} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                  <span className="font-bold capitalize">{shortMonth(c.month)}</span>
                  <span className="text-gray-500 text-xs">{c.pct === null ? "sem renda registrada" : `${c.pct.toFixed(0)}% da renda média`}</span>
                  <span className={`font-bold whitespace-nowrap ${c.pct !== null && c.pct > 70 ? "text-red-500" : ""}`}>{brl(c.total)}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-400 mt-2">{avgIncome > 0 ? `Renda média dos últimos meses: ${brl(avgIncome)}.` : "Sem receitas nos últimos 3 meses para calcular a renda média."}</p>
          </Card>

          <Card>
            <h2 className="font-extrabold text-lg">Fluxo de caixa dos próximos 60 dias</h2>
            {flow.firstNegative ? (
              <p className="text-sm text-red-500 font-bold mt-1 flex items-start gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> O saldo fica negativo em {formatDateBR(flow.firstNegative)} e chega a {brl(flow.min.balance)} em {formatDateBR(flow.min.date)}.</p>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">O saldo não fica negativo. O ponto mais baixo é {brl(flow.min.balance)} em {formatDateBR(flow.min.date)}.</p>
            )}
            <div className="h-52 mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={flowData} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                  <defs><linearGradient id="flowg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#5B5BF0" stopOpacity={0.35} /><stop offset="95%" stopColor="#5B5BF0" stopOpacity={0} /></linearGradient></defs>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval={9} />
                  <YAxis hide domain={["auto", "auto"]} />
                  <Tooltip formatter={(v) => brl(Number(v))} contentStyle={{ borderRadius: 12 }} />
                  <ReferenceLine y={0} stroke="#EF4444" strokeDasharray="4 4" />
                  <Area type="stepAfter" dataKey="Saldo" stroke="#5B5BF0" strokeWidth={2} fill="url(#flowg)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {upcoming.length > 0 && (
              <ul className="divide-y divide-gray-100 dark:divide-[#262626] mt-3">
                {upcoming.map((e, i) => (
                  <li key={i} className="py-2 flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate"><span className="text-xs text-gray-500 mr-2">{formatDateBR(e.date).slice(0, 5)}</span>{e.label}</span>
                    <span className={`font-bold whitespace-nowrap shrink-0 ${e.amount < 0 ? "text-red-500" : "text-emerald-500"}`}>{e.amount < 0 ? "-" : "+"}{brl(Math.abs(e.amount))}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-gray-400 mt-2">Considera só contas a pagar/receber e faturas já cadastradas. Salário e gastos do dia a dia que você ainda não lançou não entram, então cadastre o que é certo em Contas a receber para a projeção ficar mais fiel.</p>
          </Card>

          <Card>
            <h2 className="font-extrabold text-lg">Assinaturas e recorrências</h2>
            {activeRec.length === 0 ? (
              <Empty>Ainda não encontrei cobranças que se repetem todo mês. Elas aparecem depois de 3 meses de lançamentos parecidos.</Empty>
            ) : (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{activeRec.length} {activeRec.length === 1 ? "cobrança se repete" : "cobranças se repetem"}: <b>{brl(recMonthly)}</b> por mês, <b>{brl(recMonthly * 12)}</b> por ano. Veja se você ainda usa todas.</p>
                <ul className="divide-y divide-gray-100 dark:divide-[#262626] mt-2">
                  {activeRec.map((r) => (
                    <li key={r.key} className="py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{r.name}</p>
                        <p className="text-xs text-gray-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                          {brl(r.monthly)}/mês · {brl(r.annual)}/ano · última em {formatDateBR(r.last).slice(0, 5)}
                          {r.priceUpPct !== null && <span className="rounded-full bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300 px-2 py-0.5 text-[10px] font-bold">subiu {r.priceUpPct.toFixed(0)}%</span>}
                          {r.isNew && <span className="rounded-full bg-brand-dark/10 text-brand-dark dark:bg-[#262626] dark:text-brand-soft px-2 py-0.5 text-[10px] font-bold">nova</span>}
                        </p>
                      </div>
                      {r.hasBill ? <span className="text-xs text-gray-400 shrink-0 mt-1">com lembrete</span> : (
                        <button type="button" className={btnGhostCls + " shrink-0"} onClick={() => remind(r)}><BellPlus size={14} /> Lembrar</button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {staleRec.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-gray-500 font-bold">Parecem canceladas ({staleRec.length})</summary>
                <ul className="mt-2 space-y-1 text-xs text-gray-500">
                  {staleRec.map((r) => <li key={r.key}>{r.name}: {brl(r.monthly)}/mês, última cobrança em {formatDateBR(r.last)}</li>)}
                </ul>
              </details>
            )}
            <p className="text-xs text-gray-400 mt-3">Detectadas pelos seus lançamentos dos últimos 6 meses: o app só enxerga o que foi registrado. Compras parceladas não entram.</p>
          </Card>

          <Card>
            <h2 className="font-extrabold text-lg flex items-center gap-2"><TrendingDown size={18} /> Estratégia para quitar dívidas</h2>
            {!debts.some((d) => d.balance > 0) ? (
              <p className="text-sm text-gray-500 mt-1">Sem dívidas cadastradas. Se tiver, cadastre em <Link href="/dividas" className="font-bold text-brand-dark dark:text-brand-soft">Dívidas</Link> para comparar as estratégias.</p>
            ) : (
              <>
                <div className="mt-3 max-w-xs">
                  <Label>Quanto cabe pagar por mês no total (R$)</Label>
                  <input className={inputCls} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder={minTotal > 0 ? String(minTotal).replace(".", ",") : "0,00"} />
                </div>
                {!payoff ? <p className="text-sm text-gray-500 mt-3">Informe as parcelas mínimas em Dívidas ou digite aqui o valor mensal.</p> : !payoff.avalanche.ok ? (
                  <p className="text-sm text-red-500 font-bold mt-3">{payoff.avalanche.reason}</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                    {([["Avalanche", "juros mais altos primeiro", payoff.avalanche], ["Bola de neve", "menor saldo primeiro", payoff.snowball]] as const).map(([name, hint, r]) => (
                      <div key={name} className="rounded-2xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-4">
                        <p className="font-extrabold">{name}</p>
                        <p className="text-xs text-gray-500">{hint}</p>
                        <p className="mt-2 text-sm"><b>{r.months}</b> {r.months === 1 ? "mês" : "meses"} · juros de <b>{brl(r.totalInterest)}</b></p>
                      </div>
                    ))}
                  </div>
                )}
                {payoff?.avalanche.ok && payoff.snowball.totalInterest - payoff.avalanche.totalInterest > 0.5 && (
                  <p className="text-sm text-emerald-600 font-bold mt-3">Priorizando os juros mais altos você paga {brl(payoff.snowball.totalInterest - payoff.avalanche.totalInterest)} a menos de juros.</p>
                )}
                <p className="text-xs text-gray-400 mt-3">Simulação com os saldos, juros e parcelas que você informou. <Link href="/dividas" className="font-bold text-brand-dark dark:text-brand-soft">Ver o plano completo em Dívidas</Link>.</p>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
