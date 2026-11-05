"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PartyPopper, ShieldCheck, Trash2 } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { brl, formatDateBR, parseMoney, todayISO } from "@/lib/format";
import type { DebtPlan, DebtStatus } from "@/lib/debtPlan";
import { PageHeader, Card, Label, Empty, ErrorNote, Disclaimer, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";

const KINDS: Record<string, string> = { cartao: "Cartão", cheque_especial: "Cheque especial", emprestimo: "Empréstimo", financiamento: "Financiamento", conta_consumo: "Conta (água, luz, gás)", loja: "Loja / crediário", outro: "Outra" };
const STATUS: Record<DebtStatus, string> = { em_dia: "Em dia", atrasada: "Atrasada", negativada: "Negativada", negociada: "Negociada", quitada: "Quitada" };
const STATUS_TONE: Record<DebtStatus, string> = {
  em_dia: "bg-gray-100 text-gray-600 dark:bg-[#262626] dark:text-gray-300",
  atrasada: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  negativada: "bg-red-500/15 text-red-700 dark:text-red-300",
  negociada: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  quitada: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

type Debt = {
  id: string; name: string; kind: string; balance: number; monthly_rate: number; min_payment: number;
  status: DebtStatus; essential: boolean; creditor: string | null; cash_offer: number | null; overdue_since: string | null;
  agreement_installments: number | null; agreement_amount: number | null; agreement_first_due: string | null;
};
type PlanResponse = { plan: DebtPlan; summary: string; explanation: string | null; miniReserve: number | null; script: string[] };

const EMPTY = { name: "", kind: "cartao", balance: "", monthly_rate: "", min_payment: "", creditor: "", status: "em_dia" as DebtStatus, overdue_since: "", essential: false, cash_offer: "" };
const BUDGET_KEY = "jakash.debt.budget";

export default function DividasPage() {
  const { supabase, userId, ready } = useSupabase();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [more, setMore] = useState(false);
  const [payAmount, setPayAmount] = useState<Record<string, string>>({});
  const [agreeFor, setAgreeFor] = useState<string | null>(null);
  const [agree, setAgree] = useState({ n: "", amount: "", first: "" });
  const [notice, setNotice] = useState<string | null>(null);
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<PlanResponse | null>(null);
  const [showScript, setShowScript] = useState(false);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from("debts")
      .select("id,name,kind,balance,monthly_rate,min_payment,status,essential,creditor,cash_offer,overdue_since,agreement_installments,agreement_amount,agreement_first_due")
      .eq("archived", false).order("created_at");
    if (err) { setError("Não foi possível carregar as dívidas."); return; }
    setError(null);
    setDebts((data ?? []).map((d) => ({
      ...d, balance: Number(d.balance), monthly_rate: Number(d.monthly_rate), min_payment: Number(d.min_payment),
      cash_offer: d.cash_offer == null ? null : Number(d.cash_offer), agreement_amount: d.agreement_amount == null ? null : Number(d.agreement_amount),
    })) as Debt[]);
    setLoaded(true);
  }, [supabase]);

  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("jakash:changed", h);
    return () => window.removeEventListener("jakash:changed", h);
  }, [load]);
  useEffect(() => { try { setBudget(localStorage.getItem(BUDGET_KEY) ?? ""); } catch { /* sem armazenamento: segue vazio */ } }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const balance = parseMoney(form.balance);
    const rate = form.monthly_rate ? parseMoney(form.monthly_rate) : 0;
    const min = form.min_payment ? parseMoney(form.min_payment) : 0;
    const cash = form.cash_offer ? parseMoney(form.cash_offer) : null;
    if (!form.name.trim() || !(balance > 0) || Number.isNaN(rate) || Number.isNaN(min) || (cash !== null && Number.isNaN(cash))) { setError("Informe nome e saldo devedor válidos."); return; }
    const { error: err } = await supabase.from("debts").insert({
      user_id: userId, name: form.name.trim(), kind: form.kind, balance, original_amount: balance, monthly_rate: rate, min_payment: min,
      creditor: form.creditor.trim() || null, status: form.status, essential: form.essential || form.kind === "conta_consumo",
      overdue_since: form.overdue_since || null, cash_offer: cash,
    });
    if (err) { setError("Não foi possível salvar."); return; }
    setForm(EMPTY);
    load();
  }

  async function patchDebt(id: string, patch: Partial<Debt>) {
    const { error: err } = await supabase.from("debts").update(patch).eq("id", id);
    if (err) setError("Não foi possível atualizar."); else load();
  }

  async function pay(id: string) {
    const v = parseMoney(payAmount[id] ?? "");
    if (!(v > 0)) { setError("Informe um valor de pagamento válido."); return; }
    const { error: err } = await supabase.rpc("register_debt_payment", { p_debt_id: id, p_amount: v });
    if (err) { setError("Não foi possível registrar o pagamento."); return; }
    setPayAmount({ ...payAmount, [id]: "" });
    load();
  }

  async function remove(id: string) {
    const { error: err } = await supabase.from("debts").delete().eq("id", id);
    if (err) setError("Não foi possível excluir."); else load();
  }

  async function saveAgreement(e: React.FormEvent) {
    e.preventDefault();
    if (!agreeFor) return;
    const n = Number(agree.n);
    const amount = parseMoney(agree.amount);
    if (!Number.isInteger(n) || n < 1 || n > 60 || !(amount > 0) || !agree.first) { setError("Informe o número de parcelas (1 a 60), o valor e a data da primeira."); return; }
    const { error: err } = await supabase.rpc("register_debt_agreement", { p_debt_id: agreeFor, p_installments: n, p_amount: amount, p_first_due: agree.first });
    if (err) { setError(/já tem parcelas/i.test(err.message) ? "Esta dívida já tem parcelas de acordo a pagar. Dê baixa ou exclua essas parcelas em Contas a pagar antes de registrar outro acordo." : "Não foi possível registrar o acordo."); return; }
    setAgreeFor(null);
    setAgree({ n: "", amount: "", first: "" });
    setNotice(`Acordo registrado: ${n} parcelas de ${brl(amount)}. Elas já aparecem em Contas a pagar, com lembrete antes de vencer.`);
    window.dispatchEvent(new Event("jakash:changed"));
  }

  async function makePlan(e?: React.FormEvent) {
    e?.preventDefault();
    const b = parseMoney(budget);
    if (!(b > 0)) { setError("Informe quanto você consegue pagar por mês."); return; }
    try { localStorage.setItem(BUDGET_KEY, budget); } catch { /* ignora */ }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/debts/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ budget: b }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setError(j.error ?? "Não foi possível montar o plano agora.");
      else setRes(j as PlanResponse);
    } catch { setError("Sem conexão. Tente de novo."); }
    setBusy(false);
  }

  async function createMiniReserve(target: number) {
    if (!userId) return;
    const { data: ex } = await supabase.from("goals").select("id").eq("name", "Reserva inicial").neq("status", "cancelled").limit(1);
    if (ex && ex.length > 0) { setNotice("Você já tem o objetivo “Reserva inicial”. Veja em Guardar."); return; }
    const { error: err } = await supabase.from("goals").insert({ user_id: userId, name: "Reserva inicial", icon: "🛡️", type: "reserva", target_amount: target, current_amount: 0 });
    if (err) { setError("Não foi possível criar o objetivo."); return; }
    setNotice("Objetivo “Reserva inicial” criado. Você acompanha em Guardar.");
    window.dispatchEvent(new Event("jakash:changed"));
  }

  const open = debts.filter((d) => d.status !== "quitada" && d.balance > 0);
  const paidOff = debts.filter((d) => d.status === "quitada" || d.balance <= 0);
  const minTotal = open.reduce((s, d) => s + (d.status === "negociada" && d.agreement_amount ? d.agreement_amount : d.min_payment), 0);
  const totalBalance = open.reduce((s, d) => s + d.balance, 0);

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <PageHeader title="Dívidas" subtitle="Cadastre o que você deve, veja a ordem certa de pagar e saia do vermelho com um plano." />

      {notice && (
        <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          <span>{notice}</span><button onClick={() => setNotice(null)} className="font-bold shrink-0">Ok</button>
        </div>
      )}

      {paidOff.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <PartyPopper size={20} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm text-emerald-800 dark:text-emerald-200">Você já quitou <strong>{paidOff.length}</strong> {paidOff.length === 1 ? "dívida" : "dívidas"}: {paidOff.map((d) => d.name).join(", ")}. Isso é conquista sua.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card><p className="text-xs font-bold text-gray-500">Total devido</p><p className="text-2xl font-bold text-red-500">{brl(totalBalance)}</p></Card>
        <Card><p className="text-xs font-bold text-gray-500">Soma das parcelas mínimas</p><p className="text-2xl font-bold">{brl(minTotal)}</p></Card>
      </div>

      <Card className="mb-6">
        <form onSubmit={add} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div><Label>Nome</Label><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: cartão Nubank" /></div>
          <div><Label>Tipo</Label>
            <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><Label>Saldo devedor</Label><input className={inputCls} inputMode="decimal" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} placeholder="0,00" /></div>
          <div><Label>Juros ao mês (%)</Label><input className={inputCls} inputMode="decimal" value={form.monthly_rate} onChange={(e) => setForm({ ...form, monthly_rate: e.target.value })} placeholder="0" /></div>
          <div><Label>Parcela mínima</Label><input className={inputCls} inputMode="decimal" value={form.min_payment} onChange={(e) => setForm({ ...form, min_payment: e.target.value })} placeholder="0,00" /></div>
          <div className="md:col-span-5">
            <button type="button" onClick={() => setMore((v) => !v)} className="text-xs font-bold text-brand-dark dark:text-brand-soft">{more ? "Menos detalhes" : "Mais detalhes (credor, situação, proposta à vista)"}</button>
          </div>
          {more && (
            <>
              <div><Label>Credor</Label><input className={inputCls} value={form.creditor} onChange={(e) => setForm({ ...form, creditor: e.target.value })} maxLength={80} placeholder="Quem cobra" /></div>
              <div><Label>Situação</Label>
                <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as DebtStatus })}>
                  {(["em_dia", "atrasada", "negativada", "negociada"] as DebtStatus[]).map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}
                </select></div>
              <div><Label>Atrasada desde</Label><input type="date" className={inputCls} value={form.overdue_since} max={todayISO()} onChange={(e) => setForm({ ...form, overdue_since: e.target.value })} /></div>
              <div><Label>Proposta à vista (se tiver)</Label><input className={inputCls} inputMode="decimal" value={form.cash_offer} onChange={(e) => setForm({ ...form, cash_offer: e.target.value })} placeholder="0,00" /></div>
              <label className="flex items-center gap-2 text-sm font-bold pb-2"><input type="checkbox" checked={form.essential} onChange={(e) => setForm({ ...form, essential: e.target.checked })} /> Essencial (água, luz, aluguel)</label>
            </>
          )}
          <div className="md:col-span-5"><button className={btnCls} type="submit">Adicionar dívida</button></div>
        </form>
        <ErrorNote message={error} />
      </Card>

      <Card className="mb-6">
        {!loaded ? <Empty>Carregando...</Empty> : open.length === 0 ? <Empty>Nenhuma dívida em aberto. 🎉</Empty> : (
          <ul className="divide-y divide-gray-100 dark:divide-[#262626]">
            {open.map((d) => (
              <li key={d.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold flex items-center gap-2 flex-wrap">{d.name}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[d.status]}`}>{STATUS[d.status]}</span>
                      {d.essential && <span className="rounded-full bg-brand-dark/10 dark:bg-[#262626] px-2 py-0.5 text-[10px] font-bold text-brand-dark dark:text-brand-soft">Essencial</span>}
                    </p>
                    <p className="text-xs text-gray-500">{KINDS[d.kind]}{d.creditor ? ` · ${d.creditor}` : ""} · {d.monthly_rate}% ao mês · mínimo {brl(d.min_payment)}{d.overdue_since ? ` · atrasada desde ${formatDateBR(d.overdue_since)}` : ""}</p>
                    {d.status === "negociada" && d.agreement_installments && d.agreement_amount && (
                      <p className="text-xs text-sky-700 dark:text-sky-300 mt-0.5">Acordo: {d.agreement_installments}x de {brl(d.agreement_amount)}. As parcelas estão em <Link href="/contas" className="font-bold underline">Contas a pagar</Link>; ao dar baixa, o saldo abate sozinho.</p>
                    )}
                  </div>
                  <span className="font-bold text-red-500">{brl(d.balance)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <select aria-label={`Situação de ${d.name}`} className={inputCls + " !w-auto !py-1.5 text-xs"} value={d.status} onChange={(e) => patchDebt(d.id, { status: e.target.value as DebtStatus })}>
                    {(["em_dia", "atrasada", "negativada", "negociada"] as DebtStatus[]).map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}
                  </select>
                  <input className={inputCls + " !w-24 !py-1.5"} inputMode="decimal" placeholder="Pagou?" aria-label={`Valor pago em ${d.name}`} value={payAmount[d.id] ?? ""} onChange={(e) => setPayAmount({ ...payAmount, [d.id]: e.target.value })} />
                  <button onClick={() => pay(d.id)} className={btnGhostCls}>Abater</button>
                  <button onClick={() => { setAgreeFor(agreeFor === d.id ? null : d.id); setAgree({ n: "", amount: "", first: "" }); }} className={btnGhostCls}>Registrar acordo</button>
                  <button onClick={() => remove(d.id)} aria-label={`Excluir ${d.name}`} className="ml-auto text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                </div>
                {agreeFor === d.id && (
                  <form onSubmit={saveAgreement} className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end rounded-2xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-3">
                    <div><Label>Parcelas</Label><input className={inputCls} inputMode="numeric" value={agree.n} onChange={(e) => setAgree({ ...agree, n: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="Ex.: 6" /></div>
                    <div><Label>Valor de cada</Label><input className={inputCls} inputMode="decimal" value={agree.amount} onChange={(e) => setAgree({ ...agree, amount: e.target.value })} placeholder="0,00" /></div>
                    <div><Label>1ª parcela vence em</Label><input type="date" className={inputCls} value={agree.first} onChange={(e) => setAgree({ ...agree, first: e.target.value })} /></div>
                    <button className={btnCls} type="submit">Criar parcelas</button>
                    <p className="sm:col-span-4 text-[11px] text-gray-500">Cada parcela vira uma conta a pagar com lembrete. Para refazer um acordo, antes dê baixa ou exclua as parcelas pendentes em Contas a pagar.</p>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {open.length > 0 && (
        <Card className="mb-6">
          <p className="font-extrabold mb-1">Sair do vermelho</p>
          <p className="text-xs text-gray-500 mb-3">Diga quanto cabe no seu mês para as dívidas. O plano mostra a ordem e quanto pagar em cada uma.</p>
          <form onSubmit={makePlan} className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="sm:w-64"><Label>Quanto você consegue pagar por mês, no total?</Label>
              <input className={inputCls} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder={`Mínimo ${brl(minTotal)}`} /></div>
            <button className={btnCls} type="submit" disabled={busy}>{busy ? "Montando..." : res ? "Atualizar plano" : "Montar meu plano"}</button>
          </form>
        </Card>
      )}

      {res && (
        <div className="space-y-4 mb-6">
          <Card>
            <p className="font-extrabold mb-2">Seu plano</p>
            <p className="text-sm">{res.explanation ?? res.summary}</p>
            {res.explanation && <p className="text-[11px] text-gray-400 mt-2">{res.summary}</p>}
          </Card>

          {res.plan.ok && (
            <>
              <Card>
                <p className="font-extrabold mb-3">Ordem para pagar</p>
                <ol className="space-y-3">
                  {res.plan.order.map((s) => (
                    <li key={s.id} className="flex gap-3">
                      <span className="w-7 h-7 shrink-0 rounded-full bg-brand-dark/10 dark:bg-[#262626] text-brand-dark dark:text-brand-soft text-sm font-extrabold flex items-center justify-center">{s.rank}</span>
                      <div className="min-w-0">
                        <p className="font-bold">{s.name} <span className="text-gray-400 font-normal">{brl(s.balance)}</span></p>
                        <p className="text-xs text-gray-500">{s.reason}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>

              <Card>
                <p className="font-extrabold mb-3">Para pagar este mês</p>
                <ul className="divide-y divide-gray-100 dark:divide-[#262626]">
                  {res.plan.thisMonth.map((m) => <li key={m.id} className="py-2 flex justify-between text-sm"><span>{m.name}</span><b>{brl(m.amount)}</b></li>)}
                </ul>
                <div className="grid grid-cols-2 gap-3 mt-4 text-xs text-gray-500">
                  <div className="rounded-xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-3"><p className="font-bold text-gray-700 dark:text-gray-200">Juros mais altos primeiro</p><p>{res.plan.avalanche.months} meses · juros {brl(res.plan.avalanche.totalInterest)}</p></div>
                  <div className="rounded-xl bg-brand-dark/5 dark:bg-[#1E1E1E] p-3"><p className="font-bold text-gray-700 dark:text-gray-200">Menor saldo primeiro</p><p>{res.plan.snowball.months} meses · juros {brl(res.plan.snowball.totalInterest)}</p></div>
                </div>
              </Card>
            </>
          )}

          {!res.plan.ok && <Card><p className="text-sm text-red-500 font-bold">{res.plan.reason}</p></Card>}

          {res.plan.agreements.length > 0 && (
            <Card>
              <p className="font-extrabold mb-3">À vista ou parcelado?</p>
              <ul className="space-y-3">
                {res.plan.agreements.map((a) => (
                  <li key={a.id} className="text-sm">
                    <p className="font-bold">{a.name}</p>
                    <p className="text-gray-600 dark:text-gray-300">À vista: {brl(a.cashOffer)} · Parcelado: {a.installments}x de {brl(a.installmentAmount)} ({brl(a.installmentsTotal)} no total)</p>
                    <p className="text-xs text-gray-500">{a.extraIfInstallments > 0 ? `Parcelando você paga ${brl(a.extraIfInstallments)} a mais.` : "O parcelado não sai mais caro que o à vista."} À vista só vale se você tiver o valor inteiro sem faltar para o essencial.</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {res.miniReserve && (
            <Card>
              <div className="flex items-start gap-3">
                <ShieldCheck size={22} className="shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-extrabold">Comece uma reserva pequena</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Um mês de gastos essenciais (cerca de {brl(res.miniReserve)}) evita voltar ao cartão se aparecer um imprevisto. Guarde aos poucos, junto com o plano.</p>
                  <button onClick={() => createMiniReserve(res.miniReserve as number)} className={btnGhostCls + " mt-3"}>Criar objetivo “Reserva inicial”</button>
                </div>
              </div>
            </Card>
          )}

          <Card>
            <button onClick={() => setShowScript((v) => !v)} className="font-extrabold w-full text-left">Roteiro para negociar {showScript ? "−" : "+"}</button>
            {showScript && (
              <ul className="mt-3 list-disc pl-5 space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
                {res.script.map((s) => <li key={s}>{s}</li>)}
              </ul>
            )}
          </Card>
        </div>
      )}
      <Disclaimer />
    </div>
  );
}
