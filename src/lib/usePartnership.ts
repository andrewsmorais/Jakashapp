"use client";

import { useCallback, useEffect, useState } from "react";
import { useSupabase } from "@/lib/useSupabase";

export type Member = { id: string; name: string };

// `limit` = quantas pessoas (com o dono) o plano da casa comporta.
export type PartnershipState =
  | { state: "none"; limit: number }
  | { state: "pending"; code: string; expiresAt: string; limit: number }
  | {
      state: "accepted"; role: "owner" | "partner"; me: Member;
      partner: Member; // primeiro outro membro (compatibilidade)
      others: Member[]; count: number; limit: number;
      invite: { code: string; expiresAt: string } | null;
      since: string | null;
    };

// Cache curto por usuário para as telas não pedirem a parceria a cada navegação.
let cache: { userId: string; at: number; data: PartnershipState } | null = null;

// Estado da gestão compartilhada + nome de quem lançou (para as etiquetas "Você" / nome do parceiro).
export function usePartnership() {
  const { userId, ready } = useSupabase();
  const [data, setData] = useState<PartnershipState | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async (force = false) => {
    if (!userId) return;
    if (!force && cache && cache.userId === userId && Date.now() - cache.at < 60_000) { setData(cache.data); setError(false); return; }
    try {
      const res = await fetch("/api/partnership", { cache: "no-store" });
      if (!res.ok) { setError(true); return; }
      const json = (await res.json()) as PartnershipState;
      cache = { userId, at: Date.now(), data: json };
      setData(json);
      setError(false);
    } catch { setError(true); /* sem rede: mantém o que tinha na tela, mas para de "carregar" */ }
  }, [userId]);

  useEffect(() => { if (ready && userId) load(); }, [ready, userId, load]);
  useEffect(() => {
    const h = () => load(true);
    window.addEventListener("jakash:partnership", h);
    return () => window.removeEventListener("jakash:partnership", h);
  }, [load]);

  const others: Member[] = data?.state === "accepted" ? data.others : [];
  const partner = others[0] ?? null;
  // "Você" para o próprio usuário, primeiro nome de cada membro; vazio se não houver gestão compartilhada.
  const nameOf = (id: string | null | undefined) => {
    if (!id || others.length === 0) return "";
    if (id === userId) return "Você";
    const m = others.find((o) => o.id === id);
    return m ? m.name.split(" ")[0] : "";
  };

  return { data, error, partner, others, shared: others.length > 0, nameOf, userId, ready, refresh: () => load(true) };
}
