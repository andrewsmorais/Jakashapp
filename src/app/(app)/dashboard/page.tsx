"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Eye, EyeOff, Landmark, PiggyBank, CircleDollarSign, CheckCircle2, Clock, TrendingUp, Scale, ArrowUpRight, PlusCircle, CreditCard } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { useHideValues } from "@/lib/useHideValues";
import { useCards } from "@/lib/useCards";
import { dueDateFor, invoiceMonthFor, invoiceStatus, openInvoicesDue } from "@/lib/cards";
import { InvoiceChip } from "@/components/CardBits";
import { brl, currentMonth, monthRange, formatDateBR, daysUntil, todayISO } from "@/lib/format";
import { Card, Progress, Empty, MonthNav } from "@/components/ui/page";
import { FirstWeek } from "@/components/growth/FirstWeek";
import { HomeShortcuts } from "@/components/HomeShortcuts";
import { InstitutionBadge } from "@/components/InstitutionBadge";
import { MonthlyInsight } from "@/components/growth/MonthlyInsight";
import { loadLogos } from "@/lib/logoImage";

type Tx = { id: string; description: string; amount: number; type: "income" | "expense"; date: string; category_id: string | null };
type Bill = { id: string; description: string; amount: number; due_date: string; type: "income" | "expense" };
type Goal = { id: string; name: string; icon: string | null; target_amount: number; current_amount: number };
type Budget = { id: string; category_id: string | null; amount_limit: number };
type Account = { id: string; name: string; kind: string; balance: number; institution?: string | null };

const COLORS = ["#5B5BF0", "#8B5CF6", "#38BDF8", "#F59E0B", "#10B981", "#EC4899", "#94A3B8"];
type Tab = "expense" | "income" | "pending";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function Kpi({ icon: Icon, label, value, tone, hint }: { icon: typeof Landmark; label: string; value: string; tone: string; hint?: string }) {
  return (
    <div className={`relative rounded-[22px] bg-white/75 dark:bg-[#161616] border border-white/80 dark:border-white/5 p-4 pl-5 overflow-hidden shadow-[0_8px_30px_rgba(91,91,240,0.06)] dark:shadow-none`}>
      <span className={`absolute left-0 top-3 bottom-3 w-1.5 rounded-r-full ${tone}`} />
      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-bold mb-2"><Icon size={16} />{label}</div>
      <p className="text-lg md:text-xl font-extrabold">{value}</p>
      {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { supabase, userId, ready } = useSupabase();
  const { hide, toggle, money } = useHideValues();
  const [month, setMonth] = useState(currentMonth());
  const [day, setDay] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [txs, setTxs] = useState<Tx[]>([]);
  const [cats, setCats] = useState<Record<string, { name: string; parent: string | null }>>({});
  const [bills, setBills] = useState<Bill[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [inv, setInv] = useState<{ value: number; invested: number; count: number }>({ value: 0, invested: 0, count: 0 });
  const { cards, invoices } = useCards();
  const [tab, setTab] = useState<Tab>("expense");
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const mr = monthRange(month);
    const start = day ?? mr.start;
    const end = day ? new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + 1)).toISOString().slice(0, 10) : mr.end;
    const isCurrent = month === currentMonth() && !day;
    let billsQ = supabase.from("bills").select("id,description,amount,due_date,type").eq("status", "pending").lt("due_date", end).order("due_date");
    if (!isCurrent) billsQ = billsQ.gte("due_date", start);
    const [p, t, c, b, g, bd, a, iv, ai] = await Promise.all([
      supabase.from("profiles").select("full_name,onboarding_completed").maybeSingle(),
      supabase.from("transactions").select("id,description,amount,type,date,category_id").gte("date", start).lt("date", end).order("date", { ascending: false }).limit(1000),
      supabase.from("categories").select("id,name,parent_id"),
      billsQ.limit(500),
      supabase.from("goals").select("id,name,icon,target_amount,current_amount").eq("status", "in_progress").order("created_at").limit(20),
      supabase.from("budgets").select("id,category_id,amount_limit"),
      supabase.rpc("account_balances"),
      supabase.from("investments").select("invested,current_value").eq("archived", false),
      supabase.from("accounts").select("id,institution"),
    ]);
    setError(Boolean(t.error || c.error || b.error));
    setName((p.data?.full_name ?? "").split(" ")[0]);
    if (p.data && p.data.onboarding_completed === false) router.replace("/bem-vindo");
    setTxs(((t.data ?? []) as Tx[]).map((x) => ({ ...x, amount: Number(x.amount) })));
    setCats(Object.fromEntries((c.data ?? []).map((x) => [x.id, { name: x.name, parent: x.parent_id }])));
    setBills(((b.data ?? []) as Bill[]).map((x) => ({ ...x, amount: Number(x.amount) })));
    setGoals(((g.data ?? []) as Goal[]).map((x) => ({ ...x, target_amount: Number(x.target_amount), current_amount: Number(x.current_amount ?? 0) })));
    setBudgets(((bd.data ?? []) as Budget[]).map((x) => ({ ...x, amount_limit: Number(x.amount_limit) })));
    const instById = new Map(((ai.data ?? []) as { id: string; institution: string | null }[]).map((x) => [x.id, x.institution]));
    setAccounts(((a.data ?? []) as Account[]).map((x) => ({ ...x, balance: Number(x.balance), institution: instById.get(x.id) ?? null })));
    const ivRows = (iv.data ?? []) as { invested: number; current_value: number }[];
    setInv({ value: ivRows.reduce((s, r) => s + Number(r.current_value), 0), invested: ivRows.reduce((s, r) => s + Number(r.invested), 0), count: ivRows.length });
  }, [supabase, month, day, router]);

  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);
  useEffect(() => { if (ready && userId) loadLogos(supabase).then(setLogos); }, [ready, userId, supabase]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("jakash:changed", h);
    return () => window.removeEventListener("jakash:changed", h);
  }, [load]);

  const received = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const paid = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const toReceive = bills.filter((b) => b.type === "income").reduce((s, b) => s + b.amount, 0);
  const toPay = bills.filter((b) => b.type === "expense").reduce((s, b) => s + b.amount, 0);
  const revenue = received + toReceive;
  const expenses = paid + toPay;
  const balanceNow = accounts.reduce((s, a) => s + a.balance, 0);
  const { start, end } = monthRange(month);
  const activeCards = cards.filter((c) => !c.archived && c.kind === "credito");
  const cardsDue = openInvoicesDue(activeCards, invoices, end, month === currentMonth() ? undefined : start);
  const projected = balanceNow + toReceive - toPay - cardsDue;
  const endLabel = formatDateBR(new Date(new Date(end + "T00:00:00").getTime() - 86_400_000).toISOString().slice(0, 10));

  const groupBy = (rows: { name: string; amount: number }[]) =>
    Object.entries(rows.reduce<Record<string, number>>((m, r) => { m[r.name] = (m[r.name] ?? 0) + r.amount; return m; }, {})).sort((a, b) => b[1] - a[1]);
  const catName = (id: string | null) => (id ? cats[id]?.name ?? "Outros" : "Sem categoria");
  const rootName = (id: string | null) => { if (!id) return "Sem categoria"; const c = cats[id]; if (!c) return "Outros"; return c.parent ? cats[c.parent]?.name ?? c.name : c.name; };
  const chartRows =
    tab === "pending"
      ? groupBy(bills.filter((b) => b.type === "expense").map((b) => ({ name: b.description, amount: b.amount })))
      : groupBy(txs.filter((t) => t.type === tab).map((t) => ({ name: rootName(t.category_id), amount: t.amount })));
  const pie = chartRows.slice(0, 6).map(([n, v]) => ({ name: n, value: v }));
  if (chartRows.length > 6) pie.push({ name: "Demais", value: chartRows.slice(6).reduce((s, [, v]) => s + v, 0) });
  const chartTotal = chartRows.reduce((s, [, v]) => s + v, 0);

  const catBudgets = budgets.filter((b) => b.category_id);
  const generalBudget = budgets.find((b) => !b.category_id);
  const limitTotal = generalBudget?.amount_limit ?? catBudgets.reduce((s, b) => s + b.amount_limit, 0);
  const limitPct = limitTotal > 0 ? (paid / limitTotal) * 100 : 0;
  const goalsTarget = goals.reduce((s, g) => s + g.target_amount, 0);
  const goalsPct = goalsTarget > 0 ? (goals.reduce((s, g) => s + g.current_amount, 0) / goalsTarget) * 100 : 0;

  return (
    <div className="max-w-5xl mx-auto pb-10">
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{greeting()},</p>
          <h1 className="text-2xl md:text-3xl font-extrabold">{name || "bem-vindo"} 👋</h1>
        </div>
        <button onClick={toggle} aria-label={hide ? "Mostrar valores" : "Esconder valores"} className="w-10 h-10 rounded-full bg-white/80 dark:bg-[#161616] border border-white/80 dark:border-white/5 flex items-center justify-center text-gray-500">
          {hide ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      <div className="mb-5"><MonthNav month={month} onChange={setMonth} day={day} onDayChange={setDay} /></div>
      {error && <p className="text-sm text-red-500 font-medium mb-4">Não foi possível carregar alguns dados.</p>}

      <FirstWeek />
      <MonthlyInsight />
      <HomeShortcuts />

      {/* Saldo atual */}
      <div className="rounded-[28px] p-6 mb-4 text-white shadow-xl shadow-brand-dark/30 bg-gradient-to-br from-[#6C6CF5] via-[#7C6CF7] to-brand-soft dark:from-brand-vivid dark:via-brand-vivid dark:to-brand-vivid dark:shadow-none flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shrink-0"><PiggyBank size={28} /></div>
        <div className="min-w-0">
          <p className="text-sm font-medium opacity-90">Saldo atual</p>
          <p className="text-3xl md:text-4xl font-extrabold tracking-tight">{money(brl(balanceNow))}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi icon={CircleDollarSign} label="Receita" value={money(brl(revenue))} tone="bg-emerald-500" />
        <Kpi icon={CircleDollarSign} label="Despesas" value={money(brl(expenses))} tone="bg-red-500" />
        <Kpi icon={CheckCircle2} label="Recebido" value={money(brl(received))} tone="bg-sky-500" />
        <Kpi icon={CheckCircle2} label="Pago" value={money(brl(paid))} tone="bg-orange-500" />
        <Kpi icon={Clock} label="A receber" value={money(brl(toReceive))} tone="bg-blue-500" />
        <Kpi icon={Clock} label="A pagar" value={money(brl(toPay))} tone="bg-amber-500" />
        <Kpi icon={TrendingUp} label={`Saldo previsto até ${endLabel}`} value={money(brl(projected))} tone="bg-slate-500" hint={cardsDue > 0 ? `já desconta ${money(brl(cardsDue))} de faturas` : undefined} />
        <Kpi icon={Scale} label="Balanço" value={money(brl(revenue - expenses))} tone="bg-cyan-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Minhas contas */}
        <Card>
          <div className="flex items-center justify-between mb-4"><p className="font-extrabold flex items-center gap-2"><Landmark size={18} /> Minhas contas</p><Link href="/contas-bancarias" className="text-xs font-bold text-brand-dark dark:text-brand-soft">Gerenciar</Link></div>
          {accounts.length === 0 ? (
            <Link href="/contas-bancarias" className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 dark:border-white/10 py-6 text-sm font-bold text-gray-500"><PlusCircle size={18} /> Adicionar conta</Link>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-[#262626]">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-3">
                  <span className="font-bold flex items-center gap-3 min-w-0"><InstitutionBadge institution={a.institution} name={a.name} logo={logos[a.id]} size={36} /><span className="truncate">{a.name}</span></span>
                  <span className="text-right"><span className="block text-[10px] text-gray-400">Saldo atual</span><span className="font-extrabold">{money(brl(a.balance))}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Card>


        {/* Cartão de crédito */}
        <Card>
          <div className="flex items-center justify-between mb-4"><p className="font-extrabold flex items-center gap-2"><CreditCard size={18} /> Cartões</p><Link href="/cartoes" className="text-xs font-bold text-brand-dark dark:text-brand-soft">Gerenciar</Link></div>
          {activeCards.length === 0 ? (
            <Link href="/cartoes" className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 dark:border-white/10 py-6 text-sm font-bold text-gray-500"><PlusCircle size={18} /> Adicionar cartão</Link>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-[#262626]">
              {activeCards.map((c) => {
                const today = todayISO();
                // Próxima fatura a pagar (a mais antiga com valor em aberto, vencida ou não); sem pendência, a fatura atual.
                const next = invoices.filter((i) => i.card_id === c.id && i.total - i.paid > 0.004).sort((a, b) => a.invoice_month.localeCompare(b.invoice_month))[0];
                const im = next?.invoice_month ?? invoiceMonthFor(c, today);
                const row = next ?? invoices.find((i) => i.card_id === c.id && i.invoice_month === im);
                const total = row?.total ?? 0;
                const toPay = Math.max(total - (row?.paid ?? 0), 0);
                return (
                  <li key={c.id}>
                    <Link href={`/cartoes/${c.id}?m=${im.slice(0, 7)}`} className="flex items-center justify-between py-3 gap-3">
                      <span className="min-w-0 flex items-center gap-3"><InstitutionBadge institution={c.institution} name={c.name} logo={logos[c.id]} size={36} /><span className="min-w-0"><span className="block font-bold truncate">{c.name}</span><span className="block text-xs text-gray-500">Vence {formatDateBR(dueDateFor(c, im))}</span></span></span>
                      <span className="text-right shrink-0"><span className="block font-extrabold">{money(brl(toPay))}</span><InvoiceChip status={invoiceStatus(c, im, total, row?.paid ?? 0, today)} /></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Gráfico por categoria */}
        <Card>
          <p className="font-extrabold mb-3">Gráfico por categoria</p>
          <div className="flex gap-2 mb-4 overflow-x-auto">
            {([["expense", "Despesas"], ["income", "Receitas"], ["pending", "A pagar"]] as [Tab, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold ${tab === k ? "bg-gray-900 text-white dark:bg-brand-vivid" : "text-gray-500"}`}>{l}</button>
            ))}
          </div>
          {pie.length === 0 ? <Empty>Ainda não há dados suficientes.</Empty> : (
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="relative w-40 h-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pie} dataKey="value" innerRadius={52} outerRadius={74} paddingAngle={3} stroke="none">
                      {pie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-sm font-extrabold">{money(brl(chartTotal))}</span>
                  <span className="text-[10px] text-gray-500">Total</span>
                </div>
              </div>
              <ul className="w-full space-y-2 text-sm">
                {pie.map((p, i) => (
                  <li key={p.name} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 min-w-0"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} /><span className="truncate">{p.name}</span></span>
                    <span className="font-bold">{Math.round((p.value / chartTotal) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {/* Limites */}
        <Card>
          <div className="flex items-center justify-between mb-3"><p className="font-extrabold">Meus limites de gastos</p><Link href="/limites" aria-label="Abrir limites"><ArrowUpRight size={18} className="text-gray-400" /></Link></div>
          <p className="text-center text-lg font-extrabold">{money(brl(paid))} <span className="text-gray-400 font-bold">de {money(brl(limitTotal))}</span></p>
          <div className="my-3"><Progress value={limitPct} tone={limitPct >= 100 ? "bad" : limitPct >= 80 ? "warn" : "ok"} /></div>
          <p className="text-xs text-gray-500 text-right mb-3">{Math.round(limitPct)}% do limite</p>
          {limitTotal === 0 && <Link href="/limites" className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 dark:border-white/10 py-4 text-sm font-bold text-gray-500"><PlusCircle size={18} /> Adicionar limite de gastos</Link>}
        </Card>

        {/* Metas */}
        <Card>
          <div className="flex items-center justify-between mb-3"><p className="font-extrabold">Meus objetivos</p><Link href="/metas" aria-label="Abrir objetivos"><ArrowUpRight size={18} className="text-gray-400" /></Link></div>
          <div className="flex items-end justify-between mb-2"><span className="text-3xl font-extrabold">{Math.round(goalsPct)}%</span><span className="text-xs font-bold rounded-full bg-brand-dark/10 dark:bg-brand-vivid/20 px-3 py-1">{goals.length} {goals.length === 1 ? "objetivo" : "objetivos"}</span></div>
          <Progress value={goalsPct} />
          {goals.length === 0 && <p className="text-sm text-gray-500 mt-4">Você ainda não tem objetivos. <Link href="/metas" className="font-bold text-brand-dark dark:text-brand-soft">Criar o primeiro</Link></p>}
        </Card>


        {/* Investimentos */}
        <Card>
          <div className="flex items-center justify-between mb-3"><p className="font-extrabold">Meus investimentos</p><Link href="/investimentos" aria-label="Abrir investimentos"><ArrowUpRight size={18} className="text-gray-400" /></Link></div>
          {inv.count === 0 ? (
            <Link href="/investimentos" className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 dark:border-white/10 py-4 text-sm font-bold text-gray-500"><PlusCircle size={18} /> Registrar investimento</Link>
          ) : (
            <>
              <p className="text-3xl font-extrabold">{money(brl(inv.value))}</p>
              <p className={`text-sm font-bold mt-1 ${inv.value - inv.invested >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {inv.value - inv.invested >= 0 ? "+" : ""}{money(brl(inv.value - inv.invested))}
                {inv.invested > 0 && <span className="text-gray-400 font-bold"> ({(((inv.value - inv.invested) / inv.invested) * 100).toFixed(1).replace(".", ",")}%)</span>}
              </p>
            </>
          )}
        </Card>

        {/* Últimas transações */}
        <Card>
          <div className="flex items-center justify-between mb-4"><p className="font-extrabold">Últimos lançamentos</p><Link href="/transacoes" className="text-xs font-bold text-brand-dark dark:text-brand-soft">Ver todos</Link></div>
          {txs.length === 0 ? <Empty>Nenhum lançamento neste mês.</Empty> : (
            <ul className="divide-y divide-gray-100 dark:divide-[#262626]">
              {txs.slice(0, 5).map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="min-w-0"><p className="font-bold truncate text-sm">{t.description}</p><p className="text-xs text-gray-500">{formatDateBR(t.date)} · {catName(t.category_id)}</p></div>
                  <span className={`font-bold text-sm ${t.type === "income" ? "text-emerald-500" : "text-red-500"}`}>{t.type === "income" ? "+" : "-"}{money(brl(t.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Próximas contas */}
        <Card>
          <div className="flex items-center justify-between mb-4"><p className="font-extrabold">Próximas contas</p><Link href="/contas" className="text-xs font-bold text-brand-dark dark:text-brand-soft">Ver todas</Link></div>
          {bills.length === 0 ? <Empty>Nenhuma conta pendente.</Empty> : (
            <ul className="divide-y divide-gray-100 dark:divide-[#262626]">
              {bills.slice(0, 5).map((b) => {
                const d = daysUntil(b.due_date);
                return (
                  <li key={b.id} className="flex items-center justify-between py-2.5 gap-3">
                    <div className="min-w-0"><p className="font-bold truncate text-sm">{b.description}</p>
                      <p className={`text-xs ${d < 0 ? "text-red-500 font-bold" : d <= 3 ? "text-amber-600 font-bold" : "text-gray-500"}`}>{formatDateBR(b.due_date)}{d < 0 ? " · vencida" : d === 0 ? " · hoje" : ""}</p></div>
                    <span className="font-bold text-sm">{money(brl(b.amount))}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
