"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Mail, Save } from "lucide-react";
import { useSupabase } from "@/lib/useSupabase";
import { isNativeApp } from "@/lib/native";
import { useIsNative } from "@/lib/useIsNative";
import { disableNativePush, enableNativePush, getNativePushState } from "@/lib/nativePush";
import { BackTitle, Card, Label, Toggle, ErrorNote, inputCls, btnCls, btnGhostCls } from "@/components/ui/page";

const WHEN = [
  { id: "on_due", label: "No dia do vencimento" },
  { id: "1_day", label: "1 dia antes" },
  { id: "3_days", label: "3 dias antes" },
  { id: "7_days", label: "7 dias antes" },
];

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyToBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

type Device = { supported: boolean; denied: boolean; on: boolean; needsInstall: boolean };

export default function NotificacoesPage() {
  const { supabase, userId, ready } = useSupabase();
  const { native } = useIsNative();
  const [n, setN] = useState({ enabled: true, email: true, when: "on_due" });
  const [device, setDevice] = useState<Device | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshDevice = useCallback(async () => {
    // App iOS: avisos pelo APNs (a permissão só é pedida aqui, ao ligar o botão).
    if (isNativeApp()) {
      const st = await getNativePushState();
      setDevice({ supported: true, denied: st.permission === "denied", on: st.registered, needsInstall: false });
      return;
    }
    const needsInstall = isIos() && !isStandalone();
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) { setDevice({ supported: false, denied: false, on: false, needsInstall }); return; }
    let on = false;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      on = Boolean(reg && (await reg.pushManager.getSubscription()));
    } catch { /* sem acesso ao service worker */ }
    setDevice({ supported: true, denied: Notification.permission === "denied", on: on && Notification.permission === "granted", needsInstall });
  }, []);

  useEffect(() => {
    if (!ready || !userId) return;
    supabase.from("profiles").select("notify_enabled,notify_email,notify_when").maybeSingle().then(({ data }) => {
      if (data) { setN({ enabled: data.notify_enabled, email: data.notify_email, when: data.notify_when }); }
    });
    refreshDevice();
  }, [ready, userId, supabase, refreshDevice]);

  async function save() {
    const { error: err } = await supabase.from("profiles").update({ notify_enabled: n.enabled, notify_email: n.email, notify_when: n.when }).eq("id", userId);
    if (err) { setError("Não foi possível salvar."); setMsg(null); return; }
    setError(null); setMsg("Configurações salvas.");
  }

  // Os avisos no aparelho valem só para este navegador e pedem permissão, por isso são aplicados na hora (sem o botão Salvar).
  async function setPush(on: boolean) {
    setError(null); setMsg(null); setBusy(true);
    try {
      if (isNativeApp()) {
        if (on) {
          const r = await enableNativePush();
          if (!r.ok) { setError(r.denied ? "Para receber os avisos, permita as notificações do Jakash em Ajustes › Jakash › Notificações." : "Não foi possível ativar os avisos agora. Tente de novo."); return; }
          await supabase.from("profiles").update({ notify_push: true }).eq("id", userId);
          setMsg("Avisos ativados neste aparelho.");
        } else {
          const remaining = await disableNativePush();
          if (remaining === 0) await supabase.from("profiles").update({ notify_push: false }).eq("id", userId);
          setMsg("Avisos desativados neste aparelho.");
        }
        return;
      }
      if (on) {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") { setError("Para receber os avisos, permita as notificações do Jakash nas configurações do navegador."); return; }
        if (!(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register("/sw.js");
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID) as BufferSource }));
        const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
        if (!res.ok) throw new Error("subscribe");
        await supabase.from("profiles").update({ notify_push: true }).eq("id", userId);
        setMsg("Avisos ativados neste aparelho.");
      } else {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe();
          const res = await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint }) });
          const d = await res.json().catch(() => ({}));
          if (res.ok && d.remaining === 0) await supabase.from("profiles").update({ notify_push: false }).eq("id", userId);
        }
        setMsg("Avisos desativados neste aparelho.");
      }
    } catch {
      setError("Não foi possível alterar os avisos deste aparelho. Tente de novo.");
    } finally {
      setBusy(false);
      refreshDevice();
    }
  }

  async function sendTest() {
    setError(null); setMsg(null); setBusy(true);
    const res = await fetch("/api/push/test", { method: "POST" }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    setBusy(false);
    if (res?.ok) setMsg("Teste enviado. Se não aparecer em alguns segundos, desative e ative de novo.");
    else setError(d?.error || "Não foi possível enviar o teste.");
  }

  // Teste de e-mail: manda uma mensagem de verdade para o e-mail da sua conta.
  async function sendEmailTest() {
    setError(null); setMsg(null); setBusy(true);
    const res = await fetch("/api/notifications/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: "email" }) }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    setBusy(false);
    if (res?.ok) setMsg("E-mail de teste enviado. Olhe também a caixa de spam.");
    else setError(d?.error || "Não foi possível enviar o teste.");
  }

  const pushHint = native ? (device?.denied ? "Bloqueado no iPhone. Libere em Ajustes › Jakash › Notificações." : "Receba o aviso aqui mesmo com o app fechado. Vale só para este aparelho.")
    : !VAPID ? "Ainda não está ativado neste ambiente."
    : device?.needsInstall ? "No iPhone/iPad, instale o Jakash na Tela de Início (Compartilhar › Adicionar à Tela de Início) e abra por lá."
    : device && !device.supported ? "Este navegador não permite avisos no aparelho."
    : device?.denied ? "Bloqueado no navegador. Libere as notificações deste site nas configurações."
    : "Receba o aviso aqui mesmo com o app fechado. Vale só para este aparelho.";
  const pushDisabled = (!native && !VAPID) || !device || !device.supported || device.denied || busy;

  return (
    <div className="max-w-xl mx-auto pb-20">
      <BackTitle title="Notificações" subtitle="Lembretes de contas a pagar, a receber e faturas de cartão." href="/configuracoes" />
      <Card className="space-y-3">
        <Toggle checked={n.enabled} onChange={(v) => setN({ ...n, enabled: v })} label="Habilitar notificações" />
        <div className={pushDisabled ? "opacity-60 pointer-events-none" : ""}>
          <Toggle checked={Boolean(device?.on)} onChange={setPush} label="Avisos neste aparelho" hint={pushHint} />
        </div>
        {device?.on && (
          <button onClick={sendTest} disabled={busy} className={btnGhostCls + " w-full"}><BellRing size={16} /> Enviar teste</button>
        )}
        <Toggle checked={n.email} onChange={(v) => setN({ ...n, email: v })} label="Notificações via e-mail" hint="Enviadas para o e-mail da sua conta." />
        {n.email && (
          <button onClick={sendEmailTest} disabled={busy} className={btnGhostCls + " w-full"}><Mail size={16} /> Enviar teste por e-mail</button>
        )}
        <div className="pt-2"><Label>Quando notificar</Label>
          <select className={inputCls} value={n.when} onChange={(e) => setN({ ...n, when: e.target.value })}>
            {WHEN.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select></div>
        <button onClick={save} className={btnCls + " w-full mt-2"}><Save size={16} /> Salvar configurações</button>
        <ErrorNote message={error} />
        {msg && <p className="text-sm text-emerald-600 font-bold">{msg}</p>}
        <p className="text-xs text-gray-400">Os lembretes saem uma vez por dia, de manhã (por volta das 8h), com o que vence na data escolhida. Na gestão compartilhada, entram também os vencimentos da outra pessoa.</p>
      </Card>
    </div>
  );
}
