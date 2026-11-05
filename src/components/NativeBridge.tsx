"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isNativeApp, parseNativeCallback } from "@/lib/native";
import { BIOLOCK_AFTER_MS, canLockDevice, getBioLockEnabled, unlockWithBiometrics } from "@/lib/biometricLock";
import { startNativePushListeners } from "@/lib/nativePush";

// Liga o app iOS ao site: link de volta do login com Google, toque em notificação, barra de status e bloqueio com Face ID.
// No navegador comum este componente não faz nada (e nenhum plugin é carregado).
export function NativeBridge() {
  const [locked, setLocked] = useState(false);
  const busy = useRef(false);
  const lockedRef = useRef(false);
  lockedRef.current = locked;

  const unlock = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try { if (await unlockWithBiometrics()) setLocked(false); } finally { busy.current = false; }
  }, []);

  // Tranca só se a pessoa ligou o bloqueio E o aparelho consegue pedir Face ID/código (senão ela ficaria trancada para fora).
  const lockIfEnabled = useCallback(async () => {
    if (!getBioLockEnabled() || !(await canLockDevice())) return;
    setLocked(true);
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    document.documentElement.dataset.native = "1";
    let off = false;
    const cleanups: (() => void)[] = [];

    void lockIfEnabled();

    (async () => {
      try {
        const [{ App }, { Browser }] = await Promise.all([import("@capacitor/app"), import("@capacitor/browser")]);
        let leftAt = 0;
        const handles = await Promise.all([
          // Volta do login com Google: jakash://auth/callback?code=... -> conclui o login no site (dentro do WebView).
          App.addListener("appUrlOpen", ({ url }) => {
            const target = parseNativeCallback(url);
            if (!target) return;
            Browser.close().catch(() => undefined);
            window.location.assign(target);
          }),
          // Voltou do segundo plano depois de 5 min ou mais: pede Face ID de novo.
          App.addListener("appStateChange", ({ isActive }) => {
            if (!isActive) { if (!lockedRef.current && !busy.current) leftAt = Date.now(); return; }
            if (leftAt && Date.now() - leftAt >= BIOLOCK_AFTER_MS) void lockIfEnabled();
            leftAt = 0;
          }),
        ]);
        if (off) handles.forEach((h) => h.remove()); else cleanups.push(() => handles.forEach((h) => h.remove()));
      } catch { /* sem o plugin: o login com Google não volta sozinho */ }

      try {
        const stop = await startNativePushListeners();
        if (off) stop(); else cleanups.push(stop);
      } catch { /* sem notificações */ }

      try {
        // Barra de status acompanha o tema (a classe "dark" é colocada pelo next-themes).
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        const sync = () => { StatusBar.setStyle({ style: document.documentElement.classList.contains("dark") ? Style.Dark : Style.Light }).catch(() => undefined); };
        sync();
        const mo = new MutationObserver(sync);
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        cleanups.push(() => mo.disconnect());
      } catch { /* ignora */ }

      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide();
      } catch { /* ignora */ }
    })();

    return () => { off = true; cleanups.forEach((c) => c()); };
  }, [lockIfEnabled]);

  // Ao trancar, já pede Face ID.
  useEffect(() => { if (locked) void unlock(); }, [locked, unlock]);

  if (!locked) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Jakash bloqueado" className="fixed inset-0 z-[10000] flex flex-col items-center justify-center gap-5 bg-[#EEF0FB] dark:bg-[#0B0B0B] p-8 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/jacare.jpg" alt="" width={88} height={88} className="w-[88px] h-[88px] rounded-3xl shadow-md object-cover" />
      <p className="text-xl font-extrabold text-gray-900 dark:text-white">Jakash bloqueado</p>
      <p className="text-sm text-gray-500 max-w-xs">Use o Face ID ou o código do iPhone para abrir.</p>
      <button type="button" onClick={() => void unlock()} className="rounded-full bg-gradient-to-r from-brand-dark to-brand-accent px-8 py-3 text-base font-bold text-white">Desbloquear</button>
    </div>
  );
}
