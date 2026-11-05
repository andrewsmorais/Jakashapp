"use client";

import { useEffect } from "react";
import { useSupabase } from "@/lib/useSupabase";

const KEY = "jakash:ref";
const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

// Guarda o código do link de indicação (?ref=CODIGO) até a pessoa criar a conta e entrar.
export function RefCapture() {
  useEffect(() => {
    try {
      const ref = (new URLSearchParams(window.location.search).get("ref") ?? "").trim().toUpperCase();
      if (CODE_RE.test(ref)) localStorage.setItem(KEY, ref);
    } catch { /* navegação privada: sem indicação */ }
  }, []);
  return null;
}

// Depois do login, registra a indicação guardada. Se o servidor recusar (conta antiga, código próprio etc.), descarta o código.
export function ReferralSync() {
  const { userId, ready } = useSupabase();
  useEffect(() => {
    if (!ready || !userId) return;
    let code: string | null = null;
    try { code = localStorage.getItem(KEY); } catch { return; }
    if (!code) return;
    fetch("/api/referral/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) })
      .then(() => { try { localStorage.removeItem(KEY); } catch { /* ignora */ } })
      .catch(() => { /* sem rede: tenta de novo no próximo acesso */ });
  }, [ready, userId]);
  return null;
}
