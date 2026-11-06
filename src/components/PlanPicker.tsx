"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { PLANS, PLAN_FEATURES, PLAN_IDS, TRIAL_DAYS, annualSavingsPct, planMonthlyValue, planPrice, type PlanId } from "@/lib/plans";
import { loadStoreProducts, MANAGE_SUBSCRIPTIONS_URL, purchasePlan, restorePurchases, type StoreProduct } from "@/lib/nativePurchases";
import { APP_STORE_URL } from "@/lib/links";
import { ErrorNote, btnCls, btnGhostCls } from "@/components/ui/page";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Props = {
  userId: string;
  /** "iap": dentro do app iOS, compra pela App Store. "web": no site, só mostra os planos e manda para o app do iPhone. */
  mode: "iap" | "web";
  currentPlan?: PlanId | null;
  /** true = já assina pela App Store: mostra "Gerenciar assinatura". */
  subscribedViaApple?: boolean;
  onPurchased: () => void;
  /** Botão "Já assinei" no site: confere de novo se a assinatura já chegou. */
  onRecheck?: () => void;
};

// Os dois planos lado a lado (Mensal e Anual, os dois com 7 dias grátis). Quem decide se a pessoa tem acesso é o servidor:
// a compra é confirmada com a Apple em /api/apple/verify.
export function PlanPicker({ userId, mode, currentPlan, subscribedViaApple, onPurchased, onRecheck }: Props) {
  const [selected, setSelected] = useState<PlanId>("anual");
  const [products, setProducts] = useState<StoreProduct[] | null>(mode === "iap" ? null : []);
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (mode === "iap") loadStoreProducts().then(setProducts); }, [mode]);

  // No app, o preço mostrado é o da App Store (o que a Apple vai cobrar); enquanto não carrega, o da tabela.
  const priceOf = (id: PlanId) => products?.find((p) => p.plan === id)?.priceString ?? planPrice(id);
  const storeHas = (id: PlanId) => mode !== "iap" || Boolean(products?.some((p) => p.plan === id));

  async function run(key: "buy" | "restore", fn: () => ReturnType<typeof purchasePlan>) {
    setBusy(key); setError(null);
    const r = await fn();
    setBusy(null);
    if (r.ok) onPurchased(); else if (!r.cancelled) setError(r.message);
  }

  const sel = PLANS[selected];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Escolha o plano">
        {PLAN_IDS.map((id) => {
          const p = PLANS[id];
          const on = selected === id;
          const isCurrent = currentPlan === id && subscribedViaApple;
          return (
            <button key={id} type="button" role="radio" aria-checked={on} onClick={() => setSelected(id)}
              className={`relative text-left rounded-[24px] border-2 p-4 pt-6 transition-colors ${on ? "border-brand-dark dark:border-brand-vivid bg-brand-dark/5 dark:bg-brand-vivid/10" : "border-gray-200 dark:border-white/10 bg-white/70 dark:bg-[#161616]"}`}>
              {id === "anual" && <span className="absolute -top-2.5 left-3 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-extrabold text-white">ECONOMIZE {annualSavingsPct()}%</span>}
              <span className="block text-sm font-extrabold">{p.short}</span>
              <span className="block mt-2 text-2xl font-extrabold leading-none">{priceOf(id)}</span>
              <span className="block text-xs text-gray-500 mt-1">{id === "anual" ? "por ano" : "por mês"}</span>
              {id === "anual" && <span className="block text-xs font-bold text-emerald-700 dark:text-emerald-400 mt-1">{brl(planMonthlyValue("anual"))} por mês</span>}
              <span className="mt-3 inline-block rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-extrabold text-sky-700 dark:text-sky-300">{TRIAL_DAYS} DIAS GRÁTIS</span>
              {isCurrent && <span className="block mt-2 text-[11px] font-bold text-brand-dark dark:text-brand-soft">Seu plano atual</span>}
              <span className={`absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center ${on ? "border-brand-dark bg-brand-dark dark:border-brand-vivid dark:bg-brand-vivid text-white" : "border-gray-300 dark:border-white/20"}`}>{on && <Check size={12} />}</span>
            </button>
          );
        })}
      </div>

      {mode === "iap" ? (
        <>
          <button type="button" disabled={busy !== null || products === null || !storeHas(selected)} onClick={() => void run("buy", () => purchasePlan(selected, userId))} className={btnCls + " w-full !py-4 !text-base disabled:opacity-60"}>
            {busy === "buy" ? <><Loader2 size={18} className="animate-spin" /> Processando…</>
              : products === null ? "Carregando…"
              : storeHas(selected) ? `Começar ${TRIAL_DAYS} dias grátis` : "Indisponível no momento"}
          </button>
          <p className="text-center text-xs text-gray-500 -mt-2">
            {TRIAL_DAYS} dias grátis, depois {priceOf(selected)} {selected === "anual" ? "por ano" : "por mês"}. Cancele quando quiser.
          </p>
        </>
      ) : (
        <div className="rounded-[24px] border border-white/70 dark:border-white/5 bg-white/60 dark:bg-[#161616] p-4 text-sm space-y-3">
          <p className="font-bold">A assinatura é feita no app do Jakash para iPhone.</p>
          <p className="text-gray-500">Baixe o app, entre com esta mesma conta e escolha o plano {sel.short}. Os {TRIAL_DAYS} dias grátis começam na hora, e o acesso vale aqui no computador também.</p>
          {APP_STORE_URL !== "#" && <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className={btnCls + " w-full"}><ExternalLink size={16} /> Baixar na App Store</a>}
          {onRecheck && <button type="button" onClick={onRecheck} className={btnGhostCls + " w-full !py-3"}><RotateCcw size={16} /> Já assinei no iPhone</button>}
        </div>
      )}

      <ul className="space-y-2">{PLAN_FEATURES.map((f) => <li key={f} className="flex gap-2 text-sm"><Check size={16} className="text-emerald-500 shrink-0 mt-0.5" />{f}</li>)}</ul>

      <ErrorNote message={error} />
      {mode === "iap" && (
        <>
          <button type="button" disabled={busy !== null} onClick={() => void run("restore", () => restorePurchases(userId))} className={btnGhostCls + " w-full !py-3 disabled:opacity-60"}>
            {busy === "restore" ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} Restaurar compras
          </button>
          {subscribedViaApple && <a href={MANAGE_SUBSCRIPTIONS_URL} className={btnGhostCls + " w-full !py-3"}><ExternalLink size={16} /> Gerenciar assinatura</a>}
          <p className="text-xs text-gray-500 leading-relaxed">
            Assinatura com renovação automática ({PLANS.mensal.short}: todo mês; {PLANS.anual.short}: todo ano). Os primeiros {TRIAL_DAYS} dias são grátis; se você não cancelar
            até 24 horas antes do fim do teste, a cobrança é feita na sua conta Apple. Depois, a assinatura renova sozinha pelo mesmo valor, a menos que seja cancelada
            pelo menos 24 horas antes do fim do período, e a renovação é cobrada em até 24 horas antes do fim do período. Você gerencia e cancela em Ajustes do iPhone › seu nome › Assinaturas.{" "}
            <Link href="/termos-de-uso" className="underline font-bold">Termos de uso</Link> · <Link href="/politica-de-privacidade" className="underline font-bold">Política de privacidade</Link>
          </p>
        </>
      )}
    </div>
  );
}
