"use client";

import { useEffect, useState } from "react";
import { Check, Clock, ExternalLink, FileText, Receipt } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { PLANS, PLAN_FEATURES, PLAN_IDS, PLAN_TAGLINE, canonicalPlan, planPrice, type PlanId } from "@/lib/plans";
import { brl, formatDateBR } from "@/lib/format";
import { CheckoutButton } from "@/components/CheckoutButton";
import { IapPaywall } from "@/components/IapPaywall";
import { useIsNative } from "@/lib/useIsNative";
import { IOS_IAP_ENABLED } from "@/lib/native";
import { MANAGE_SUBSCRIPTIONS_URL } from "@/lib/nativePurchases";
import { BackTitle, Card, Label, Empty, ErrorNote, inputCls, btnGhostCls } from "@/components/ui/page";

type PlanInfo = { billingProvider: "apple" | "asaas" | null; asaasLive: boolean };

type Profile = { subscription_status: string; subscription_plan: string | null; subscription_expires_at: string | null; asaas_subscription_id: string | null };
type Invoice = { id: string; status: string; value: number; dueDate: string | null; createdAt: string | null; paidAt: string | null; invoiceUrl: string | null; receiptUrl: string | null };

const STATUS: Record<string, { label: string; tone: string }> = {
  trial: { label: "Em teste", tone: "bg-sky-500/15 text-sky-600" },
  active: { label: "Ativa", tone: "bg-emerald-500/15 text-emerald-600" },
  past_due: { label: "Em atraso", tone: "bg-amber-500/15 text-amber-600" },
  unpaid: { label: "Pendente", tone: "bg-amber-500/15 text-amber-600" },
  canceled: { label: "Cancelada", tone: "bg-gray-500/15 text-gray-500" },
};
const INVOICE_STATUS: Record<string, string> = {
  PENDING: "Aguardando pagamento", RECEIVED: "Paga", CONFIRMED: "Paga", OVERDUE: "Vencida", REFUNDED: "Estornada", RECEIVED_IN_CASH: "Paga",
};

export default function PlanosPage() {
  const { supabase, userId, ready } = useSupabase();
  const { native } = useIsNative();
  // No app iOS: sem preços nem compra pelo site (regra 3.1.1/3.1.3 da Apple). Com NEXT_PUBLIC_IOS_IAP=1 a compra é pela App Store.
  const iap = native && IOS_IAP_ENABLED;
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [tab, setTab] = useState<"sub" | "plans">("sub");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [doc, setDoc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("profiles").select("subscription_status,subscription_plan,subscription_expires_at,asaas_subscription_id").maybeSingle();
    setProfile(data as Profile | null);
    const res = await fetch("/api/asaas/invoices");
    const json = await res.json().catch(() => ({}));
    setInvoices(json.invoices ?? []);
    const info = await fetch("/api/plan", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setPlanInfo(info ? { billingProvider: info.billingProvider ?? null, asaasLive: Boolean(info.asaasLive) } : { billingProvider: null, asaasLive: false });
  }

  useEffect(() => { if (ready && userId) load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userId]);

  async function cancel() {
    if (!window.confirm("Cancelar a renovação da assinatura? Você continua com acesso até o fim do período já contratado.")) return;
    setError(null);
    const res = await fetch("/api/asaas/cancel", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error || "Não foi possível cancelar agora."); return; }
    setMsg("Renovação cancelada."); load();
  }

  const st = STATUS[profile?.subscription_status ?? ""] ?? { label: "Sem assinatura", tone: "bg-gray-500/15 text-gray-500" };
  // 'familia' (plano antigo, não é mais vendido) aparece como Pessoal.
  const planKey: PlanId | null = canonicalPlan(profile?.subscription_plan);
  const hasSub = Boolean(profile?.asaas_subscription_id);
  const canCancel = hasSub && profile?.subscription_status !== "canceled";
  const viaApple = planInfo?.billingProvider === "apple";
  const showPlansTab = !native || iap;
  const activeTab = showPlansTab ? tab : "sub";

  return (
    <div className="max-w-xl mx-auto pb-20">
      <BackTitle title="Planos" subtitle={native ? "Seu plano e a sua assinatura." : "Seu plano, faturas e cancelamento."} href="/configuracoes" />

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
                {native ? (iap && !planInfo?.asaasLive ? " Para continuar depois do teste, escolha um plano na aba Planos." : "") : " Se não cancelar antes do fim, a cobrança mensal começa automaticamente."}
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
            {!hasSub && !viaApple && (!native || (iap && !planInfo?.asaasLive)) && <button onClick={() => setTab("plans")} className={btnGhostCls + " w-full mt-4 !py-3"}>Ver planos</button>}
            {canCancel && <button onClick={cancel} className={btnGhostCls + " w-full mt-4 !py-3 !text-red-500"}>Cancelar renovação</button>}
            <ErrorNote message={error} />
            {msg && <p className="text-sm text-emerald-600 font-bold mt-3">{msg}</p>}
          </Card>

          {(!native || invoices.length > 0) && <div>
            <p className="font-extrabold text-lg mb-1">Faturas</p>
            <p className="text-sm text-gray-500 mb-3">Histórico das cobranças desta assinatura.</p>
            {invoices.length === 0 ? <Card><Empty>Nenhuma fatura ainda.</Empty></Card> : (
              <div className="space-y-3">
                {invoices.map((inv) => (
                  <Card key={inv.id} className="!p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="flex items-center gap-2 font-bold"><FileText size={16} /> {inv.id.slice(-8).toUpperCase()}</span>
                      <span className="text-xs font-bold rounded-full bg-gray-100 dark:bg-[#262626] px-3 py-1">{INVOICE_STATUS[inv.status] ?? inv.status}</span>
                    </div>
                    <dl className="grid grid-cols-2 gap-y-1 text-sm">
                      <dt className="text-gray-500">Valor</dt><dd className="font-bold text-right">{brl(inv.value)}</dd>
                      <dt className="text-gray-500">Vencimento</dt><dd className="font-bold text-right">{inv.dueDate ? formatDateBR(inv.dueDate) : "—"}</dd>
                      <dt className="text-gray-500">Pago em</dt><dd className="font-bold text-right">{inv.paidAt ? formatDateBR(inv.paidAt) : "—"}</dd>
                    </dl>
                    <div className="flex gap-2 mt-3">
                      {inv.invoiceUrl && <a href={inv.invoiceUrl} target="_blank" rel="noopener noreferrer" className={btnGhostCls + " flex-1 !py-2.5"}><ExternalLink size={14} /> Ver fatura</a>}
                      {inv.receiptUrl && <a href={inv.receiptUrl} target="_blank" rel="noopener noreferrer" className={btnGhostCls + " flex-1 !py-2.5"}><Receipt size={14} /> Comprovante</a>}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>}
        </div>
      )}

      {activeTab === "plans" && iap && (
        planInfo === null ? <Empty>Carregando…</Empty>
        : planInfo.asaasLive ? <Card><p className="text-sm text-gray-600 dark:text-gray-300">Você já tem uma assinatura ativa. Veja os detalhes na aba Assinatura.</p></Card>
        : userId ? <IapPaywall userId={userId} currentPlan={planKey} subscribedViaApple={viaApple} onPurchased={() => { setMsg("Assinatura ativada. Obrigado!"); setTab("sub"); load(); }} /> : null
      )}

      {activeTab === "plans" && !native && (
        <div className="space-y-4">
          <Card><Label>CPF ou CNPJ (necessário para emitir a cobrança)</Label><input className={inputCls} inputMode="numeric" placeholder="Somente números" value={doc} onChange={(e) => setDoc(e.target.value)} /></Card>
          {PLAN_IDS.map((id) => (
            <Card key={id} className={planKey === id ? "ring-2 ring-brand-dark" : ""}>
              <div className="flex items-start justify-between">
                <div><p className="text-xl font-extrabold">{PLANS[id].name}</p><p className="text-sm text-gray-500">{PLAN_TAGLINE[id]}</p></div>
                {hasSub ? null : <span className="text-xs font-bold rounded-full bg-emerald-500/15 text-emerald-600 px-3 py-1">7 dias grátis</span>}
              </div>
              <p className="my-5"><span className="text-4xl font-extrabold">{planPrice(id)}</span><span className="text-gray-500"> / mês</span></p>
              <ul className="space-y-2 mb-5">{PLAN_FEATURES[id].map((f) => <li key={f} className="flex gap-2 text-sm"><Check size={16} className="text-emerald-500 shrink-0 mt-0.5" />{f}</li>)}</ul>
              {planKey === id && profile?.subscription_status !== "canceled" ? <p className="text-center text-sm font-bold text-brand-dark dark:text-brand-soft">Seu plano atual</p> : <CheckoutButton plan={id} cpfCnpj={doc} switching={hasSub && profile?.subscription_status !== "canceled"} onChanged={() => { setMsg(`Plano alterado para ${PLANS[id].name}. A nova cobrança vale a partir da próxima renovação.`); setTab("sub"); load(); }} />}
            </Card>
          ))}
          <p className="text-xs text-gray-400">Cobrança mensal, cancele quando quiser. Pagamento por Pix, cartão ou boleto.</p>
        </div>
      )}
    </div>
  );
}
