"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Circle, FileUp, PartyPopper, Plus, X } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { parseMoney } from "@/lib/format";
import { btnCls, Card, inputCls, Progress } from "@/components/ui/page";

type Step = { key: string; label: string; href: string; done: boolean; title: string; why: string; cta: string };

const DISMISS = "jakash:firstweek:dismissed";
const WINDOW_DAYS = 14;
const KINDS = [
  { id: "corrente", label: "Conta corrente" },
  { id: "dinheiro", label: "Dinheiro" },
  { id: "poupanca", label: "Poupança" },
];

// Primeiros dias: mostra UM próximo passo grande, que a pessoa resolve ali mesmo ou em um toque,
// e a lista dos demais logo abaixo. Some ao concluir tudo ou ao ser dispensado.
export function FirstWeek() {
  const { supabase, userId, ready } = useSupabase();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const hadPending = useRef(false);
  const [form, setForm] = useState({ name: "", kind: "corrente", balance: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isOff: () => boolean = () => false) => {
    if (!ready || !userId) return;
    try { if (localStorage.getItem(DISMISS)) return; } catch { /* segue sem lembrar */ }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || (Date.now() - new Date(user.created_at).getTime()) / 86400000 > WINDOW_DAYS) return;
    const has = async (table: string) => {
      const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId);
      return (count ?? 0) > 0;
    };
    const [acc, tx, budget, bill, card, prof] = await Promise.all([
      has("accounts"), has("transactions"), has("budgets"), has("bills"), has("credit_cards"),
      supabase.from("profiles").select("notify_enabled").eq("id", userId).maybeSingle(),
    ]);
    if (isOff()) return;
    const p = prof.data as { notify_enabled: boolean | null } | null;
    const list: Step[] = [
      { key: "acc", label: "Cadastrar uma conta bancária", href: "/contas-bancarias", done: acc, title: "Comece criando sua conta", why: "É onde seu dinheiro fica: banco, carteira ou poupança. Leva 10 segundos.", cta: "Criar conta" },
      { key: "tx", label: "Fazer o primeiro lançamento", href: "/transacoes", done: tx, title: "Agora faça seu primeiro lançamento", why: "Anote um gasto ou ganho de hoje. O resumo e os gráficos já ganham vida com o primeiro.", cta: "Lançar agora" },
      { key: "budget", label: "Definir um limite de gastos", href: "/limites", done: budget, title: "Defina um limite de gastos", why: "Escolha quanto quer gastar por categoria e acompanhe sem susto no fim do mês.", cta: "Definir limite" },
      { key: "bill", label: "Cadastrar uma conta a pagar ou um cartão", href: "/contas", done: bill || card, title: "Cadastre uma conta a pagar", why: "Aluguel, internet, cartão: o app avisa antes de vencer.", cta: "Cadastrar conta" },
      { key: "notif", label: "Ativar os lembretes de vencimento", href: "/configuracoes/notificacoes", done: Boolean(p?.notify_enabled), title: "Ligue os lembretes", why: "Receba um aviso antes de cada vencimento, no celular ou por e-mail.", cta: "Ativar lembretes" },
    ];
    if (list.some((s) => !s.done)) { hadPending.current = true; setSteps(list); }
    else { setSteps(null); if (hadPending.current) setCelebrate(true); }
  }, [ready, userId, supabase]);

  useEffect(() => {
    let off = false;
    load(() => off);
    return () => { off = true; };
  }, [load]);

  // Quando a pessoa lança algo (ou termina uma etapa em outra tela), a lista se atualiza sozinha.
  useEffect(() => {
    const h = () => { load(); };
    window.addEventListener("jakash:changed", h);
    return () => window.removeEventListener("jakash:changed", h);
  }, [load]);

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    const bal = form.balance.trim() === "" ? 0 : parseMoney(form.balance);
    if (!form.name.trim() || Number.isNaN(bal)) { setError("Informe um nome e, se quiser, um saldo válido."); return; }
    setBusy(true); setError(null);
    const { error: err } = await supabase.from("accounts").insert({ user_id: userId, name: form.name.trim(), kind: form.kind, initial_balance: bal });
    setBusy(false);
    if (err) { setError("Não foi possível criar a conta. Tente de novo."); return; }
    setForm({ name: "", kind: "corrente", balance: "" });
    window.dispatchEvent(new Event("jakash:changed"));
    await load();
  }

  const dismiss = () => { try { localStorage.setItem(DISMISS, "1"); } catch { /* ignora */ } setSteps(null); setCelebrate(false); };

  if (!steps) {
    if (!celebrate) return null;
    return (
      <Card className="mb-5">
        <div className="flex items-start gap-3">
          <PartyPopper className="text-brand-dark dark:text-brand-soft shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-extrabold">Tudo pronto! 🎉</p>
            <p className="text-sm text-gray-500 mt-0.5">Você concluiu os primeiros passos. Daqui para frente é só lançar e acompanhar.</p>
          </div>
          <button type="button" onClick={dismiss} aria-label="Fechar" className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
      </Card>
    );
  }
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done)!;
  const accDone = steps.find((s) => s.key === "acc")?.done;

  return (
    <Card className="mb-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-extrabold">Primeiros passos</p>
          <p className="text-xs text-gray-500">{done} de {steps.length} concluídos</p>
        </div>
        <button type="button" onClick={dismiss} aria-label="Ocultar os primeiros passos" className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
      </div>
      <div className="my-3"><Progress value={(done / steps.length) * 100} /></div>

      <section aria-label="Próximo passo" className="rounded-2xl bg-brand-dark/5 dark:bg-white/5 border border-brand-dark/10 dark:border-white/10 p-4 mb-3">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-brand-dark dark:text-brand-soft">Próximo passo</p>
        <p className="font-extrabold text-lg mt-0.5">{next.title}</p>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{next.why}</p>

        {next.key === "acc" && (
          <form onSubmit={createAccount} className="mt-3 space-y-3">
            <input className={inputCls} placeholder="Nome (ex.: Nubank, Carteira)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Nome da conta" maxLength={60} />
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de conta">
              {KINDS.map((k) => (
                <button key={k.id} type="button" role="radio" aria-checked={form.kind === k.id} onClick={() => setForm({ ...form, kind: k.id })}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold border ${form.kind === k.id ? "bg-brand-dark text-white border-brand-dark dark:bg-brand-vivid dark:border-brand-vivid" : "border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300"}`}>{k.label}</button>
              ))}
            </div>
            <input className={inputCls} inputMode="decimal" placeholder="Saldo de hoje (opcional)" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} aria-label="Saldo atual" />
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={busy} className={btnCls + " w-full sm:w-auto"}>{busy ? "Criando…" : <>{next.cta} <ArrowRight size={16} /></>}</button>
          </form>
        )}

        {next.key === "tx" && (
          <div className="mt-3 space-y-3">
            {accDone && <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-600"><CheckCircle2 size={14} /> Conta criada. Falta só o primeiro lançamento.</p>}
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("jakash:quickadd"))} className={btnCls + " w-full sm:w-auto"}><Plus size={16} /> {next.cta}</button>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-bold text-gray-500">
              <Link href="/importar" className="inline-flex items-center gap-1.5 hover:text-brand-dark dark:hover:text-brand-soft"><FileUp size={14} /> Prefere enviar um extrato ou foto?</Link>
            </div>
          </div>
        )}

        {next.key !== "acc" && next.key !== "tx" && (
          <Link href={next.href} className={btnCls + " mt-3 w-full sm:w-auto"}>{next.cta} <ArrowRight size={16} /></Link>
        )}
      </section>

      <ul className="divide-y divide-gray-100 dark:divide-[#262626]">
        {steps.map((s) => (
          <li key={s.key}>
            {s.done ? (
              <p className="flex items-center gap-3 py-2 text-sm text-gray-400 line-through"><CheckCircle2 size={18} className="text-emerald-500 shrink-0" />{s.label}</p>
            ) : s.key === next.key ? (
              <p className="flex items-center gap-3 py-2 text-sm font-extrabold text-brand-dark dark:text-brand-soft"><Circle size={18} className="shrink-0" />{s.label}</p>
            ) : (
              <Link href={s.href} className="flex items-center gap-3 py-2 text-sm font-bold hover:text-brand-dark dark:hover:text-brand-soft"><Circle size={18} className="text-gray-300 shrink-0" />{s.label}</Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
