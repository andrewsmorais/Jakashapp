"use client";

import { PLAN_IDS, PLANS, planFromAppleProduct, type PlanId } from "@/lib/plans";

// Compra de assinatura dentro do app iOS (StoreKit 2) com @capgo/native-purchases. Só roda no app e com NEXT_PUBLIC_IOS_IAP=1.
// O app NUNCA decide quem tem plano: depois da compra manda o número da transação ao servidor (/api/apple/verify),
// que confirma com a Apple. O id do usuário vai como appAccountToken para a compra ficar presa a esta conta.

export const MANAGE_SUBSCRIPTIONS_URL = "itms-apps://apps.apple.com/account/subscriptions";

export type StoreProduct = { plan: PlanId; priceString: string };
export type PurchaseResult = { ok: true } | { ok: false; cancelled?: boolean; message: string };

const wasCancelled = (e: unknown) => /cancel/i.test(String((e as { message?: string })?.message ?? e));

/** Preços reais da App Store (já no formato da moeda do usuário). Produto que ainda não existe na App Store Connect não aparece. */
export async function loadStoreProducts(): Promise<StoreProduct[]> {
  try {
    const { NativePurchases, PURCHASE_TYPE } = await import("@capgo/native-purchases");
    const { products } = await NativePurchases.getProducts({ productIdentifiers: PLAN_IDS.map((id) => PLANS[id].appleProductId), productType: PURCHASE_TYPE.SUBS });
    return products.flatMap((p) => { const plan = planFromAppleProduct(p.identifier); return plan ? [{ plan, priceString: p.priceString }] : []; });
  } catch {
    return [];
  }
}

async function verifyOnServer(transactionId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch("/api/apple/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactionId }) });
    const d = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, message: d.error || "Não foi possível confirmar a compra. Toque em Restaurar compras." };
  } catch {
    return { ok: false, message: "Sem conexão para confirmar a compra. Toque em Restaurar compras quando voltar." };
  }
}

export async function purchasePlan(plan: PlanId, userId: string): Promise<PurchaseResult> {
  try {
    const { NativePurchases, PURCHASE_TYPE } = await import("@capgo/native-purchases");
    const tx = await NativePurchases.purchaseProduct({
      productIdentifier: PLANS[plan].appleProductId,
      productType: PURCHASE_TYPE.SUBS,
      appAccountToken: userId,
      autoAcknowledgePurchases: false, // só encerra a transação depois que o servidor confirmar
    });
    const v = await verifyOnServer(tx.transactionId);
    if (!v.ok) return { ok: false, message: v.message };
    await NativePurchases.finishTransaction({ transactionId: tx.transactionId }).catch(() => undefined);
    return { ok: true };
  } catch (e) {
    if (wasCancelled(e)) return { ok: false, cancelled: true, message: "" };
    return { ok: false, message: "Não foi possível concluir a compra. Tente de novo." };
  }
}

/** Restaurar compras: sincroniza com a App Store e confirma no servidor a assinatura ativa deste Apple ID. */
export async function restorePurchases(userId: string): Promise<PurchaseResult> {
  try {
    const { NativePurchases, PURCHASE_TYPE } = await import("@capgo/native-purchases");
    await NativePurchases.restorePurchases();
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.SUBS, onlyCurrentEntitlements: true });
    const ours = purchases
      .filter((p) => planFromAppleProduct(p.productIdentifier) && p.isActive !== false)
      .sort((a, b) => Number(String(b.appAccountToken ?? "").toLowerCase() === userId) - Number(String(a.appAccountToken ?? "").toLowerCase() === userId)
        || String(b.expirationDate ?? "").localeCompare(String(a.expirationDate ?? "")));
    const best = ours[0];
    if (!best) return { ok: false, message: "Não encontramos nenhuma assinatura ativa neste Apple ID." };
    const v = await verifyOnServer(best.transactionId);
    return v.ok ? { ok: true } : { ok: false, message: v.message };
  } catch (e) {
    if (wasCancelled(e)) return { ok: false, cancelled: true, message: "" };
    return { ok: false, message: "Não foi possível restaurar agora. Tente de novo." };
  }
}
