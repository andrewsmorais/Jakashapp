"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

// Sair da conta: antes de encerrar a sessão, tira ESTE aparelho da lista de avisos da conta. Assim os lembretes
// (com nomes e valores de contas) não continuam chegando num aparelho em que a pessoa já saiu.
// Não trava a saída: cada etapa tem prazo curto e falhas são ignoradas.
const withTimeout = <T,>(p: Promise<T>, ms = 3000) => Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);

async function releaseWebPush() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}

async function releaseNativePush() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return;
  const { disableNativePush } = await import("@/lib/nativePush");
  await disableNativePush();
}

export async function signOutEverywhereOnDevice(supabase: SupabaseClient) {
  await withTimeout(Promise.allSettled([releaseWebPush(), releaseNativePush()]));
  await supabase.auth.signOut();
}
