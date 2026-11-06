"use client";

import { useEffect, useState } from "react";
import { Clock, ExternalLink } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { PLANS, canonicalPlan, planPrice, type PlanId } from "@/lib/plans";
import { formatDateBR } from "@/lib/format";
import { IapPaywall } from "@/components/IapPaywall";
import { useIsNative } from "@/lib/useIsNative";
import { IOS_IAP_ENABLED } from "@/lib/native";
import { MANAGE_SUBSCRIPTIONS_URL } from "@/lib/nativePurchases";
import { BackTitle, Card, Empty, btnGhostCls } from "@/components/ui/page";

type PlanInfo = { billingProvider: "apple" | null };

type Profile = { subscription_status: string; subscription_plan: string | null; subscription_expires_at: string | null };

const STATUS: Record<string, { label: string; tone: string }> = {
  trial: { label: "Em teste", tone: "bg-sky-500/15 text-sky-600" },
  active: { label: "Ativa", tone: "bg-emerald-500/15 text-emerald-600" },
  past_due: { label: "Em atraso", tone: "bg-amber-500/15 text-amber-600" },
  unpaid: { label: "Pendente", tone: "bg-amber-500/15 text-amber-600" },
  canceled: { label: "Cancelada", tone: "bg-gray-500/15 text-gray-500" },
};

// A venda é só pela App Store. Aqui a pessoa vê o plano e o status (no site e no app); a compra acontece no app do iPhone.
export default function PlanosPage() {
  const { supabase, userId, ready } = useSupabase();
  const { native } = useIsNative();
  // No app iOS: sem preços nem compra pelo site (regra 3.1.1/3.1.3 da Apple). Com NEXT_PUBLIC_IOS_IAP=1 a compra é pela App Store.
  const iap = native && IOS_IAP_ENABLED;
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [tab, setTab] = useState<"sub" | "plans">("sub");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("profiles").select("subscription_status,subscription_plan,subscription_expires_at").maybeSingle();
    setProfile(data as Profile | null);
    const info = await fetch("/api/plan", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setPlanInfo({ billingProvider: info?.billingProvider === "apple" ? "apple" : null });
  }

  useEffect(() => { if (ready && userId) load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userId]);

  const st = STATUS[profile?.subscription_status ?? ""] ?? { label: "Sem assinatura", tone: "bg-gray-500/15 text-gray-500" };
  // 'familia' (plano antigo, não é mais vendido) aparece como Pessoal.
  const planKey: PlanId | null = canonicalPlan(profile?.subscription_plan);
  const viaApple = planInfo?.billingProvider === "apple";
  const canceled = profile?.subscription_status === "canceled";
  const showPlansTab = iap;
  const activeTab = showPlansTab ? tab : "sub";

  return (
    <div className="max-w-xl mx-auto pb-20">
      <BackTitle title="Planos" subtitle="Seu plano e a sua assinatura." href="/configuracoes" />

      {showPlansTab && <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-brand-dark/10 dark:bg-[#161616] mb-5">
        {([["sub", "Assinatura"], ["plans", "Planos"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`py-2.5 rounded-xl text-sm font-bold ${tab === k ? "bg-white dark:bg-[#262626] shadow-sm" : "text-gray-500"}`}>{l}</button>
        ))}
      </div>}

      {activeTab === "sub" && (
        <div className="space-y-4">
          <Card>
            <p className="text-xs font-bold text-gray-500 mb-3">STATUS DA ASSINATURA</p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-brand-dark/10 dark:bg-[#262626] text-brand-dark dark:text-brand-soft flex items-center justify-center"><Clock size={22} /></div>
              <div><p className="font-extrabold">{planKey ? PLANS[planKey].name : "Nenhum plano ativo"}</p><span className={`inline-block mt-1 text-xs font-bold rounded-full px-3 py-1 ${st.tone}`}>{st.label}</span></div>
            </div>
            {profile?.subscription_status === "trial" && profile.subscription_expires_at && (
              <p className="text-sm text-sky-700 dark:text-sky-300 bg-sky-500/10 rounded-2xl p-4 mt-4">
                Seu período de teste está ativo até {formatDateBR(profile.subscription_expires_at.slice(0, 10))}.
                {native ? (iap ? " Para continuar depois do teste, escolha um plano na aba Planos." : "") : " Para continuar depois do teste, assine pelo app do Jakash na App Store."}
              </p>
            )}
            {planKey && (
              <dl className="mt-4 space-y-2 text-sm border-t border-gray-100 dark:border-[#262626] pt-4">
                <div className="flex justify-between"><dt className="text-gray-500">Plano</dt><dd className="font-bold">{PLANS[planKey].name}</dd></div>
                {!native && <div className="flex justify-between"><dt className="text-gray-500">Valor</dt><dd className="font-bold">{planPrice(planKey)} / mês</dd></div>}
                {profile?.subscription_expires_at && <div className="flex justify-between"><dt className="text-gray-500">{profile.subscription_status === "trial" ? "Fim do teste" : "Próxima renovação"}</dt><dd className="font-bold">{formatDateBR(profile.subscription_expires_at.slice(0, 10))}</dd></div>}
              </dl>
            )}
            {viaApple && (
              <div className="mt-4 text-sm text-gray-600 dark:text-gray-300">
                <p>Assinatura feita pela App Store.</p>
                {native ? <a href={MANAGE_SUBSCRIPTIONS_URL} className={btnGhostCls + " w-full mt-3 !py-3"}><ExternalLink size={16} /> Gerenciar assinatura</a> : <p className="text-xs text-gray-500 mt-1">Para alterar ou cancelar, use Ajustes do iPhone › seu nome › Assinaturas.</p>}
              </div>
            )}
            {!viaApple && (!planKey || canceled) && !native && (
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-4">A assinatura é feita pelo app do Jakash na App Store. Entre nele com esta mesma conta e o plano vale aqui também.</p>
            )}
            {!viaApple && iap && <button onClick={() => setTab("plans")} className={btnGhostCls + " w-full mt-4 !py-3"}>Ver planos</button>}
            {msg && <p className="text-sm text-emerald-600 font-bold mt-3">{msg}</p>}
          </Card>
        </div>
      )}

      {activeTab === "plans" && iap && (
        planInfo === null ? <Empty>Carregando…</Empty>
        : userId ? <IapPaywall userId={userId} currentPlan={planKey} subscribedViaApple={viaApple} onPurchased={() => { setMsg("Assinatura ativada. Obrigado!"); setTab("sub"); load(); }} /> : null
      )}
    </div>
  );
}
