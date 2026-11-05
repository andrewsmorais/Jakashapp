"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bell, Building2, Briefcase, Check, Landmark, Plus, Trash2, User, Users } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { useSettings } from "@/contexts/SettingsContext";
import { brl, parseMoney } from "@/lib/format";
import { Label, Toggle, ErrorNote, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";
import { loadCategoryState, visibleCats } from "@/lib/categoryVisibility";

type Lang = "pt" | "en" | "es";
type Usage = "pessoal" | "casal" | "empresarial" | "ambos";
type Fixed = { description: string; amount: string; day: string };
type Acc = { name: string; kind: string; balance: string };
type Cat = { id: string; name: string };

const LANGS: { id: Lang; label: string; flag: string }[] = [
  { id: "pt", label: "Português (Brasil)", flag: "🇧🇷" },
  { id: "en", label: "English", flag: "🇺🇸" },
  { id: "es", label: "Español", flag: "🇪🇸" },
];
const USAGES: { id: Usage; label: string; desc: string; icon: typeof User }[] = [
  { id: "pessoal", label: "Uso pessoal", desc: "Organizar as finanças do dia a dia.", icon: User },
  { id: "casal", label: "Casal", desc: "Cuidar do dinheiro junto com seu parceiro(a).", icon: Users },
  { id: "empresarial", label: "MEI / Negócio", desc: "Controlar as finanças do seu negócio.", icon: Building2 },
  { id: "ambos", label: "Pessoal e negócio", desc: "Separar o pessoal do negócio.", icon: Briefcase },
];
const WHEN = [
  { id: "on_due", label: "No dia do vencimento" },
  { id: "1_day", label: "1 dia antes" },
  { id: "3_days", label: "3 dias antes" },
  { id: "7_days", label: "7 dias antes" },
];
const TOTAL = 7;

// Próxima data com o dia do mês informado (hoje ou depois).
function nextDueDate(day: number): string {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth();
  if (day < now.getDate()) m += 1;
  const last = new Date(y, m + 1, 0).getDate();
  const d = new Date(y, m, Math.min(day, last));
  y = d.getFullYear();
  return `${y}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function FixedStep({ kind, items, setItems }: { kind: "income" | "expense"; items: Fixed[]; setItems: (x: Fixed[]) => void }) {
  const isIncome = kind === "income";
  const update = (i: number, patch: Partial<Fixed>) => setItems(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="rounded-2xl border border-white/70 dark:border-white/5 bg-white/60 dark:bg-[#1E1E1E] p-3 space-y-2">
          <input className={inputCls} placeholder={isIncome ? "Ex.: salário" : "Ex.: aluguel"} value={it.description} onChange={(e) => update(i, { description: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} inputMode="decimal" placeholder="Valor" value={it.amount} onChange={(e) => update(i, { amount: e.target.value })} />
            <input className={inputCls} inputMode="numeric" placeholder="Dia do mês" value={it.day} onChange={(e) => update(i, { day: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
          </div>
          <button type="button" onClick={() => setItems(items.filter((_, k) => k !== i))} className="text-xs text-red-500 font-bold flex items-center gap-1"><Trash2 size={12} /> Remover</button>
        </div>
      ))}
      <button type="button" onClick={() => setItems([...items, { description: "", amount: "", day: "" }])}
        className={`w-full rounded-2xl py-3.5 text-sm font-bold flex items-center justify-center gap-2 ${isIncome ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"}`}>
        <Plus size={16} /> {isIncome ? "Adicionar receita fixa" : "Adicionar despesa fixa"}
      </button>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { supabase, userId, ready } = useSupabase();
  const { language, setLanguage } = useSettings();
  const [step, setStep] = useState(0); // 0 boas-vindas, 1..7 etapas, 8 revisão
  const [usage, setUsage] = useState<Usage | null>(null);
  const [accounts, setAccounts] = useState<Acc[]>([{ name: "", kind: "corrente", balance: "" }]);
  const [incomes, setIncomes] = useState<Fixed[]>([]);
  const [expenses, setExpenses] = useState<Fixed[]>([]);
  const [limit, setLimit] = useState("");
  const [catLimits, setCatLimits] = useState<{ category_id: string; amount: string }[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [remind, setRemind] = useState({ enabled: true, email: true, when: "on_due" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!userId) { router.replace("/login"); return; }
    supabase.from("profiles").select("onboarding_completed").maybeSingle().then(({ data }) => {
      if (data?.onboarding_completed) router.replace("/dashboard");
    });
    // Só as categorias à mostra (conta nova começa com as básicas).
    loadCategoryState(supabase, userId).then((st) => setCats(visibleCats(st.cats, st.hidden).filter((c) => c.type === "expense" && !c.parent_id).map((c) => ({ id: c.id, name: c.name }))));
  }, [ready, userId, supabase, router]);

  const next = () => { setError(null); setStep((s) => s + 1); };
  const back = () => { setError(null); setStep((s) => Math.max(0, s - 1)); };

  async function finish(skipAll = false) {
    setBusy(true);
    setError(null);
    try {
      if (!skipAll) {
        const accRows = accounts.filter((a) => a.name.trim()).map((a) => {
          const v = a.balance.trim() === "" ? 0 : parseMoney(a.balance);
          return { user_id: userId, name: a.name.trim(), kind: a.kind, initial_balance: Number.isNaN(v) ? 0 : v };
        });
        if (accRows.length) { const r = await supabase.from("accounts").insert(accRows); if (r.error) throw r.error; }

        const fixed = (list: Fixed[], type: "income" | "expense") =>
          list.filter((f) => f.description.trim() && parseMoney(f.amount) > 0).map((f) => {
            const day = Math.min(Math.max(parseInt(f.day, 10) || new Date().getDate(), 1), 31);
            return { user_id: userId, description: f.description.trim(), amount: parseMoney(f.amount), due_date: nextDueDate(day), type, recurrence: "monthly" };
          });
        const billRows = [...fixed(incomes, "income"), ...fixed(expenses, "expense")];
        if (billRows.length) { const r = await supabase.from("bills").insert(billRows); if (r.error) throw r.error; }

        const budgetRows: { category_id: string | null; amount_limit: number }[] = [];
        const g = parseMoney(limit);
        if (g > 0) budgetRows.push({ category_id: null, amount_limit: g });
        for (const c of catLimits) { const v = parseMoney(c.amount); if (c.category_id && v > 0) budgetRows.push({ category_id: c.category_id, amount_limit: v }); }
        if (budgetRows.length) {
          const existing = await supabase.from("budgets").select("id,category_id");
          for (const b of budgetRows) {
            const found = (existing.data ?? []).find((e) => (e.category_id ?? null) === b.category_id);
            const r = found
              ? await supabase.from("budgets").update({ amount_limit: b.amount_limit }).eq("id", found.id)
              : await supabase.from("budgets").insert({ user_id: userId, ...b });
            if (r.error) throw r.error;
          }
        }
      }
      const p = await supabase.from("profiles").update({
        onboarding_completed: true,
        ...(skipAll ? {} : {
          usage_type: usage ?? "pessoal", language,
          notify_enabled: remind.enabled, notify_email: remind.email, notify_when: remind.when,
        }),
      }).eq("id", userId);
      if (p.error) throw p.error;
      window.dispatchEvent(new Event("jakash:changed"));
      router.replace("/dashboard");
    } catch {
      setError("Não foi possível salvar agora. Tente de novo.");
      setBusy(false);
    }
  }

  const reviewAccounts = accounts.filter((a) => a.name.trim());
  const shell = "w-full max-w-md mx-auto";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--bg-1)] via-[var(--bg-2)] to-[var(--bg-3)] dark:from-black dark:via-black dark:to-black text-gray-900 dark:text-white">
      <header className="flex items-center justify-between px-5 py-4 max-w-md mx-auto">
        <div className="flex items-center gap-2"><img src="/logo.png" alt="Jakash" className="w-9 h-9 rounded-xl object-cover" /><span className="font-extrabold">Jakash</span></div>
        {step > 0 && step < 8 && <button onClick={() => finish(true)} disabled={busy} className="text-xs font-bold text-gray-500">Pular tudo</button>}
      </header>

      <main className={`${shell} px-5 pb-16`}>
        {step >= 1 && step <= TOTAL && (
          <div className="mb-6">
            <div className="flex gap-1.5 mb-2">{Array.from({ length: TOTAL }).map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-brand-dark dark:bg-brand-vivid" : "bg-brand-dark/15 dark:bg-[#262626]"}`} />)}</div>
            <p className="text-xs font-bold text-gray-500">Etapa {step} de {TOTAL}</p>
          </div>
        )}

        {step === 0 && (
          <div className="text-center pt-8">
            <img src="/logo.png" alt="" className="w-40 h-40 mx-auto rounded-[40px] object-cover shadow-2xl shadow-brand-dark/30 dark:shadow-none" />
            <h1 className="text-3xl font-extrabold mt-8">Bem-vindo ao Jakash</h1>
            <p className="text-gray-500 mt-3">Vamos configurar sua conta em poucos passos para você começar a organizar suas finanças.</p>
            <button onClick={next} className={btnCls + " w-full mt-8 !py-3.5"}>Começar <ArrowRight size={18} /></button>
          </div>
        )}

        {step === 1 && (
          <>
            <h1 className="text-2xl font-extrabold mb-1">Qual idioma você prefere?</h1>
            <p className="text-gray-500 text-sm mb-5">Você pode mudar isso depois nas configurações.</p>
            <div className="space-y-3">
              {LANGS.map((l) => (
                <button key={l.id} onClick={() => setLanguage(l.id)} className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-4 text-left font-bold ${language === l.id ? "border-brand-dark bg-brand-dark/10 dark:border-brand-vivid dark:bg-brand-vivid/15" : "border-white/70 dark:border-white/5 bg-white/60 dark:bg-[#161616]"}`}>
                  <span className="text-xl">{l.flag}</span>{l.label}{language === l.id && <Check size={18} className="ml-auto text-brand-dark dark:text-brand-soft" />}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-2xl font-extrabold mb-1">Como você vai usar o Jakash?</h1>
            <p className="text-gray-500 text-sm mb-5">Isso ajuda a personalizar sua experiência.</p>
            <div className="space-y-3">
              {USAGES.map((u) => (
                <button key={u.id} onClick={() => setUsage(u.id)} className={`w-full flex items-start gap-3 rounded-2xl border px-4 py-4 text-left ${usage === u.id ? "border-brand-dark bg-brand-dark/10 dark:border-brand-vivid dark:bg-brand-vivid/15" : "border-white/70 dark:border-white/5 bg-white/60 dark:bg-[#161616]"}`}>
                  <u.icon size={22} className="mt-0.5 text-brand-dark dark:text-brand-soft shrink-0" />
                  <span><span className="block font-bold">{u.label}</span><span className="block text-sm text-gray-500">{u.desc}</span></span>
                </button>
              ))}
            </div>
            {!usage && <p className="text-xs text-gray-500 mt-3">Escolha uma opção para continuar.</p>}
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="text-2xl font-extrabold mb-1">Suas contas</h1>
            <p className="text-gray-500 text-sm mb-5">Dê um nome às suas contas e informe o saldo atual. Você pode adicionar mais depois.</p>
            <div className="space-y-3">
              {accounts.map((a, i) => (
                <div key={i} className="rounded-2xl border border-white/70 dark:border-white/5 bg-white/60 dark:bg-[#161616] p-3 space-y-2">
                  <Label>Nome da conta</Label>
                  <input className={inputCls} placeholder="Ex.: Nubank" value={a.name} onChange={(e) => setAccounts(accounts.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
                  <Label>Saldo atual</Label>
                  <input className={inputCls} inputMode="decimal" placeholder="R$ 0,00" value={a.balance} onChange={(e) => setAccounts(accounts.map((x, k) => (k === i ? { ...x, balance: e.target.value } : x)))} />
                  {accounts.length > 1 && <button onClick={() => setAccounts(accounts.filter((_, k) => k !== i))} className="text-xs text-red-500 font-bold flex items-center gap-1"><Trash2 size={12} /> Remover</button>}
                </div>
              ))}
              <button onClick={() => setAccounts([...accounts, { name: "", kind: "corrente", balance: "" }])} className={btnGhostCls + " w-full !py-3"}><Plus size={16} /> Adicionar conta</button>
              <div className="rounded-2xl bg-brand-dark/5 dark:bg-[#161616] p-4 flex gap-3 text-sm text-gray-500"><Landmark size={20} className="shrink-0 text-brand-dark dark:text-brand-soft" /><span>A conexão automática com o banco (Open Finance) ainda não está disponível. Por enquanto, você lança pelo app ou importa o extrato.</span></div>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h1 className="text-2xl font-extrabold mb-1">Você tem alguma <span className="rounded-lg bg-emerald-500/20 px-1.5">receita fixa</span>?</h1>
            <p className="text-gray-500 text-sm mb-5">Inclua valores que recebe todo mês, como salário ou pagamentos recorrentes.</p>
            <FixedStep kind="income" items={incomes} setItems={setIncomes} />
          </>
        )}

        {step === 5 && (
          <>
            <h1 className="text-2xl font-extrabold mb-1">Você tem alguma <span className="rounded-lg bg-red-500/20 px-1.5">despesa fixa</span>?</h1>
            <p className="text-gray-500 text-sm mb-5">Inclua contas que se repetem todo mês, como aluguel, internet e assinaturas{usage === "empresarial" || usage === "ambos" ? " (e o DAS do MEI)" : ""}.</p>
            <FixedStep kind="expense" items={expenses} setItems={setExpenses} />
          </>
        )}

        {step === 6 && (
          <>
            <h1 className="text-2xl font-extrabold mb-1">Quanto quer gastar por mês?</h1>
            <p className="text-gray-500 text-sm mb-5">Inclui despesas fixas e outros gastos do mês. Você acompanha o quanto já usou.</p>
            <input className={inputCls + " !text-lg"} inputMode="decimal" placeholder="Definir valor (R$)" value={limit} onChange={(e) => setLimit(e.target.value)} />
            <div className="mt-5 rounded-2xl border border-white/70 dark:border-white/5 bg-white/60 dark:bg-[#161616] p-4 space-y-3">
              <p className="font-bold text-sm">Limites por categoria <span className="font-normal text-gray-500">(opcional)</span></p>
              {catLimits.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_110px_auto] gap-2 items-center">
                  <select className={inputCls} value={c.category_id} onChange={(e) => setCatLimits(catLimits.map((x, k) => (k === i ? { ...x, category_id: e.target.value } : x)))}>
                    <option value="">Categoria</option>
                    {cats.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                  </select>
                  <input className={inputCls} inputMode="decimal" placeholder="Valor" value={c.amount} onChange={(e) => setCatLimits(catLimits.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))} />
                  <button onClick={() => setCatLimits(catLimits.filter((_, k) => k !== i))} aria-label="Remover" className="text-gray-400"><Trash2 size={16} /></button>
                </div>
              ))}
              <button onClick={() => setCatLimits([...catLimits, { category_id: "", amount: "" }])} className={btnGhostCls + " w-full !py-3"}><Plus size={16} /> Adicionar categoria</button>
            </div>
          </>
        )}

        {step === 7 && (
          <>
            <h1 className="text-2xl font-extrabold mb-1">Lembretes de contas</h1>
            <p className="text-gray-500 text-sm mb-5">Escolha como receber avisos das contas próximas do vencimento.</p>
            <div className="space-y-3">
              <Toggle checked={remind.enabled} onChange={(v) => setRemind({ ...remind, enabled: v })} label="Ativar lembretes automáticos" hint="Para todas as contas pendentes" />
              {remind.enabled && (
                <>
                  <p className="font-bold text-sm pt-2">Como deseja receber:</p>
                  <Toggle checked={remind.email} onChange={(v) => setRemind({ ...remind, email: v })} label="E-mail" />
                  <p className="font-bold text-sm pt-2 flex items-center gap-2"><Bell size={16} /> Quando lembrar?</p>
                  <select className={inputCls} value={remind.when} onChange={(e) => setRemind({ ...remind, when: e.target.value })}>
                    {WHEN.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
                  </select>
                </>
              )}
            </div>
          </>
        )}

        {step === 8 && (
          <>
            <h1 className="text-2xl font-extrabold mb-1">Revise sua configuração</h1>
            <p className="text-gray-500 text-sm mb-5">Ao entrar no painel, vamos salvar o que você informou.</p>
            <div className="rounded-2xl bg-white/70 dark:bg-[#161616] p-5 space-y-2 text-sm">
              {([
                ["Tipo de uso", USAGES.find((u) => u.id === usage)?.label ?? "Uso pessoal"],
                ["Contas", String(reviewAccounts.length)],
                ["Receitas fixas", String(incomes.filter((i) => i.description.trim()).length)],
                ["Despesas fixas", String(expenses.filter((i) => i.description.trim()).length)],
                ["Limite mensal", parseMoney(limit) > 0 ? brl(parseMoney(limit)) : "Não definido"],
                ["Lembretes", remind.enabled ? WHEN.find((w) => w.id === remind.when)?.label ?? "" : "Desativados"],
              ] as [string, string][]).map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-gray-500">{k}</span><span className="font-bold">{v}</span></div>)}
            </div>
            <ErrorNote message={error} />
            <button onClick={() => finish(false)} disabled={busy} className={btnCls + " w-full mt-6 !py-3.5"}>{busy ? "Salvando..." : "Ir para o painel"} <ArrowRight size={18} /></button>
          </>
        )}

        {step >= 1 && step <= TOTAL && (
          <div className="mt-6 space-y-2">
            <button onClick={next} disabled={step === 2 && !usage} className={btnCls + " w-full !py-3.5"}>
              {step === 4 && incomes.length === 0 ? "Sem receitas" : step === 5 && expenses.length === 0 ? "Sem despesas" : step === TOTAL ? "Finalizar" : "Continuar"} <ArrowRight size={18} />
            </button>
            <button onClick={back} className={btnGhostCls + " w-full !py-3 !text-sm"}>Voltar</button>
            {[3, 6, 7].includes(step) && <button onClick={next} className="w-full text-sm font-bold text-gray-500 py-2">Configurar depois</button>}
          </div>
        )}
        {step === 8 && <button onClick={back} className={btnGhostCls + " w-full mt-2 !py-3 !text-sm"}>Voltar</button>}
        {step === 0 && <p className="text-center text-xs text-gray-400 mt-6">Leva cerca de 2 minutos. <button onClick={() => finish(true)} className="underline">Pular configuração</button></p>}
      </main>
    </div>
  );
}
