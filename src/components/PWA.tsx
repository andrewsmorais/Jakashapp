"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// O Chrome (Android/desktop) dispara "beforeinstallprompt" uma vez; guardamos aqui para qualquer botão usar, mesmo montado depois.
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
let wired = false;
function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallEvent; notify(); });
  window.addEventListener("appinstalled", () => { deferred = null; notify(); });
}

export type Platform = "ios-safari" | "ios-other" | "android" | "desktop";
export type InstallState = { platform: Platform; installed: boolean; canPrompt: boolean; inApp: boolean; prompt: () => Promise<boolean> };

export function detectPlatform(ua: string, touchMac = false): Platform {
  const ios = /iPad|iPhone|iPod/.test(ua) || touchMac;
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua) ? "ios-other" : "ios-safari";
  return /Android/i.test(ua) ? "android" : "desktop";
}

export function useInstall(): InstallState {
  const [, force] = useState(0);
  const [info, setInfo] = useState<{ platform: Platform; installed: boolean; inApp: boolean }>({ platform: "desktop", installed: false, inApp: false });

  useEffect(() => {
    wire();
    const ua = navigator.userAgent;
    const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInfo({ platform: detectPlatform(ua, touchMac), installed, inApp: /FBAN|FBAV|Instagram|Line\/|; wv\)|WhatsApp|Snapchat|TikTok/i.test(ua) });
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  async function prompt() {
    if (!deferred) return false;
    const e = deferred;
    await e.prompt();
    const { outcome } = await e.userChoice;
    deferred = null; notify();
    return outcome === "accepted";
  }
  return { ...info, canPrompt: deferred !== null, prompt };
}

export function PWARegister() {
  useEffect(() => {
    wire();
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}

const btnCls = "flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-dark to-brand-accent dark:from-brand-vivid dark:to-brand-vivid px-4 py-2.5 text-sm font-bold text-white";

/** Botão das Configurações (fica embaixo do passo a passo). Instala direto quando o navegador permite; senão lembra de seguir os passos. */
export function InstallAppButton({ className = "" }: { className?: string }) {
  const { canPrompt, installed, prompt } = useInstall();
  const [hint, setHint] = useState(false);
  if (installed) return <p className={`text-sm font-bold text-brand-dark dark:text-brand-soft ${className}`}>✓ O Jakash já está instalado neste aparelho.</p>;
  return (
    <>
      <button onClick={async () => { if (canPrompt) { const ok = await prompt(); if (!ok) setHint(true); } else setHint(true); }} className={`${btnCls} ${className}`}>
        <Download size={16} /> Instalar app
      </button>
      {hint && <p role="status" className="text-xs text-gray-500 text-center max-w-xs">{canPrompt ? "Instalação cancelada. Você pode tentar de novo quando quiser." : "Este navegador não instala com um toque. Siga os passos acima."}</p>}
    </>
  );
}
