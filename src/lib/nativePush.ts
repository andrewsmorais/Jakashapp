"use client";

import { samePathOnly } from "@/lib/native";

// Notificações do iPhone (APNs) pelo @capacitor/push-notifications. Só roda dentro do app (import dinâmico).
// A permissão é pedida na tela Configurações › Notificações, nunca na abertura do app.

const TOKEN_KEY = "jakash:apns-token";

function readToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function saveToken(t: string | null) {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* sem armazenamento: o servidor ainda guarda o token */ }
}

async function sendTokenToServer(token: string): Promise<boolean> {
  try {
    const res = await fetch("/api/push/native", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    if (res.ok) saveToken(token);
    return res.ok;
  } catch {
    return false;
  }
}

export type NativePushState = { permission: "granted" | "denied" | "prompt"; registered: boolean };

export async function getNativePushState(): Promise<NativePushState> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const p = await PushNotifications.checkPermissions();
    const permission = p.receive === "granted" ? "granted" : p.receive === "denied" ? "denied" : "prompt";
    return { permission, registered: permission === "granted" && Boolean(readToken()) };
  } catch {
    return { permission: "denied", registered: false };
  }
}

/** Pede a permissão (se preciso), registra no APNs e envia o token ao servidor. */
export async function enableNativePush(): Promise<{ ok: true } | { ok: false; denied?: boolean }> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return { ok: false, denied: true };

    const token = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), 15000);
      const handles: { remove: () => Promise<void> }[] = [];
      const done = () => { clearTimeout(timer); handles.forEach((h) => h.remove().catch(() => undefined)); };
      Promise.all([
        PushNotifications.addListener("registration", (t) => { done(); resolve(t.value); }),
        PushNotifications.addListener("registrationError", (e) => { done(); reject(new Error(e.error)); }),
      ]).then((hs) => { handles.push(...hs); return PushNotifications.register(); }).catch((e) => { done(); reject(e); });
    });
    return (await sendTokenToServer(token)) ? { ok: true } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/** Tira este aparelho da lista de avisos. Devolve quantos aparelhos/navegadores ainda recebem avisos (0 = pode desligar o canal). */
export async function disableNativePush(): Promise<number | null> {
  const token = readToken();
  let remaining: number | null = null;
  if (token) {
    try {
      const res = await fetch("/api/push/native", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && typeof d.remaining === "number") remaining = d.remaining;
    } catch { /* sem rede: o token some quando o servidor receber um 410 da Apple */ }
  }
  saveToken(null);
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.unregister();
  } catch { /* ignora */ }
  return remaining;
}

/**
 * Ligado uma vez na abertura do app: abre a tela certa ao tocar na notificação e, se a permissão já foi dada,
 * renova o token (ele pode mudar). Não pede permissão.
 */
export async function startNativePushListeners(): Promise<() => void> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const handles = await Promise.all([
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const path = samePathOnly((action.notification?.data as { url?: unknown } | undefined)?.url);
      if (path) window.location.assign(path);
    }),
    PushNotifications.addListener("registration", (t) => { void sendTokenToServer(t.value); }),
  ]);
  try {
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === "granted" && readToken()) await PushNotifications.register();
  } catch { /* ignora */ }
  return () => handles.forEach((h) => h.remove().catch(() => undefined));
}
