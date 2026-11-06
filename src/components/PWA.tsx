"use client";

import { useEffect } from "react";

// Registra o service worker (cache e tela "sem conexão"). Não há mais tela de "instalar o app": o app vem pela App Store.
export function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
