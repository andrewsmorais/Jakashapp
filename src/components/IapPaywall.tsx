"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { PLANS, PLAN_FEATURES, PLAN_IDS, PLAN_TAGLINE, type PlanId } from "@/lib/plans";
import { loadStoreProducts, MANAGE_SUBSCRIPTIONS_URL, purchasePlan, restorePurchases, type StoreProduct } from "@/lib/nativePurchases";
import { Card, ErrorNote, btnCls, btnGhostCls } from "@/components/ui/page";

type Props = {
  userId: string;
  currentPlan?: PlanId | null;
  /** true = já assina pela App Store: mostra "Gerenciar assinatura". */
  subscribedViaApple?: boolean;
  onPurchased: () => void;
};

// Planos e compra pela App Store (Apple IAP). Só é montado no app iOS com NEXT_PUBLIC_IOS_IAP=1.
export function IapPaywall({ userId, currentPlan, subscribedViaApple, onPurchased }: Props) {
  const [products, setProducts] = useState<StoreProduct[] | null>(null);
  const [busy, setBusy] = useState<PlanId | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadStoreProducts().then(setProducts); }, []);

  async function run(key: PlanId | "restore", fn: () => ReturnType<typeof purchasePlan>) {
    setBusy(key); setError(null);
    const r = await fn();
    setBusy(null);
    if (r.ok) onPurchased(); else if (!r.cancelled) setError(r.message);
  }

  return (
    <div className="space-y-4">
      {PLAN_IDS.map((id) => {
        const price = products?.find((p) => p.plan === id)?.priceString;
        const isCurrent = currentPlan === id && subscribedViaApple;
        return (
          <Card key={id} className={isCurrent ? "ring-2 ring-brand-dark" : ""}>
            <div><p className="text-xl font-extrabold">{PLANS[id].name}</p><p className="text-sm text-gray-500">{PLAN_TAGLINE[id]}</p></div>
            <p className="my-5">
              {price ? <><span className="text-4xl font-extrabold">{price}</span><span className="text-gray-500"> / mês</span></> : <span className="text-sm text-gray-500">{products === null ? "Carregando…" : "Indisponível no momento."}</span>}
            </p>
            <ul className="space-y-2 mb-5">{PLAN_FEATURES[id].map((f) => <li key={f} className="flex gap-2 text-sm"><Check size={16} className="text-emerald-500 shrink-0 mt-0.5" />{f}</li>)}</ul>
            {isCurrent ? <p className="text-center text-sm font-bold text-brand-dark dark:text-brand-soft">Seu plano atual</p> : (
              <button type="button" disabled={!price || busy !== null} onClick={() => void run(id, () => purchasePlan(id, userId))} className={btnCls + " w-full disabled:opacity-60"}>
                {busy === id ? <><Loader2 size={16} className="animate-spin" /> Processando…</> : price ? `Assinar ${PLANS[id].name}` : "Indisponível"}
              </button>
            )}
          </Card>
        );
      })}

      <ErrorNote message={error} />
      <button type="button" disabled={busy !== null} onClick={() => void run("restore", () => restorePurchases(userId))} className={btnGhostCls + " w-full !py-3 disabled:opacity-60"}>
        {busy === "restore" ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} Restaurar compras
      </button>
      {subscribedViaApple && <a href={MANAGE_SUBSCRIPTIONS_URL} className={btnGhostCls + " w-full !py-3"}><ExternalLink size={16} /> Gerenciar assinatura</a>}

      <p className="text-xs text-gray-500 leading-relaxed">
        Assinatura mensal com renovação automática. O pagamento é cobrado na sua conta Apple na confirmação da compra. A assinatura renova sozinha todo mês, pelo mesmo valor,
        a menos que seja cancelada pelo menos 24 horas antes do fim do período atual, e a renovação é cobrada em até 24 horas antes do fim do período.
        Você gerencia e cancela em Ajustes do iPhone › seu nome › Assinaturas.{" "}
        <Link href="/termos-de-uso" className="underline font-bold">Termos de uso</Link> · <Link href="/politica-de-privacidade" className="underline font-bold">Política de privacidade</Link>
      </p>
    </div>
  );
}
