"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, FileText, Users, ClipboardCheck, Calculator, Truck, Package, FileCheck } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { useUsageType } from "@/lib/useUsageType";
import { brl, formatDateBR, parseMoney, todayISO } from "@/lib/format";
import {
  ACTIVITY_LABEL, EMPTY_SUMMARY, MEI_DEFAULT_LIMIT, dasDueDate, limitForYear, limitStatus, meiObligations, monthlySeries, planLimit, profitSummary,
  projectYearRevenue, reportMonthFor, toSummary, type MeiActivity, type YearSummary,
} from "@/lib/mei";
import { computeDas } from "@/lib/meiConstants";
import { PixCharge, type PixProfile } from "@/components/mei/PixCharge";
import { AccountantLinks } from "@/components/mei/AccountantLinks";
import { BackTitle, Card, Empty, ErrorNote, Label, Progress, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";

type Prof = {
  full_name: string | null; business_name: string | null; business_cnpj: string | null; mei_activity: MeiActivity; mei_opened_on: string | null;
  mei_annual_limit: number; pix_key: string | null; pix_key_type: string | null; pix_name: string | null; pix_city: string | null;
};
type DasBill = { id: string; amount: number; due_date: string };

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_FULL = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export default function MeiPage() {
  const { supabase, userId, ready } = useSupabase();
  const { usage, isMei } = useUsageType();
  const today = todayISO();
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [prof, setProf] = useState<Prof | null>(null);
  const [series, setSeries] = useState<{ revenue: number[]; expenses: number[] }>({ revenue: Array(12).fill(0), expenses: Array(12).fill(0) });
  const [summary, setSummary] = useState<YearSummary>(EMPTY_SUMMARY);
  const [das, setDas] = useState<DasBill | null>(null);
  const [dasValue, setDasValue] = useState("");
  const [report, setReport] = useState(reportMonthFor(today.slice(0, 7)));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [form, setForm] = useState({ business_name: "", business_cnpj: "", mei_activity: "servicos" as MeiActivity, mei_opened_on: "", mei_annual_limit: String(MEI_DEFAULT_LIMIT) });

  const load = useCallback(async () => {
    const [p, m, b, ys] = await Promise.all([
      supabase.from("profiles").select("full_name,business_name,business_cnpj,mei_activity,mei_opened_on,mei_annual_limit,pix_key,pix_key_type,pix_name,pix_city").eq("id", userId!).maybeSingle(),
      supabase.rpc("mei_monthly", { p_year: year }),
      supabase.from("bills").select("id,amount,due_date").eq("user_id", userId!).eq("status", "pending").eq("recurrence", "monthly").ilike("description", "DAS MEI%").order("due_date").limit(1),
      supabase.rpc("mei_year_summary", { p_year: year }),
    ]);
    if (p.error || m.error) setError("Não foi possível carregar os dados do MEI.");
    const pr = p.data as Prof | null;
    if (pr) {
      pr.mei_annual_limit = Number(pr.mei_annual_limit);
      setProf(pr);
      setForm({
        business_name: pr.business_name ?? "", business_cnpj: pr.business_cnpj ?? "", mei_activity: pr.mei_activity, mei_opened_on: pr.mei_opened_on ?? "",
        mei_annual_limit: String(pr.mei_annual_limit).replace(".", ","),
      });
    }
    setSeries(monthlySeries((m.data ?? []) as { month: number; revenue: number; expenses: number }[]));
    setSummary(toSummary(((ys.data ?? []) as Partial<Record<keyof YearSummary, number | string>>[])[0]));
    const bill = ((b.data ?? []) as { id: string; amount: number | string; due_date: string }[])[0];
    setDas(bill ? { id: bill.id, amount: Number(bill.amount), due_date: bill.due_date } : null);
    setLoading(false);
  }, [supabase, userId, year]);

  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("jakash:changed", h);
    return () => window.removeEventListener("jakash:changed", h);
  }, [load]);

  const flash = (t: string) => { setNote(t); setTimeout(() => setNote(null), 3000); };

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const limit = parseMoney(form.mei_annual_limit);
    if (!(limit > 0)) { setError("Informe o limite anual (ex.: 81.000)."); return; }
    const { error: err } = await supabase.from("profiles").update({
      business_name: form.business_name.trim() || null, business_cnpj: form.business_cnpj.trim() || null, mei_activity: form.mei_activity,
      mei_opened_on: form.mei_opened_on || null, mei_annual_limit: limit,
    }).eq("id", userId!);
    if (err) setError("Não foi possível salvar."); else { flash("Dados salvos."); load(); }
  }

  async function enableMei() {
    const { error: err } = await supabase.from("profiles").update({ usage_type: "ambos" }).eq("id", userId!);
    if (err) setError("Não foi possível ativar."); else window.location.reload();
  }

  async function createDas() {
    setError(null);
    const v = parseMoney(dasValue);
    if (!(v > 0)) { setError("Informe o valor do seu DAS (aparece no PGMEI ou no boleto)."); return; }
    const { error: err } = await supabase.from("bills").insert({
      user_id: userId, description: "DAS MEI", amount: v, due_date: dasDueDate(today), type: "expense", recurrence: "monthly",
    });
    if (err) setError("Não foi possível criar o lembrete."); else { setDasValue(""); flash("DAS agendado todo dia 20."); window.dispatchEvent(new Event("jakash:changed")); }
  }

  async function updateDas() {
    if (!das) return;
    setError(null);
    const v = parseMoney(dasValue);
    if (!(v > 0)) { setError("Informe o novo valor."); return; }
    const { error: err } = await supabase.from("bills").update({ amount: v }).eq("id", das.id);
    if (err) setError("Não foi possível atualizar."); else { setDasValue(""); flash("Valor do DAS atualizado."); load(); }
  }

  const annual = prof?.mei_annual_limit ?? MEI_DEFAULT_LIMIT;
  const limit = limitForYear(year, annual, prof?.mei_opened_on ?? null);
  const revenue = series.revenue.reduce((a, b) => a + b, 0);
  const st = limitStatus(revenue, limit);
  const projected = year === thisYear ? projectYearRevenue(revenue, today, prof?.mei_opened_on ?? null) : revenue;
  const tone = st.level === "excedido" ? "bad" : st.level === "perigo" ? "bad" : st.level === "atencao" ? "warn" : "ok";
  const maxBar = Math.max(...series.revenue, 1);
  const obligations = meiObligations(today);
  const plan = planLimit(revenue, limit, today, prof?.mei_opened_on ?? null);
  const profit = profitSummary(summary);
  const when = (d: number) => (d === 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} dias`);

  const pixProfile: PixProfile = {
    pix_key: prof?.pix_key ?? null, pix_key_type: prof?.pix_key_type ?? null, pix_name: prof?.pix_name ?? null, pix_city: prof?.pix_city ?? null,
    fallbackName: prof?.business_name || prof?.full_name || "",
  };

  return (
    <div className="max-w-3xl mx-auto pb-20 space-y-6">
      <BackTitle title="Pacote MEI" subtitle="Limite anual, DAS, DASN, clientes, lucro, cobrança por Pix e acesso do contador." />

      {usage !== null && !isMei && (
        <Card className="!bg-amber-50 dark:!bg-amber-500/10">
          <p className="text-sm font-bold text-amber-800 dark:text-amber-200">Seu perfil está como uso pessoal. Ative o uso para a empresa e o MEI passa a aparecer no menu e no lançamento rápido.</p>
          <button type="button" className={btnCls + " mt-3"} onClick={enableMei}>Usar também para a empresa</button>
        </Card>
      )}
      <ErrorNote message={error} />
      {note && <p className="text-sm font-bold text-emerald-600">{note}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/mei/dasn" className="block">
          <Card className="h-full hover:shadow-lg transition-shadow">
            <p className="font-extrabold flex items-center gap-2"><ClipboardCheck size={18} /> DASN pronta para o contador</p>
            <p className="text-sm text-gray-500 mt-1">Receita do ano separada em comércio/indústria e serviços, com CSV e PDF.</p>
          </Card>
        </Link>
        <Link href="/mei/clientes" className="block">
          <Card className="h-full hover:shadow-lg transition-shadow">
            <p className="font-extrabold flex items-center gap-2"><Users size={18} /> Clientes e a receber</p>
            <p className="text-sm text-gray-500 mt-1">Quem ainda não pagou, cobrança no WhatsApp com Pix e histórico por cliente.</p>
          </Card>
        </Link>
        <Link href="/mei/fornecedores" className="block">
          <Card className="h-full hover:shadow-lg transition-shadow">
            <p className="font-extrabold flex items-center gap-2"><Truck size={18} /> Fornecedores</p>
            <p className="text-sm text-gray-500 mt-1">Quem te vende, quanto você compra de cada um e o que ainda deve.</p>
          </Card>
        </Link>
        <Link href="/mei/preco" className="block">
          <Card className="h-full hover:shadow-lg transition-shadow">
            <p className="font-extrabold flex items-center gap-2"><Calculator size={18} /> Calculadora de preço</p>
            <p className="text-sm text-gray-500 mt-1">Quanto cobrar pela hora/produto para cobrir custos, DAS e sua margem.</p>
          </Card>
        </Link>
        <Link href="/mei/recibos" className="block">
          <Card className="h-full hover:shadow-lg transition-shadow">
            <p className="font-extrabold flex items-center gap-2"><FileText size={18} /> Recibos</p>
            <p className="text-sm text-gray-500 mt-1">Registre e imprima recibos simples das faturas emitidas.</p>
          </Card>
        </Link>
        <Link href="/mei/produtos" className="block">
          <Card className="h-full hover:shadow-lg transition-shadow">
            <p className="font-extrabold flex items-center gap-2"><Package size={18} /> Produtos e serviços</p>
            <p className="text-sm text-gray-500 mt-1">Seu catálogo com valor e códigos fiscais, reaproveitado em recibos e na nota.</p>
          </Card>
        </Link>
        <Link href="/mei/nota" className="block">
          <Card className="h-full hover:shadow-lg transition-shadow">
            <p className="font-extrabold flex items-center gap-2"><FileCheck size={18} /> Ficha da nota fiscal</p>
            <p className="text-sm text-gray-500 mt-1">Todos os dados prontos para copiar no emissor oficial da nota. O Jakash não emite.</p>
          </Card>
        </Link>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="font-extrabold text-lg">Limite de faturamento</h2>
          <select className={inputCls + " !w-auto !py-1.5"} value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Ano">
            {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {loading ? <Empty>Carregando…</Empty> : (
          <>
            <p className="text-3xl font-extrabold">{brl(revenue)} <span className="text-base font-bold text-gray-400">de {brl(limit)}</span></p>
            <div className="my-3"><Progress value={st.pct} tone={tone} /></div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {st.level === "ok" && `Você usou ${st.pct.toFixed(0)}% do limite. Restam ${brl(st.remaining)}.`}
              {st.level === "atencao" && `Atenção: ${st.pct.toFixed(0)}% do limite usado. Restam ${brl(st.remaining)}.`}
              {st.level === "perigo" && `Cuidado: ${st.pct.toFixed(0)}% do limite usado. Faltam só ${brl(st.remaining)} para o teto de ${brl(limit)}.`}
              {st.level === "excedido" && `Você passou do limite em ${brl(st.excess)} (${st.excessPct.toFixed(1)}%). Fale com seu contador sobre o desenquadramento: excesso de até 20% e acima de 20% têm tratamentos diferentes.`}
            </p>
            {year === thisYear && revenue > 0 && projected > limit && st.level !== "excedido" && (
              <p className="mt-2 flex items-start gap-2 text-sm font-bold text-amber-700 dark:text-amber-300"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> No ritmo atual você fecha o ano com cerca de {brl(projected)}, acima do limite.</p>
            )}
            {year === thisYear && revenue > 0 && projected <= limit && <p className="mt-2 text-xs text-gray-500">No ritmo atual: cerca de {brl(projected)} até dezembro.</p>}
            {revenue === 0 && <p className="mt-2 text-sm text-gray-500">Nada contado ainda. Marque como &quot;da empresa&quot; as receitas do seu negócio (no lançamento, ou ao importar o extrato) e elas entram aqui.</p>}

            <div className="mt-4 grid grid-cols-12 gap-1.5 items-end h-24" aria-label="Receita da empresa por mês">
              {series.revenue.map((v, i) => (
                <div key={i} className="flex flex-col items-center justify-end h-full gap-1" title={`${MONTHS[i]}: ${brl(v)}`}>
                  <div className="w-full rounded-t-md bg-brand-dark/80 dark:bg-brand-vivid" style={{ height: `${Math.max((v / maxBar) * 100, v > 0 ? 6 : 2)}%`, opacity: v > 0 ? 1 : 0.2 }} />
                  <span className="text-[10px] text-gray-400">{MONTHS[i]}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">Limite padrão de {brl(MEI_DEFAULT_LIMIT)} por ano ({brl(MEI_DEFAULT_LIMIT / 12)} por mês de atividade no ano de abertura). Há projeto de lei para aumentar o teto, ainda não aprovado: confira o valor vigente no Portal do Empreendedor e ajuste abaixo se mudar.</p>
          </>
        )}
      </Card>

      {year === thisYear && !loading && (
        <Card>
          <h2 className="font-extrabold text-lg">Planejador do limite</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            {plan.status === "ok" && `Você está dentro do ritmo. Dá para faturar até ${brl(plan.perMonth)} por mês nos ${plan.monthsLeft} meses que faltam sem passar do limite.`}
            {plan.status === "ritmo_alto" && `No ritmo atual você atinge o limite${plan.hitMonth ? ` por volta de ${MONTH_FULL[plan.hitMonth - 1]}` : " antes de dezembro"}. Para fechar o ano dentro do teto, fature no máximo ${brl(plan.perMonth)} por mês até dezembro.`}
            {plan.status === "no_limite" && `Você está a menos de 5% do teto: restam só ${brl(st.remaining)} no ano. Segure novas receitas ou fale com o contador.`}
            {plan.status === "tolerancia" && `Você passou do limite, mas dentro da faixa de 20% (até ${brl(plan.toleranceLimit)}). O tratamento é diferente de passar dessa faixa: fale com seu contador sobre a diferença do DAS e o desenquadramento.`}
            {plan.status === "desenquadra" && `Você passou de 20% acima do limite (${brl(plan.toleranceLimit)}). Isso muda o enquadramento: fale com seu contador o quanto antes.`}
          </p>
          <div className="grid grid-cols-3 gap-3 mt-4 text-center">
            <div className="rounded-2xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-3"><p className="text-[11px] text-gray-500">Pode faturar por mês</p><p className="font-extrabold">{brl(plan.perMonth)}</p></div>
            <div className="rounded-2xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-3"><p className="text-[11px] text-gray-500">Seu ritmo hoje</p><p className="font-extrabold">{brl(plan.paceNow)}</p></div>
            <div className="rounded-2xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-3"><p className="text-[11px] text-gray-500">Faixa de 20% (teto)</p><p className="font-extrabold">{brl(plan.toleranceLimit)}</p></div>
          </div>
          <p className="text-xs text-gray-400 mt-3">Estimativa com a média dos meses de atividade até agora. Receitas ainda não lançadas ou sazonais mudam o resultado.</p>
        </Card>
      )}

      {!loading && (
        <Card>
          <h2 className="font-extrabold text-lg">Lucro e retiradas de {year}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            <div className="rounded-2xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-3"><p className="text-[11px] text-gray-500">Receita</p><p className="font-extrabold">{brl(profit.revenue)}</p></div>
            <div className="rounded-2xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-3"><p className="text-[11px] text-gray-500">Despesas da empresa</p><p className="font-extrabold">{brl(profit.expenses)}</p></div>
            <div className="rounded-2xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-3"><p className="text-[11px] text-gray-500">Lucro{profit.revenue > 0 ? ` (${profit.margin.toFixed(0)}%)` : ""}</p><p className={`font-extrabold ${profit.profit < 0 ? "text-red-500" : ""}`}>{brl(profit.profit)}</p></div>
            <div className="rounded-2xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-3"><p className="text-[11px] text-gray-500">Já retirado</p><p className="font-extrabold">{brl(profit.draws)}</p></div>
          </div>
          {profit.revenue === 0 ? (
            <p className="text-sm text-gray-500 mt-3">Sem receita da empresa neste ano. Lance receitas e despesas marcadas como “da empresa” e o lucro aparece aqui.</p>
          ) : (
            <div className="mt-4 space-y-2 text-sm">
              <p><span className="font-bold">Lucro real ainda não retirado:</span> {brl(profit.realAvailable)}.</p>
              <p><span className="font-bold">Retirada isenta sem contabilidade:</span> até {brl(profit.exemptAvailable)}
                <span className="text-gray-500"> (lucro presumido de {brl(profit.presumed)} menos o DAS pago de {brl(summary.das_paid)} e as retiradas já feitas).</span></p>
              {profit.needsAccounting > 0 && (
                <p className="text-amber-700 dark:text-amber-300 font-bold flex items-start gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  {brl(profit.needsAccounting)} do seu lucro real só podem ser retirados como isentos com escrituração contábil. Fale com o contador antes de retirar acima da faixa isenta.</p>
              )}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3">Ao lançar a saída para você, marque “É retirada para a pessoa física”: ela não conta como despesa da empresa. O DAS pago é somado dos lançamentos de despesa da empresa que começam com “DAS”. Percentuais de presunção: 8% (comércio e indústria) e 32% (serviços). Confirme com seu contador.</p>
        </Card>
      )}

      <Card>
        <h2 className="font-extrabold text-lg flex items-center gap-2"><CalendarClock size={18} /> Obrigações</h2>
        <ul className="divide-y divide-gray-100 dark:divide-[#262626] mt-2">
          {obligations.map((o) => (
            <li key={o.key} className="py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-sm">{o.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{o.detail}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${o.daysLeft <= 3 ? "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300" : o.daysLeft <= 10 ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" : "bg-brand-dark/10 text-brand-dark dark:bg-[#262626] dark:text-brand-soft"}`}>
                {formatDateBR(o.due)} · {when(o.daysLeft)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-2xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-4">
          <p className="font-bold text-sm">DAS mensal automático</p>
          {prof && (
            <>
              <div className="mt-3 p-3 rounded-lg bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-white/10">
                <p className="text-xs text-gray-500">Valor calculado para {ACTIVITY_LABEL[prof.mei_activity]}</p>
                <p className="text-2xl font-extrabold mt-1">{brl(computeDas(prof.mei_activity === "servicos" ? "servicos" : prof.mei_activity))}</p>
                <p className="text-xs text-gray-500 mt-1">5% do salário mínimo + impostos fixos. Confirme com seu contador.</p>
              </div>
              {das ? (
                <p className="text-xs text-gray-500 mt-3">✓ Agendado em Contas a pagar: {brl(das.amount)}, próximo vencimento {formatDateBR(das.due_date)}. Ao dar baixa, o do mês seguinte é criado sozinho.</p>
              ) : (
                <p className="text-xs text-gray-500 mt-3">Cria a conta &quot;DAS MEI&quot; que se repete todo dia 20. Se o valor acima diferir do seu boleto PGMEI, ajuste abaixo.</p>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                <input className={inputCls + " !w-40"} inputMode="decimal" value={dasValue} onChange={(e) => setDasValue(e.target.value)} placeholder="Valor do DAS" aria-label="Valor do DAS" />
                {das ? <button type="button" className={btnGhostCls + " !py-2.5 !px-4"} onClick={updateDas}>Atualizar valor</button> : <button type="button" className={btnCls} onClick={createDas}>Agendar todo dia 20</button>}
              </div>
            </>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="font-extrabold text-lg flex items-center gap-2"><FileText size={18} /> Relatório mensal de receitas brutas</h2>
        <p className="text-sm text-gray-500 mt-0.5 mb-3">Monta o relatório do mês com as receitas da empresa. Abra e use &quot;Salvar como PDF&quot; na janela de impressão.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div><Label>Mês</Label><input type="month" className={inputCls + " !w-auto"} value={report} max={today.slice(0, 7)} onChange={(e) => setReport(e.target.value)} /></div>
          <Link href={`/mei/relatorio?m=${report}`} className={btnCls}>Abrir relatório</Link>
        </div>
      </Card>

      <PixCharge key={prof ? "p" : "n"} profile={pixProfile} onSaved={load} />

      <AccountantLinks />

      <Card>
        <h2 className="font-extrabold text-lg mb-3">Dados do MEI</h2>
        <form onSubmit={saveProfile} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label>Nome da empresa</Label><input className={inputCls} maxLength={120} value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} /></div>
          <div><Label>CNPJ</Label><input className={inputCls} maxLength={20} value={form.business_cnpj} onChange={(e) => setForm({ ...form, business_cnpj: e.target.value })} placeholder="00.000.000/0000-00" /></div>
          <div><Label>Atividade principal</Label>
            <select className={inputCls} value={form.mei_activity} onChange={(e) => setForm({ ...form, mei_activity: e.target.value as MeiActivity })}>
              {(Object.keys(ACTIVITY_LABEL) as MeiActivity[]).map((k) => <option key={k} value={k}>{ACTIVITY_LABEL[k]}</option>)}
            </select></div>
          <div><Label>Data de abertura</Label><input type="date" className={inputCls} value={form.mei_opened_on} onChange={(e) => setForm({ ...form, mei_opened_on: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Limite anual de faturamento (R$)</Label><input className={inputCls} inputMode="decimal" value={form.mei_annual_limit} onChange={(e) => setForm({ ...form, mei_annual_limit: e.target.value })} />
            <p className="text-xs text-gray-500 mt-1">Se você abriu o MEI neste ano, o limite é proporcional aos meses de atividade (contando o mês de abertura).</p></div>
          <div className="sm:col-span-2"><button className={btnCls} type="submit">Salvar dados</button></div>
        </form>
      </Card>

      <p className="text-xs text-gray-400">Regras e prazos do MEI mudam. O Jakash ajuda a organizar, mas não substitui seu contador nem o Portal do Empreendedor.</p>
    </div>
  );
}
